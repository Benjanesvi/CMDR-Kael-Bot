// src/config.ts
export const NODE_ENV = process.env.NODE_ENV || "development";
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || "";
export const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
export const BGS_PDF_URL = process.env.BGS_PDF_URL || "";
export const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS || "24");

export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function validateEnv(): void {
  const missing: string[] = [];
  if (!DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  // TARGET_CHANNEL_ID is optional only if you want to listen globally; adjust if required
  if (!BGS_PDF_URL) console.warn("[WARN] BGS_PDF_URL not set. PDF tools may fail.");
  if (missing.length) {
    console.error("Missing required env vars:", missing.join(", "));
    throw new Error("Missing required env vars: " + missing.join(", "));
  }
}
