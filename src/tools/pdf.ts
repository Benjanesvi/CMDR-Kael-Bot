// src/tools/pdf.ts
import pdf from "pdf-parse/lib/pdf-parse.js";
import { BGS_PDF_URL } from "../config.js";

let chunks: { text: string }[] = [];
let loaded = false;

/**
 * Fetch and parse the remote PDF, chunk into paragraphs.
 * Call this at startup: await loadPDF();
 */
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
    // Basic chunking: split on double newlines, trim, keep non-empty.
    const paras = raw.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const minLen = 80;
    chunks = paras.map(t => ({ text: t })).filter(c => c.text.length >= minLen);
    console.log(`[pdf] Loaded PDF, ${chunks.length} chunks.`);
  } catch (err) {
    console.error("[pdf] Error loading PDF:", err);
    chunks = [];
  } finally {
    loaded = true;
  }
}

/**
 * Simple search: returns the first N chunks that include the query terms (case-insensitive).
 * This is intentionally simple. Replace with embeddings if you have them.
 */
export function queryPDF(query: string, limit = 5) {
  if (!loaded) {
    console.warn("[pdf] queryPDF called before loadPDF completed.");
  }
  if (!query) return [];
  const q = query.toLowerCase();
  const out = [];
  for (const c of chunks) {
    const text = c.text.toLowerCase();
    if (text.includes(q)) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
