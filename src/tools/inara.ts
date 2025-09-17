// src/tools/inara.ts
const BASE = "https://inara.cz/inapi/v1/";

async function inaraPost(eventName: string, data: any) {
  if (!process.env.INARA_API_KEY) throw new Error("INARA_API_KEY not configured.");

  const body = {
    header: {
      appName: "CMDR-Kael",
      appVersion: "0.2.0",
      APIkey: process.env.INARA_API_KEY,
      isTesting: 0
    },
    events: [{ eventName, eventTimestamp: Math.floor(Date.now() / 1000), eventData: data }]
  };

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`INARA ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function bgsFactions(systemName: string) {
  return inaraPost("getSystemFactions", { systemName });
}

export async function commanderInfo(commanderName: string) {
  return inaraPost("getCommanderProfile", { searchName: commanderName });
}
