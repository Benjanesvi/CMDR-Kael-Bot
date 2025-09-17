// src/tools/edsm.ts
// EDSM API wrapper utilities
import fetch from "node-fetch";

const BASE = "https://www.edsm.net/api";

async function get(path: string, params: Record<string, any>) {
  const qs = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EDSM GET ${url} → ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------------------------
// System info
// ------------------------------------------------------------------------------------
export async function getSystem(system: string) {
  return get("/v1/system", { systemName: system, showId: 1 });
}

export async function getSystemBodies(system: string) {
  return get("/v1/bodies", { systemName: system });
}

export async function getSystemStations(system: string) {
  return get("/v1/stations", { systemName: system });
}

export async function getSystemFactions(system: string) {
  return get("/api-system-v1/factions", { systemName: system });
}

export async function getSystemTraffic(system: string) {
  return get("/v1/traffic", { systemName: system });
}

export async function getSystemDeaths(system: string) {
  return get("/v1/deaths", { systemName: system });
}

export async function getSystemValue(system: string) {
  return get("/v1/system", { systemName: system, showInformation: 1 });
}

// ------------------------------------------------------------------------------------
// Station-specific (market, outfitting, shipyard)
// ------------------------------------------------------------------------------------
export async function getMarket(system: string, stationName: string) {
  const stations = await getSystemStations(system);
  const match = (((stations as any)?.stations) || []).find(
    (s: any) => s.name?.toLowerCase() === (stationName || "").toLowerCase()
  );
  if (!match) throw new Error(`Station not found: ${stationName}`);
  return get("/v1/station/market", { marketId: match.id });
}

export async function getOutfitting(system: string, stationName: string) {
  const stations = await getSystemStations(system);
  const match = (((stations as any)?.stations) || []).find(
    (s: any) => s.name?.toLowerCase() === (stationName || "").toLowerCase()
  );
  if (!match) throw new Error(`Station not found: ${stationName}`);
  return get("/v1/station/outfitting", { marketId: match.id });
}

export async function getShipyard(system: string, stationName: string) {
  const stations = await getSystemStations(system);
  const match = (((stations as any)?.stations) || []).find(
    (s: any) => s.name?.toLowerCase() === (stationName || "").toLowerCase()
  );
  if (!match) throw new Error(`Station not found: ${stationName}`);
  return get("/v1/station/shipyard", { marketId: match.id });
}

// ------------------------------------------------------------------------------------
// Spatial searches
// ------------------------------------------------------------------------------------
export async function getSphere(x: number, y: number, z: number, radius: number) {
  return get("/v1/sphere-systems", { x, y, z, radius });
}

export async function getCube(x: number, y: number, z: number, size: number) {
  return get("/v1/cube-systems", { x, y, z, size });
}
