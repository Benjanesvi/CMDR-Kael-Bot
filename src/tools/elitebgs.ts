// src/tools/inara.ts
// INARA INAPI v1 client with light caching for read-like events, retries, and better error surfacing.
// Keeps your public helpers (e.g., bgsFactions(systemName)).
//
// Docs: https://inara.cz/inapi/

import { INARA_API_KEY, INARA_APP_NAME, INARA_APP_VERSION, INARA_TTL_MS, HTTP_TIMEOUT_MS } from "../config.js";
import { setTimeout as sleep } from "node:timers/promises";

const INARA_BASE = "https://inara.cz/inapi/v1/";
const TTL = Number.isFinite(Number(INARA_TTL_MS)) ? Number(INARA_TTL_MS) : 60_000; // 60s
const TIMEOUT = Number.isFinite(Number(HTTP_TIMEOUT_MS)) ? Number(HTTP_TIMEOUT_MS) : 30_000;

type InaraEvent = {
  eventName: string;
  eventTimestamp: string; // ISO
  eventData?: Record<string, any>;
};

type CacheEntry = { t: number; v: any };
const CACHE = new Map<string, CacheEntry>();

function isCacheable(events: InaraEvent[]) {
  return events.every(e =>
    ["getCommanderProfile", "getSystemFactions", "getSystem", "getStation"].includes(e.eventName)
  );
}
function keyFor(events: InaraEvent[]) {
  return JSON.stringify(events);
}

async function postJSON<T>(events: InaraEvent[], retries = 1): Promise<T> {
  if (!INARA_API_KEY) throw new Error("INARA_API_KEY is not set");

  const cacheable = isCacheable(events);
  const k = cacheable ? keyFor(events) : null;
  const now = Date.now();
  if (k) {
    const hit = CACHE.get(k);
    if (hit && now - hit.t < TTL) return hit.v as T;
  }

  const body = {
    header: {
      appName: INARA_APP_NAME || "CMDR-Kael",
      appVersion: INARA_APP_VERSION || "1.0.0",
      APIkey: INARA_API_KEY,
    },
    events,
  };

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(INARA_BASE, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`INARA ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as T;
      if (k) CACHE.set(k, { t: now, v: json });
      return json;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(150 + Math.random() * 250);
    } finally {
      clearTimeout(timeout);
    }
  }
  // unreachable
  throw new Error("Unexpected INARA failure");
}

// ----- Public helpers (keep names used by your code) -----

export function bgsFactions(systemName: string) {
  return postJSON([
    {
      eventName: "getSystemFactions",
      eventTimestamp: new Date().toISOString(),
      eventData: { systemName },
    },
  ]);
}

export function commanderProfile(cmdrName: string) {
  return postJSON([
    {
      eventName: "getCommanderProfile",
      eventTimestamp: new Date().toISOString(),
      eventData: { searchName: cmdrName },
    },
  ]);
}

// Generic passthrough
export function inaraPost(events: InaraEvent[]) {
  return postJSON(events);
}
