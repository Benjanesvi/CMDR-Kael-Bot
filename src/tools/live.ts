// src/tools/live.ts
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
  getCube
} from "./edsm.js";
import { bgsFactions } from "./inara.js";

export async function toolLIVE(args: any) {
  const detail = String(args.detail || "").toLowerCase();
  const system = args.system;
  const station = args.station;

  try {
    switch (detail) {
      case "snapshot":   return await getSystem(system);
      case "bodies":     return await getSystemBodies(system);
      case "stations":   return await getSystemStations(system);
      case "traffic":    return await getSystemTraffic(system);
      case "deaths":     return await getSystemDeaths(system);
      case "value":      return await getSystemValue(system);
      case "factions":   return await bgsFactions(system);
      case "market":     return await getMarket(system, station);
      case "outfitting": return await getOutfitting(system, station);
      case "shipyard":   return await getShipyard(system, station);
      case "sphere":     return await getSphere(args.x, args.y, args.z, args.radiusLy ?? 10);
      case "cube":       return await getCube(args.x, args.y, args.z, args.sizeLy ?? 10);
      default:           return { error: `Unknown detail: ${detail}` };
    }
  } catch (err: any) {
    return { error: String(err?.message || err) };
  }
}
