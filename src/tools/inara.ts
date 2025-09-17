import { request } from "undici";
import { cached } from "../cache.js";

const INARA_API_KEY = process.env.INARA_API_KEY;
const TTL_24H = 86400;

export async function toolINARA({ commander, squadron }: { commander?: string; squadron?: string }) {
  if (!INARA_API_KEY) return { error: "INARA API key missing in env." };
  if (!commander && !squadron) return { error: "Provide 'commander' or 'squadron'." };

  const cacheKey = `inara:${(commander || "").toLowerCase()}:${(squadron || "").toLowerCase()}`;

  return cached(cacheKey, TTL_24H, async () => {
    const events: any[] = [];
    const now = new Date().toISOString();

    if (commander) events.push({ eventName: "getCommanderProfile", eventTimestamp: now, eventData: { searchName: commander } });
    if (squadron)  events.push({ eventName: "getSquadron",         eventTimestamp: now, eventData: { searchName: squadron } });

    const body = {
      header: { appName: "SpaceForceBot", appVersion: "0.1", isTesting: 0, APIkey: INARA_API_KEY },
      events
    };

    const res = await request("https://inara.cz/inapi/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`INARA ${res.statusCode}: ${text?.slice(0, 500)}`);
    }
    return await res.body.json();
  });
}
