// src/storage.upstash.ts
import { KV } from "./storage.js";

const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE && !TOKEN) {
  // If Upstash isn't configured, we'll still export a null adapter that throws to help debugging.
  console.warn("[storage.upstash] UPSTASH not configured. Falling back to no-op adapter.");
}

function url(path: string) {
  return `${BASE}/${path}`;
}

export function makeUpstashKV(): KV {
  if (!BASE || !TOKEN) {
    return {
      async get(_k: string) { return null; },
      async set(_k: string, _v: string, _ttl?: number) { /* no-op */ }
    };
  }

  const authHeaders = { Authorization: `Bearer ${TOKEN}` };

  return {
    async get(key: string) {
      const r = await fetch(url(`get/${encodeURIComponent(key)}`), { headers: authHeaders });
      if (!r.ok) return null;
      const j = await r.json();
      return j.result ?? null;
    },
    async set(key: string, value: string, ttlSeconds?: number) {
      // Use REST API set. Upstash REST set supports query param EX=seconds.
      const path = `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}` + (ttlSeconds ? `?EX=${ttlSeconds}` : "");
      const r = await fetch(url(path), { method: "POST", headers: authHeaders });
      if (!r.ok) {
        const txt = await r.text();
        console.error("[storage.upstash] set failed:", r.status, txt);
      }
    },
    async del(key: string) {
      const r = await fetch(url(`del/${encodeURIComponent(key)}`), { method: "POST", headers: authHeaders });
      if (!r.ok) {
        const txt = await r.text();
        console.error("[storage.upstash] del failed:", r.status, txt);
      }
    }
  };
}
