// src/tools/pdf.ts
import pdf from "pdf-parse/lib/pdf-parse.js";
import { BGS_PDF_URL } from "../config.js";

let chunks: { text: string }[] = [];
let loaded = false;

export async function loadPDF() {
  if (loaded) return;
  if (!BGS_PDF_URL) {
    console.warn("[pdf] BGS_PDF_URL not configured.");
    loaded = true;
    return;
  }
  try {
    console.log("[pdf] Fetching PDF from:", BGS_PDF_URL);
    const res = await fetch(BGS_PDF_URL);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const data = await pdf(buf);
    const raw = (data.text || "").replace(/\r\n/g, "\n");
    const paras = raw.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
    const minLen = 80;
    chunks = paras.map((t: string) => ({ text: t }))
                  .filter((c: { text: string }) => c.text.length >= minLen);
    console.log(`[pdf] Loaded PDF, ${chunks.length} chunks.`);
  } catch (err) {
    console.error("[pdf] Error loading PDF:", err);
    chunks = [];
  } finally {
    loaded = true;
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
