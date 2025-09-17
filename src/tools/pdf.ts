// src/tools/pdf.ts
// PDF loader with persistent in-memory cache (TTL), safer fetch, and the same public API.
// Import path restored to 'pdf-parse/lib/pdf-parse.js' to match your declaration file.

import pdf from "pdf-parse/lib/pdf-parse.js";
import { BGS_PDF_URL } from "../config.js";
import { Buffer } from "node:buffer";

let chunks: { text: string }[] = [];
let loaded = false;
let loadedAt = 0;

const TTL = Number.isFinite(Number(process.env.PDF_TTL_MS))
  ? Number(process.env.PDF_TTL_MS)
  : 6 * 60 * 60 * 1000; // 6h
const TIMEOUT = Number.isFinite(Number(process.env.HTTP_TIMEOUT_MS))
  ? Number(process.env.HTTP_TIMEOUT_MS)
  : 30_000;

export async function loadPDF(force = false) {
  if (!BGS_PDF_URL) {
    console.warn("[pdf] BGS_PDF_URL not configured.");
    loaded = true;
    return;
  }
  const fresh = loaded && Date.now() - loadedAt < TTL;
  if (fresh && !force) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    console.log("[pdf] Fetching PDF from:", BGS_PDF_URL);
    const res = await fetch(BGS_PDF_URL, {
      method: "GET",
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "User-Agent": "CMDR-Kael/1.0 (+render)",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}${text ? ` :: ${text.slice(0, 200)}` : ""}`);
    }

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const data = await pdf(buf);

    const raw = String(data.text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\u00A0/g, " ");

    const paras = raw
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const minLen = 80;
    chunks = paras.map((t) => ({ text: t })).filter((c) => c.text.length >= minLen);

    loaded = true;
    loadedAt = Date.now();
    console.log(`[pdf] Loaded PDF, ${chunks.length} chunks.`);
  } catch (err) {
    console.error("[pdf] Error loading PDF:", err);
    if (!loaded) chunks = [];
    loaded = true; // avoid hammering on repeated calls
  } finally {
    clearTimeout(timeout);
  }
}

export function queryPDF(query: string, limit = 5) {
  if (!loaded) console.warn("[pdf] queryPDF before loadPDF finished.");
  if (!query) return [];
  const q = query.toLowerCase();
  const out: { text: string }[] = [];
  for (const c of chunks) {
    if (c.text.toLowerCase().includes(q)) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
