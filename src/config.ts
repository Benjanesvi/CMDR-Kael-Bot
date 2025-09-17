// src/config.ts
import dotenv from "dotenv";
dotenv.config();

// Required
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Optional (recommended)
export const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || "";
export const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Integrations
export const INARA_API_KEY = process.env.INARA_API_KEY || "";
export const BGS_PDF_URL = process.env.BGS_PDF_URL || "";

// Upstash Redis (optional, used for cache/persona/memory/heartbeat)
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

// Model settings
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);

// Validate required variables
export function validateEnv() {
  const missing: string[] = [];
  if (!DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (missing.length) {
    console.error("Missing required environment variables:", missing.join(", "));
    process.exit(1);
  }
}
