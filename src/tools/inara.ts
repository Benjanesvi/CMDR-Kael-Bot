// src/tools/inara.ts
// INARA INAPI v1 with light caching, retries, and clearer errors.
// Requires INARA_API_KEY from config; appName/appVersion + TTL/timeout come from env or defaults.

import { INARA_API_KEY } from "../config.js";
import { setTimeout as sleep } from "node:timers/promises";

const INARA_BASE = "https://inara.cz/inapi/v1/";

const TTL = Number.isFinite(Number(process.env.INARA_TTL_MS))
  ? Number(process.env.INARA_TTL_MS)
  : 60_000; // 60s
const TIMEOUT = Number.isFinite(Number(process.env.HTTP_TIMEOUT_MS))
  ? Number(process.env.HTTP_TIMEOUT_MS)
  : 30_000;

const APP_NAME = process.env.INARA_APP_NAME || "CMDR-Kael";
const APP_VERSION = process.env.INARA_APP_VERSION || "1.0.0";

type InaraEvent = {
  eventName: string;
  eventTimestamp: string; // ISO
  eventData?: Record<string, any>;
};

type CacheEntry = { t: number; v: any };
const CACHE = new Map<string, CacheEntry>();

function isCacheable(events: InaraEvent[]) {
  return events.every((e) =>
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
      appName: APP_NAME,
      appVersion: APP_VERSION,
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
        headers: { Accept: "application/json", "Content-Type": "application/json" },
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
  throw new Error("Unexpected INARA failure");
}

// Public helpers

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

export function inaraPost(events: InaraEvent[]) {
  return postJSON(events);
}
