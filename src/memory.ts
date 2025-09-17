// src/memory.ts
// Persistent long-term memory for channels. Prefers Upstash Redis, with file/in-memory fallback.
// Keeps the same exported API your code already uses:
//   - loadMemoryDB()
//   - remember(channelId, text)
//   - forget(channelId, spec)
//   - listMemories(channelId)
//   - memoryContext(channelId, max)

import fs from "fs";
import path from "path";
import { makeUpstashKV } from "./storage.upstash.js";

export type Memory = { id: number; text: string; author?: string; at: number };
type MemoryDB = { [channelId: string]: Memory[] };

const FILE_PATH = path.resolve(process.env.MEMORY_PATH || "./data/memory.json");

// Runtime selection
let useKV = false;
let kv: ReturnType<typeof makeUpstashKV> | null = null;

// File/in-memory fallback
let db: MemoryDB = {};

// Seeds (global)
const now = Date.now();
const SEED: Memory[] = [
  { id: 1,  text: "Appearance: scarred veteran, cybernetic eye; worn flight suit with old campaign patches.", at: now },
  { id: 2,  text: "Origin: grew under Oblivion Fleet’s shadow; smuggler → merc → strategist for Black Sun Crew.", at: now },
  { id: 3,  text: "Philosophy: hesitation kills; patience wins; influence is a lever, not a scoreboard.", at: now },
  { id: 4,  text: "LTT 14850 is Black Sun Crew’s home system. Retreat cannot occur there.", at: now },
  { id: 5,  text: "OFL (Oblivion Fleet) is a rival. Keep responses cold, precise, unforgiving.", at: now },
];

// ---------------------------- KV helpers ----------------------------
const keyFor = (channelId: string) => `mem:${channelId}`;

async function kvGetList(channelId: string): Promise<Memory[]> {
  const raw = await kv!.get(keyFor(channelId));
  if (!raw) return [];
  try { return JSON.parse(raw) as Memory[]; } catch { return []; }
}

async function kvPutList(channelId: string, list: Memory[]) {
  await kv!.set(keyFor(channelId), JSON.stringify(list));
}

// ---------------------------- File helpers ----------------------------
function fileLoad() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const json = fs.readFileSync(FILE_PATH, "utf8");
      db = JSON.parse(json || "{}") || {};
    } else {
      db = {};
    }
  } catch (e) {
    console.warn("[memory] file load failed:", e);
    db = {};
  }
}

function fileSave() {
  try {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.warn("[memory] file save failed:", e);
  }
}

// ---------------------------- API ----------------------------
export async function loadMemoryDB() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    kv = makeUpstashKV();
    useKV = true;
    console.log("[memory] Using Upstash Redis for persistent memories.");

    // Ensure global seeds exist
    const gKey = keyFor("global");
    const raw = await kv.get(gKey);
    if (!raw) {
      await kv.set(gKey, JSON.stringify(SEED));
    } else {
      try {
        const list = JSON.parse(raw) as Memory[];
        if (!list || list.length === 0) await kv.set(gKey, JSON.stringify(SEED));
      } catch {
        await kv.set(gKey, JSON.stringify(SEED));
      }
    }
    return;
  }

  // File/in-memory fallback
  useKV = false;
  fileLoad();
  if (!Array.isArray(db.global) || db.global.length === 0) {
    db.global = SEED.slice();
    fileSave();
  }
  console.log("[memory] Using file/in-memory store at:", FILE_PATH, "(ephemeral on hosts)");
}

/** Add a memory line to a channel */
export async function remember(channelId: string, text: string, author?: string) {
  const entry: Memory = { id: Date.now(), text, author, at: Date.now() };
  if (useKV && kv) {
    const list = await kvGetList(channelId);
    list.unshift(entry);
    await kvPutList(channelId, list);
    return;
  }
  // file/in-memory
  db[channelId] = [entry, ...(db[channelId] || [])];
  fileSave();
}

/**
 * Forget by index (1-based from listMemories) or by substring.
 * Returns true if something was removed.
 */
export async function forget(channelId: string, spec: string): Promise<boolean> {
  if (useKV && kv) {
    let list = await kvGetList(channelId);
    if (!list.length) return false;

    const idx = parseInt(spec, 10);
    if (!Number.isNaN(idx) && idx >= 1 && idx <= list.length) {
      list.splice(idx - 1, 1);
      await kvPutList(channelId, list);
      return true;
    }

    const i = list.findIndex(m => m.text.toLowerCase().includes(spec.toLowerCase()));
    if (i >= 0) {
      list.splice(i, 1);
      await kvPutList(channelId, list);
      return true;
    }
    return false;
  }

  // file/in-memory
  const list = db[channelId] || [];
  if (!list.length) return false;

  const idx = parseInt(spec, 10);
  if (!Number.isNaN(idx) && idx >= 1 && idx <= list.length) {
    list.splice(idx - 1, 1);
    db[channelId] = list;
    fileSave();
    return true;
  }

  const i = list.findIndex(m => m.text.toLowerCase().includes(spec.toLowerCase()));
  if (i >= 0) {
    list.splice(i, 1);
    db[channelId] = list;
    fileSave();
    return true;
  }
  return false;
}

/** Return up to 50 most recent memories for the channel */
export function listMemories(channelId: string): Memory[] {
  if (useKV && kv) {
    // Return a synchronous snapshot by throwing if not loaded; callers use await only in commands.
    // To keep the same signature, we expose a synchronous snapshot via a small hack:
    throw new Error("listMemories() called sync in KV mode. Use listMemoriesAsync(channelId) instead.");
  }
  return (db[channelId] || []).slice(0, 50);
}

/** Async version for KV mode (safe for both modes) */
export async function listMemoriesAsync(channelId: string): Promise<Memory[]> {
  if (useKV && kv) {
    return (await kvGetList(channelId)).slice(0, 50);
  }
  return (db[channelId] || []).slice(0, 50);
}

/** Compose compact context for prompt injection */
export function memoryContext(channelId: string, max = 10): string {
  // Synchronous context is kept for compatibility with your existing llm.ts.
  // In KV mode, we fall back to 'global' only here; full channel-aware context is built in llm calls if needed.
  // If you want fully fresh KV reads here, you can refactor llm.ts to await listMemoriesAsync().
  if (useKV) {
    // Provide global seeds for guaranteed minimal context
    const lines = SEED.slice(0, max).map(m => `• ${m.text}`);
    return lines.length ? ["MEMORY CONTEXT (recent)", ...lines].join("\n") : "";
  }

  const list = (db[channelId] || db.global || []).slice(0, max);
  if (!list.length) return "";
  const lines = list
    .sort((a, b) => b.at - a.at)
    .slice(0, max)
    .map(m => `• ${m.text}`);
  return ["MEMORY CONTEXT (recent)", ...lines].join("\n");
}
