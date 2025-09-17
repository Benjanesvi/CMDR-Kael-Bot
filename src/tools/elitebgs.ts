// src/tools/elitebgs.ts
// EliteBGS API v5 helpers with TTL caching, retries, and unchanged signatures.

import { setTimeout as sleep } from "node:timers/promises";

const EBG_BASE = "https://elitebgs.app/api/ebgs/v5";

const TTL = Number.isFinite(Number(process.env.EBG_TTL_MS))
  ? Number(process.env.EBG_TTL_MS)
  : 60_000; // 60s
const TIMEOUT = Number.isFinite(Number(process.env.HTTP_TIMEOUT_MS))
  ? Number(process.env.HTTP_TIMEOUT_MS)
  : 30_000;

type Query = Record<string, string | number | boolean | undefined>;
type CacheEntry = { t: number; v: any };
const CACHE = new Map<string, CacheEntry>();

function qs(params: Query): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
function k(path: string, params?: Query) {
  return `${path}${params ? qs(params) : ""}`;
}

async function getJSON<T>(path: string, params: Query = {}, retries = 1): Promise<T> {
  const key = k(path, params);
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.t < TTL) return hit.v as T;

  const url = `${EBG_BASE}${path}${qs(params)}`;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "CMDR-Kael/1.0 (+render)" },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`EliteBGS ${res.status} ${res.statusText} @ ${url} :: ${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as T;
      CACHE.set(key, { t: now, v: json });
      return json;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(150 + Math.random() * 250);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Unexpected EliteBGS failure");
}

// Simple getters (unchanged signatures)
export function ebgsGetSystemByName(name: string) {
  return getJSON("/systems", { name });
}
export function ebgsGetFactionByName(name: string) {
  return getJSON("/factions", { name });
}
export function ebgsGetStationsBySystem(system: string) {
  return getJSON("/stations", { system });
}
export function ebgsGetFactionsInSystem(system: string) {
  return getJSON("/factions", { system });
}
export function ebgsGet(path: string, params: Query = {}) {
  return getJSON(path, params);
}
