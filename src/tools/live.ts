// src/tools/live.ts
// Consolidated live data tool: EDSM-first, fallback to BGS/INARA
import { getSystem, getSystemBodies, getSystemStations, getSystemFactions, getSystemTraffic, getSystemDeaths, getSystemValue, getMarket, getOutfitting, getShipyard, getSphere, getCube } from "./edsm.js";
import { bgsFactions } from "./inara.js";
import { empty } from "../utils/empty.js";

export async function toolLIVE(args: any) {
  const detail = (args.detail || "").toLowerCase();
  const system = args.system;
  const station = args.station;

  try {
    switch (detail) {
      case "snapshot":
        return await getSystem(system);
      case "bodies":
        return await getSystemBodies(system);
      case "stations":
        return await getSystemStations(system);
      case "factions": {
        const r = await getSystemFactions(system);
        if (r && (r as any).factions && !empty((r as any).factions)) return r;
        return await bgsFactions(system);
      }
      case "traffic":
        return await getSystemTraffic(system);
      case "deaths":
        return await getSystemDeaths(system);
      case "value":
        return await getSystemValue(system);
      case "market":
        return await getMarket(system, station);
      case "outfitting":
        return await getOutfitting(system, station);
      case "shipyard":
        return await getShipyard(system, station);
      case "sphere":
        return await getSphere(args.x, args.y, args.z, args.radiusLy || 10);
      case "cube":
        return await getCube(args.x, args.y, args.z, args.sizeLy || 10);
      default:
        return { error: `Unknown detail: ${detail}` };
    }
  } catch (err: any) {
    return { error: String(err?.message || err) };
  }
}
