// src/storage.upstash.ts
import { KV } from "./storage.js";
import { UPSTASH_REDIS_REST_URL as BASE, UPSTASH_REDIS_REST_TOKEN as TOKEN } from "./config.js";

function url(path: string) {
  return `${BASE}/${path}`;
}

export function makeUpstashKV(): KV {
  if (!BASE || !TOKEN) {
    console.warn("[storage.upstash] Not configured, falling back.");
    return {
      async get() { return null; },
      async set() { /* noop */ },
      async del() { /* noop */ },
    };
  }

  const headers = { Authorization: `Bearer ${TOKEN}` };

  return {
    async get(key) {
      const r = await fetch(url(`get/${encodeURIComponent(key)}`), { headers });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      return j && typeof j.result !== "undefined" ? j.result : null;
    },
    async set(key, val, ttlSeconds) {
      const path = `set/${encodeURIComponent(key)}/${encodeURIComponent(val)}` +
                   (ttlSeconds ? `?EX=${ttlSeconds}` : "");
      await fetch(url(path), { method: "POST", headers });
    },
    async del(key) {
      await fetch(url(`del/${encodeURIComponent(key)}`), { method: "POST", headers });
    }
  };
}
