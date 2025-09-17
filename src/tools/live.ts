import {
  edsmSystem, edsmBodies, edsmStations, edsmFactions, edsmTraffic, edsmDeaths,
  edsmEstimatedValue, edsmStationMarket, edsmStationShipyard, edsmStationOutfitting,
  edsmSystemsSphere, edsmSystemsCube
} from "./edsm.js";
import { toolBGS } from "./elitebgs.js";
import { toolINARA } from "./inara.js";

function empty(x: any) {
  if (!x) return true;
  if (Array.isArray(x)) return x.length === 0;
  if (typeof x === "object") return Object.keys(x).length === 0;
  return false;
}

/** EDSM-first live data; fall back to EliteBGS/INARA when appropriate. */
export async function toolLIVE(args: {
  detail:
    | "snapshot" | "bodies" | "stations" | "factions" | "traffic" | "deaths" | "value"
    | "market" | "shipyard" | "outfitting"
    | "sphere" | "cube";
  system?: string;
  station?: string;
  radiusLy?: number;
  sizeLy?: number;
  faction?: string;
  commander?: string;
  showHistory?: boolean;
}) {
  const d = args.detail;
  try {
    if (d === "sphere" && args.system && args.radiusLy) {
      return await edsmSystemsSphere(args.system, args.radiusLy);
    }
    if (d === "cube" && args.system && args.sizeLy) {
      return await edsmSystemsCube(args.system, args.sizeLy);
    }

    if (!args.system && ["snapshot","bodies","stations","factions","traffic","deaths","value","market","shipyard","outfitting"].includes(d)) {
      return { error: "Provide 'system'." };
    }

    switch (d) {
      case "snapshot": return await edsmSystem(args.system!);
      case "bodies":   return await edsmBodies(args.system!);
      case "stations": return await edsmStations(args.system!);
      case "traffic":  return await edsmTraffic(args.system!);
      case "deaths":   return await edsmDeaths(args.system!);
      case "value":    return await edsmEstimatedValue(args.system!);

      case "factions": {
        const r = await edsmFactions(args.system!, !!args.showHistory);
        if (!empty(r?.factions)) return r;
        return await toolBGS({ system: args.system }); // fallback
      }

      case "market":   return await edsmStationMarket(args.system!, args.station!);
      case "shipyard": return await edsmStationShipyard(args.system!, args.station!);
      case "outfitting": return await edsmStationOutfitting(args.system!, args.station!);

      default: return { error: `Unsupported detail: ${d}` };
    }
  } catch (e: any) {
    if (d === "factions" && (args.system || args.faction)) {
      return await toolBGS({ system: args.system, faction: args.faction });
    }
    if (args.commander) return await toolINARA({ commander: args.commander });
    return { error: String(e?.message || e) };
  }
}
