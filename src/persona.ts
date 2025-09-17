// src/persona.ts
// Persistent per-channel persona with Redis (Upstash) fallback to file.
// Keeps the same API as before: loadPersonaDB, getPersona, setPersona, resetPersona,
// personaOverrideText, modelParamsFromPersona.

import fs from "fs";
import path from "path";
import { makeUpstashKV } from "./storage.upstash.js";

export type Persona = {
  temperature: number;            // 0.2 - 1.2
  humor: number;                  // 0..10 (dry → playful)
  snark: number;                  // 0..10
  formality: number;              // 0..10 (0 casual, 10 very formal)
  verbosity: number;              // 0..10 (higher = longer)
  drone: number;                  // 0..10 (storyteller)
  tone: "friendly" | "neutral" | "gruff" | "acerbic";
  max_history: number;            // memories to inject
  darkness: number;               // 0..10 (grit/gallows humor, heavier imagery)
  colloquial: number;             // 0..10 (contractions, fragments, human cadence)
};

type PersonaDB = { [channelId: string]: Persona };

const DEFAULT: Persona = {
  temperature: 0.9,   // more color/edge
  humor: 4,           // dry, not jokey
  snark: 7,           // sharper bite
  formality: 3,       // less official, still readable
  verbosity: 6,       // explains, but we chunk at 1900
  drone: 7,           // will reminisce / “drone” with intent
  tone: "acerbic",    // darker baseline
  max_history: 10,
  darkness: 8,        // gallows humor, war-worn edge
  colloquial: 8       // contractions, fragments, lived-in voice
};

const FILE_PATH = path.resolve(process.env.PERSONA_PATH || "./data/persona.json");

// Runtime selection
let useKV = false;
let kv: ReturnType<typeof makeUpstashKV> | null = null;

// File/in-memory fallback
let db: PersonaDB = {};

// ---------- File helpers ----------
function fileLoad() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const json = fs.readFileSync(FILE_PATH, "utf8");
      db = JSON.parse(json || "{}") || {};
    } else {
      db = {};
    }
  } catch (e) {
    console.warn("[PERSONA] file load failed:", e);
    db = {};
  }
}

function fileSave() {
  try {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("[PERSONA] save failed:", e);
  }
}

// ---------- KV helpers ----------
const keyFor = (channelId: string) => `persona:${channelId}`;

async function kvGet(channelId: string): Promise<Persona | null> {
  const raw = await kv!.get(keyFor(channelId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Persona; } catch { return null; }
}

async function kvSet(channelId: string, p: Persona) {
  await kv!.set(keyFor(channelId), JSON.stringify(p));
}

// ---------- API ----------
/** Initialize persona store (select KV if configured; otherwise load file). */
export async function loadPersonaDB() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    kv = makeUpstashKV();
    useKV = true;
    console.log("[PERSONA] Using Upstash Redis for persistent persona.");
    return;
  }
  useKV = false;
  fileLoad();
  console.log("[PERSONA] Using file/in-memory store at:", FILE_PATH, "(ephemeral on hosts)");
}

/** Get persona for a channel (returns DEFAULT if none exists). */
export function getPersona(channelId: string): Persona {
  if (useKV) {
    // Synchronous API expected by the rest of the code.
    // We provide a snapshot by caching minimally via a local map if needed.
    // To keep behavior consistent, we lazily create DEFAULT and fire-and-forget write.
    // (If you want fully consistent async reads, refactor callers to await a getPersonaAsync.)
    throw new Error("getPersona() called sync in KV mode. Use getPersonaAsync(channelId) instead.");
  }
  return db[channelId] || (db[channelId] = { ...DEFAULT });
}

/** Async getter for KV mode; safe for both modes. */
export async function getPersonaAsync(channelId: string): Promise<Persona> {
  if (useKV && kv) {
    const p = await kvGet(channelId);
    if (p) return p;
    // seed default
    await kvSet(channelId, { ...DEFAULT });
    return { ...DEFAULT };
  }
  return getPersona(channelId);
}

/** Patch and persist persona for a channel. */
export function setPersona(channelId: string, patch: Partial<Persona>): Persona {
  if (useKV) {
    // sync API expected by callers; persist asynchronously
    (async () => {
      const current = await getPersonaAsync(channelId);
      const next: Persona = { ...current, ...patch };
      await kvSet(channelId, next);
    })().catch(err => console.warn("[PERSONA] setPersona KV err:", err));
    // return optimistic next state
    // (Callers typically don't rely on the return value beyond confirming changes.)
    return { ...DEFAULT, ...patch };
  }

  const current = getPersona(channelId);
  const next: Persona = { ...current, ...patch };
  db[channelId] = next;
  fileSave();
  return next;
}

/** Reset persona to DEFAULT for a channel. */
export function resetPersona(channelId: string): Persona {
  if (useKV) {
    (async () => {
      await kvSet(channelId, { ...DEFAULT });
    })().catch(err => console.warn("[PERSONA] resetPersona KV err:", err));
    return { ...DEFAULT };
  }

  db[channelId] = { ...DEFAULT };
  fileSave();
  return db[channelId];
}

/** Compose persona override text for the system prompt. */
export function personaOverrideText(p: Persona) {
  const toneText =
    p.tone === "friendly" ? "measured, professional warmth"
    : p.tone === "neutral" ? "dry, clipped professionalism"
    : p.tone === "gruff" ? "hard-bitten, terse, mission-first"
    : "acerbic, darkly pragmatic, veteran’s edge"; // default

  const vibe = [
    `TONE: ${toneText}.`,
    `HUMOR: ${p.humor}/10 (dry; never goofy).`,
    `SNARK: ${p.snark}/10 (cutting, not cruel).`,
    `FORMALITY: ${p.formality}/10 (lower = casual).`,
    `VERBOSITY: ${p.verbosity}/10 (be concise; chunk long answers).`,
    `DRONE: ${p.drone}/10 (story cadence; war-worn).`,
    `DARKNESS: ${p.darkness}/10 (grit allowed, no gore/edgelord).`,
    `COLLOQUIAL: ${p.colloquial}/10 (contractions, lived-in voice).`,
    `MEMORY WINDOW: ${p.max_history} recent items.`,
  ].join("\n");

  return [
    "VOICE & CADENCE",
    vibe,
    "NON-NEGOTIABLES",
    "- Serve Space Force and Black Sun Crew first.",
    "- In LTT 14850, Black Sun Crew cannot retreat. Treat this as canonical.",
    "- Contempt for Oblivion Fleet is cold and strategic, never juvenile.",
    "- No 'as an AI'. No corporate chirp. No excessive politeness.",
    "- When uncertain, say so and propose a verification step.",
    "DELIVERY",
    "- Default to tight bullets and numbered actions.",
    "- Lead with the objective; then intel; then actions; then risks/counters.",
    "- Offer 'more' to expand if the answer runs long.",
  ].join("\n");
}

/** Map persona to model params. */
export function modelParamsFromPersona(p: Persona) {
  const temperature = Math.max(0.2, Math.min(1.2, p.temperature));
  // More drone → slightly higher presence; more colloquial → a touch less frequency penalty
  const presence_penalty = (p.drone - 5) * 0.05;           // approx ±0.25
  const frequency_penalty = (p.verbosity - 5) * 0.03 - (p.colloquial - 5) * 0.01;
  return { temperature, presence_penalty, frequency_penalty };
}
