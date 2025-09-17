// src/tools/live.ts
// Live data tool for Elite Dangerous with validation & friendly errors.

import {
  getSystem,
  getSystemBodies,
  getSystemStations,
  getSystemTraffic,
  getSystemDeaths,
  getSystemValue,
  getMarket,
  getOutfitting,
  getShipyard,
  getSphere,
  getCube,
} from "./edsm.js";
import { bgsFactions } from "./inara.js";

type Detail =
  | "snapshot"
  | "bodies"
  | "stations"
  | "traffic"
  | "deaths"
  | "value"
  | "factions"
  | "market"
  | "outfitting"
  | "shipyard"
  | "sphere"
  | "cube";

const DETAIL_ALIASES: Record<string, Detail> = {
  // common aliases / misspellings
  info: "snapshot",
  system: "snapshot",
  station: "stations",
  markets: "market",
  outfitting: "outfitting",
  shipyards: "shipyard",
  values: "value",
  faction: "factions",
  // passthrough for exact names too
  snapshot: "snapshot",
  bodies: "bodies",
  stations: "stations",
  traffic: "traffic",
  deaths: "deaths",
  value: "value",
  factions: "factions",
  market: "market",
  shipyard: "shipyard",
  sphere: "sphere",
  cube: "cube",
};

function err(message: string) {
  return { error: message };
}

function need(args: any, fields: string[]) {
  const missing = fields.filter((f) => {
    const v = args?.[f];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  return missing.length ? `Missing required field(s): ${missing.join(", ")}` : null;
}

function asNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSystem(s: any) {
  const t = String(s ?? "").trim();
  if (!t) return t;
  // Hard cap to avoid silly inputs blowing up URLs
  return t.slice(0, 120);
}

export async function toolLIVE(rawArgs: any) {
  const args = rawArgs || {};
  const rawDetail = String(args.detail || "").toLowerCase().trim();
  const detail = DETAIL_ALIASES[rawDetail] as Detail | undefined;

  if (!detail) {
    return err(
      `Unknown 'detail': ${rawDetail || "(empty)"}.\n` +
        `Try one of: snapshot, bodies, stations, traffic, deaths, value, factions, market, outfitting, shipyard, sphere, cube.`
    );
  }

  // Normalize common fields
  const system = sanitizeSystem(args.system);
  const station = String(args.station ?? "").trim();
  const x = asNumber(args.x, NaN);
  const y = asNumber(args.y, NaN);
  const z = asNumber(args.z, NaN);
  const radiusLy = asNumber(args.radiusLy, 10);
  const sizeLy = asNumber(args.sizeLy, 10);

  // Validate per-detail requirements
  const REQUIRED: Partial<Record<Detail, string[]>> = {
    snapshot: ["system"],
    bodies: ["system"],
    stations: ["system"],
    traffic: ["system"],
    deaths: ["system"],
    value: ["system"],
    factions: ["system"],
    market: ["system", "station"],
    outfitting: ["system", "station"],
    shipyard: ["system", "station"],
    sphere: ["x", "y", "z"],
    cube: ["x", "y", "z"],
  };

  const needMsg = need(
    { system, station, x, y, z },
    REQUIRED[detail] ?? []
  );
  if (needMsg) return err(needMsg);

  try {
    switch (detail) {
      case "snapshot":
        return await getSystem(system);

      case "bodies":
        return await getSystemBodies(system);

      case "stations":
        return await getSystemStations(system);

      case "traffic":
        return await getSystemTraffic(system);

      case "deaths":
        return await getSystemDeaths(system);

      case "value":
        return await getSystemValue(system);

      case "factions":
        // Inara: system factions (BGS view)
        return await bgsFactions(system);

      case "market":
        return await getMarket(system, station);

      case "outfitting":
        return await getOutfitting(system, station);

      case "shipyard":
        return await getShipyard(system, station);

      case "sphere": {
        const r = Math.max(1, Math.min(100, radiusLy || 10)); // clamp 1–100 ly
        return await getSphere(x, y, z, r);
      }

      case "cube": {
        const s = Math.max(1, Math.min(200, sizeLy || 10)); // clamp 1–200 ly edge
        return await getCube(x, y, z, s);
      }
    }
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    return err(msg);
  }
}
