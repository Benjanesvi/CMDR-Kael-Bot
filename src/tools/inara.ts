// src/tools/inara.ts
// Thin wrapper for Inara API (faction info, commander info, etc.)
import fetch from "node-fetch";

const BASE = "https://inara.cz/inapi/v1/";

/**
 * Perform a POST to Inara with your API key and payload.
 */
async function inaraPost(eventName: string, data: any) {
  if (!process.env.INARA_API_KEY) {
    throw new Error("INARA_API_KEY not configured.");
  }
  const body = {
    header: {
      appName: "CMDR-Kael",
      appVersion: "0.1",
      isTesting: false,
      APIkey: process.env.INARA_API_KEY,
    },
    events: [{ eventName, eventTimestamp: new Date().toISOString(), eventData: data }],
  };

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Inara POST ${eventName} → ${res.status}`);
  const json = await res.json();
  return json;
}

/**
 * Get faction info from Inara (fallback when EDSM doesn't provide).
 */
export async function bgsFactions(systemName: string) {
  const result = await inaraPost("getSystemFactions", { systemName });
  return result;
}

/**
 * Get commander info (if you extend tools later).
 */
export async function commanderInfo(commanderName: string) {
  const result = await inaraPost("getCommanderProfile", { searchName: commanderName });
  return result;
}
