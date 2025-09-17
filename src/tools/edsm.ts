// src/tools/edsm.ts
// EDSM API helpers with in-memory TTL caching, retries, and your original signatures.
// Uses the two public APIs correctly:
//   - API Systems v1:      https://www.edsm.net/api-v1/*
//   - API System v1:       https://www.edsm.net/api-system-v1/*
//
// Exports (unchanged signatures for your call-sites):
//   getSystem(systemName)
//   getSystemValue(systemName)
//   getSystemBodies(systemName)
//   getSystemStations(systemName)
//   getSystemTraffic(systemName)
//   getSystemDeaths(systemName)
//   getMarket(systemName, stationName)
//   getOutfitting(systemName, stationName)
//   getShipyard(systemName, stationName)
//   getSphere(x, y, z, radiusLy)        // supports center by coords OR by systemName (see below)
//   getCube(x, y, z, sizeLy)
//
// Notes:
// - getSphere(): if x/y/z are finite, uses them; if not, but systemName is provided via alt param, uses that.
//   (Kept to be flexible with your live tool usage.)

import { setTimeout as sleep } from "node:timers/promises";
import { Buffer } from "node:buffer";
import { EDSM_TTL_MS, HTTP_TIMEOUT_MS } from "../config.js";

// Optional: prefer your project's http wrapper if it exists
let httpGet: ((url: string) => Promise<any>) | null = null;
try {
  const http = await import("../http.js"); // ESM path
  httpGet = (http.getJSON ?? http.get ?? null) as any;
} catch { /* fallback to fetch */ }

const BASE = "https://www.edsm.net";
const TTL = Number.isFinite(Number(EDSM_TTL_MS)) ? Number(EDSM_TTL_MS) : 120_000; // 120s
const TIMEOUT = Number.isFinite(Number(HTTP_TIMEOUT_MS)) ? Number(HTTP_TIMEOUT_MS) : 30_000;

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

function cacheKey(path: string, params?: Query) {
  return `${path}${params ? qs(params) : ""}`;
}

async function getJSON<T>(url: string): Promise<T> {
  if (httpGet) return httpGet(url) as Promise<T>;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "CMDR-Kael/1.0 (+render)"
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`EDSM ${res.status} ${res.statusText} @ ${url} :: ${body.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedGet<T>(path: string, params?: Query, retries = 1): Promise<T> {
  const key = cacheKey(path, params);
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.t < TTL) return hit.v as T;

  const url = `${BASE}${path}${params ? qs(params) : ""}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const json = await getJSON<T>(url);
      CACHE.set(key, { t: now, v: json });
      return json;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(150 + Math.random() * 250);
    }
  }
  // unreachable
  throw new Error("Unexpected EDSM cachedGet failure");
}

// ---------- API Systems v1 (multi/system meta) ----------

export function getSystem(systemName: string) {
  return cachedGet("/api-v1/system", {
    systemName,
    showId: 1,
    showCoordinates: 1,
    showPrimaryStar: 1,
  });
}

export function getSystemValue(systemName: string) {
  return cachedGet("/api-v1/system", {
    systemName,
    showCoordinates: 1,
    showPrimaryStar: 1,
  });
}

export function getSphere(x: number, y: number, z: number, radiusLy: number, altSystemName?: string) {
  const hasXYZ = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
  const radius = Math.max(1, Math.min(100, Number(radiusLy) || 10));
  if (hasXYZ) {
    return cachedGet("/api-v1/sphere-systems", { x, y, z, radius, showCoordinates: 1 });
  }
  if (altSystemName) {
    return cachedGet("/api-v1/sphere-systems", { systemName: altSystemName, radius, showCoordinates: 1 });
  }
  throw new Error("getSphere requires either finite x/y/z or a systemName");
}

export function getCube(x: number, y: number, z: number, sizeLy: number) {
  const size = Math.max(1, Math.min(200, Number(sizeLy) || 10));
  return cachedGet("/api-v1/cube-systems", { x, y, z, size, showCoordinates: 1 });
}

// ---------- API System v1 (per-system details) ----------

export function getSystemBodies(systemName: string) {
  return cachedGet("/api-system-v1/bodies", { systemName });
}

export function getSystemStations(systemName: string) {
  return cachedGet("/api-system-v1/stations", { systemName });
}

export function getSystemTraffic(systemName: string) {
  return cachedGet("/api-system-v1/traffic", { systemName });
}

export function getSystemDeaths(systemName: string) {
  return cachedGet("/api-system-v1/deaths", { systemName });
}

// Station subresources
export function getMarket(systemName: string, stationName: string) {
  return cachedGet("/api-system-v1/stations/market", { systemName, stationName });
}
export function getOutfitting(systemName: string, stationName: string) {
  return cachedGet("/api-system-v1/stations/outfitting", { systemName, stationName });
}
export function getShipyard(systemName: string, stationName: string) {
  return cachedGet("/api-system-v1/stations/shipyard", { systemName, stationName });
}
