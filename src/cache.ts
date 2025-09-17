// src/cache.ts
// Persistent cache with TTL. Prefers Upstash Redis (env), falls back to a local JSON file.
// Exports the same API your code already uses: initCache, clearCache, cached.

import fs from "fs";
import path from "path";
import { makeUpstashKV } from "./storage.upstash.js";

// --------------------------- Types ---------------------------
type Entry = { until: number; data: any };
type Store = Record<string, Entry>;

// --------------------------- State ---------------------------
let useKV = false;
let kv: ReturnType<typeof makeUpstashKV> | null = null;

let store: Store = {};
let filePath = path.resolve(process.env.CACHE_PATH || "./data/cache.json");
let saveTimer: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 400;

// --------------------------- File Helpers ---------------------------
function scheduleSave() {
  if (useKV) return; // KV mode has no file save
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(store), "utf8");
    } catch (e) {
      console.warn("[cache] file save failed:", e);
    }
  }, SAVE_DEBOUNCE_MS);
}

function loadFromFile() {
  try {
    if (fs.existsSync(filePath)) {
      const json = fs.readFileSync(filePath, "utf8");
      store = JSON.parse(json || "{}") || {};
    } else {
      store = {};
    }
  } catch (e) {
    console.warn("[cache] file load failed:", e);
    store = {};
  }
}

// --------------------------- API ---------------------------
/**
 * Initialize the cache layer.
 * - If UPSTASH_REDIS_REST_URL/TOKEN are set, use Redis (persistent).
 * - Otherwise, use the file-based fallback (ephemeral on hosts).
 */
export async function initCache(pathOrIgnored?: string) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    kv = makeUpstashKV();
    useKV = true;
    console.log("[cache] Using Upstash Redis for persistent cache.");
  } else {
    useKV = false;
    if (pathOrIgnored) filePath = path.resolve(pathOrIgnored);
    loadFromFile();
    console.log("[cache] Using file-based cache at:", filePath);
  }
}

/** Wipe cache */
export function clearCache() {
  if (useKV) {
    console.warn("[cache] clearCache() is a no-op in KV mode (by design). Use key expirations.");
    return;
  }
  store = {};
  scheduleSave();
}

/**
 * Get-or-set cache value with TTL.
 * In KV mode:
 *  - We rely on Redis EX (expire) to enforce TTL (no `until` wrapper).
 * In file mode:
 *  - We store `{until, data}` and prune on read.
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  if (useKV && kv) {
    const namespaced = `cache:${key}`;
    const raw = await kv.get(namespaced);
    if (raw) return JSON.parse(raw) as T;

    const val = await fn();
    await kv.set(namespaced, JSON.stringify(val), ttlSeconds);
    return val;
  }

  // File fallback
  const now = Date.now();
  const hit = store[key];
  if (hit && hit.until > now) {
    return hit.data as T;
  }
  const data = await fn();
  store[key] = { until: now + ttlSeconds * 1000, data };
  scheduleSave();
  return data;
}
