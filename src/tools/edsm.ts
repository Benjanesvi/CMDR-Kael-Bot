import { request } from "undici";
import { cached } from "../cache.js";

const BASE_V1 = "https://www.edsm.net/api-v1";            // API Systems v1
const BASE_SYS_V1 = "https://www.edsm.net/api-system-v1"; // API System v1
const TTL_24H = 86400;

async function getJSON(url: string) {
  const res = await request(url);
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`EDSM ${res.statusCode}: ${text?.slice(0, 500)}`);
  }
  return res.body.json();
}

/** ---------- API Systems v1 ---------- */

export async function edsmSystem(system: string) {
  const q = `${BASE_V1}/system?systemName=${encodeURIComponent(system)}&showId=1&showCoordinates=1&showInformation=1&showPrimaryStar=1&showPermit=1`;
  return cached(`edsm:system:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmSystems(names: string[]) {
  const q = `${BASE_V1}/systems?systemName[]=${names.map(encodeURIComponent).join("&systemName[]=")}&showId=1&showCoordinates=1&showInformation=1&showPrimaryStar=1`;
  return cached(`edsm:systems:${names.map(n=>n.toLowerCase()).join(",")}`, TTL_24H, () => getJSON(q));
}

export async function edsmSystemsSphere(center: string, radiusLy: number) {
  const q = `${BASE_V1}/sphere-systems?systemName=${encodeURIComponent(center)}&radius=${radiusLy}&showId=1&showCoordinates=1&showInformation=1`;
  return cached(`edsm:sphere:${center.toLowerCase()}:${radiusLy}`, TTL_24H, () => getJSON(q));
}

export async function edsmSystemsCube(center: string, sizeLy: number) {
  const q = `${BASE_V1}/cube-systems?systemName=${encodeURIComponent(center)}&size=${sizeLy}&showId=1&showCoordinates=1&showInformation=1`;
  return cached(`edsm:cube:${center.toLowerCase()}:${sizeLy}`, TTL_24H, () => getJSON(q));
}

/** ---------- API System v1 ---------- */

export async function edsmBodies(system: string) {
  const q = `${BASE_SYS_V1}/bodies?systemName=${encodeURIComponent(system)}`;
  return cached(`edsm:bodies:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmStations(system: string) {
  const q = `${BASE_SYS_V1}/stations?systemName=${encodeURIComponent(system)}`;
  return cached(`edsm:stations:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmFactions(system: string, showHistory = false) {
  const q = `${BASE_SYS_V1}/factions?systemName=${encodeURIComponent(system)}${showHistory ? "&showHistory=1" : ""}`;
  return cached(`edsm:factions:${showHistory}:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmTraffic(system: string) {
  const q = `${BASE_SYS_V1}/traffic?systemName=${encodeURIComponent(system)}`;
  return cached(`edsm:traffic:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmDeaths(system: string) {
  const q = `${BASE_SYS_V1}/deaths?systemName=${encodeURIComponent(system)}`;
  return cached(`edsm:deaths:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

export async function edsmEstimatedValue(system: string) {
  const q = `${BASE_SYS_V1}/estimated-value?systemName=${encodeURIComponent(system)}`;
  return cached(`edsm:est:${system.toLowerCase()}`, TTL_24H, () => getJSON(q));
}

/** Station-level helpers using marketId */
async function stationMarketId(system: string, station: string): Promise<number | null> {
  const stations = await edsmStations(system);
  const match = (stations?.stations || []).find((s: any) =>
    (s.name || "").toLowerCase() === station.toLowerCase()
  );
  return match?.marketId ?? null;
}

export async function edsmStationMarket(system: string, station: string) {
  const id = await stationMarketId(system, station);
  if (!id) return { error: "station not found or marketId missing" };
  const q = `${BASE_SYS_V1}/market?marketId=${id}`;
  return cached(`edsm:market:${id}`, TTL_24H, () => getJSON(q));
}

export async function edsmStationShipyard(system: string, station: string) {
  const id = await stationMarketId(system, station);
  if (!id) return { error: "station not found or marketId missing" };
  const q = `${BASE_SYS_V1}/shipyard?marketId=${id}`;
  return cached(`edsm:shipyard:${id}`, TTL_24H, () => getJSON(q));
}

export async function edsmStationOutfitting(system: string, station: string) {
  const id = await stationMarketId(system, station);
  if (!id) return { error: "station not found or marketId missing" };
  const q = `${BASE_SYS_V1}/outfitting?marketId=${id}`;
  return cached(`edsm:outfit:${id}`, TTL_24H, () => getJSON(q));
}
