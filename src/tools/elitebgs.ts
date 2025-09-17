import { request } from "undici";
import { cached } from "../cache.js";

const TTL_24H = 86400;

async function getJSON(url: string) {
  const res = await request(url);
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`EliteBGS ${res.statusCode}: ${text?.slice(0, 500)}`);
  }
  return res.body.json();
}

export async function toolBGS({ system, faction }: { system?: string; faction?: string }) {
  const key = `bgs:${(system || "").toLowerCase()}:${(faction || "").toLowerCase()}`;
  return cached(key, TTL_24H, async () => {
    if (system) {
      return getJSON(`https://elitebgs.app/api/ebgs/v5/systems?name=${encodeURIComponent(system)}`);
    }
    if (faction) {
      return getJSON(`https://elitebgs.app/api/ebgs/v5/factions?name=${encodeURIComponent(faction)}`);
    }
    return { error: "Provide 'system' or 'faction' for BGS lookup." };
  });
}
