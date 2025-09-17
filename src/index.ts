// src/index.ts
import "dotenv/config";
import os from "node:os";
import { Client, GatewayIntentBits, Partials, Message } from "discord.js";

import { chat } from "./llm.js";
import { loadPDF } from "./tools/pdf.js";
import { initCache } from "./cache.js";
import { splitForDiscord } from "./utils/reply.js";
import { setPending, hasPending, popNext, clearPending } from "./session.js";
import { loadPersonaDB, setPersona, resetPersona } from "./persona.js";
import { loadMemoryDB, remember, forget, listMemoriesAsync } from "./memory.js";
import { makeUpstashKV } from "./storage.upstash.js";

import {
  validateEnv,
  DISCORD_TOKEN,
  TARGET_CHANNEL_ID,
  ADMIN_IDS,
} from "./config.js";

validateEnv();

const CACHE_PATH = process.env.CACHE_PATH || "./data/cache.json";

function isAdmin(userId: string) {
  return !ADMIN_IDS.length || ADMIN_IDS.includes(userId);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ---------------------
// Health heartbeat setup
// ---------------------
const kv = makeUpstashKV("HEALTH");
const HEARTBEAT_KEY = "health:heartbeat";
const hostname = os.hostname();

async function writeHeartbeat(extra: Record<string, any> = {}) {
  const payload = {
    ts: Date.now(),
    bot: client.user?.tag || null,
    userId: client.user?.id || null,
    hostname,
    ready: Boolean(client.user),
    ...extra,
  };
  try {
    // TTL 120s so the status page marks us stale if we stop updating
    await kv.set(HEARTBEAT_KEY, JSON.stringify(payload), { ex: 120 });
  } catch (err) {
    console.warn("[health] failed to write heartbeat:", err);
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    await initCache(CACHE_PATH);
  } catch (e) {
    console.warn(e);
  }

  try {
    loadPersonaDB();
  } catch (e) {
    console.warn(e);
  }

  try {
    loadMemoryDB();
  } catch (e) {
    console.warn(e);
  }

  try {
    await loadPDF();
  } catch (e) {
    console.warn(e);
  }

  // first heartbeat immediately, then every 30s
  await writeHeartbeat();
  setInterval(() => {
    writeHeartbeat().catch(() => {});
  }, 30_000);
});

async function deliverInChunks(msg: Message, content: string) {
  const chunks = splitForDiscord(content, 1900);
  if (!chunks.length) return;
  await msg.reply(chunks[0]);
  const rest = chunks.slice(1);
  if (rest.length) {
    setPending(msg.channel.id, rest);
    await msg.reply("_(reply **more** for the next part • **stop** to clear)_");
  } else {
    clearPending(msg.channel.id);
  }
}

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (TARGET_CHANNEL_ID && msg.channel.id !== TARGET_CHANNEL_ID) return;

    const text = (msg.content || "").trim();
    if (!text) return;
    const lower = text.toLowerCase();

    if (lower === "more" && hasPending(msg.channel.id)) {
      const next = popNext(msg.channel.id);
      if (next) {
        await msg.reply(next);
        if (!hasPending(msg.channel.id)) await msg.reply("_(end of message)_");
        else await msg.reply("_(reply **more** for next • **stop** to clear)_");
      } else {
        clearPending(msg.channel.id);
        await msg.reply("_(no further parts queued)_");
      }
      return;
    }

    if (lower === "stop" && hasPending(msg.channel.id)) {
      clearPending(msg.channel.id);
      await msg.reply("_(cleared pending parts)_");
      return;
    }

    if (isAdmin(msg.author.id) && /^persona\s+/i.test(text)) {
      const cmd = text.replace(/^persona\s+/i, "").trim();
      if (/^reset$/i.test(cmd)) {
        resetPersona(msg.channel.id);
        await msg.reply("Persona reset.");
        return;
        }
      const toneMatch = /^tone\s+(friendly|neutral|gruff|acerbic)$/i.exec(cmd);
      if (toneMatch) {
        setPersona(msg.channel.id, { tone: toneMatch[1].toLowerCase() as any });
        await msg.reply(`Tone set to **${toneMatch[1]}**.`);
        return;
      }
      const sliderMatch =
        /^(humor|snark|formality|verbosity|drone|darkness|colloquial|max_history)\s+(\d{1,2})$/i.exec(cmd);
      if (sliderMatch) {
        const key = sliderMatch[1].toLowerCase() as any;
        const val = Math.max(0, Math.min(10, parseInt(sliderMatch[2], 10)));
        setPersona(msg.channel.id, { [key]: val } as any);
        await msg.reply(`${key} set to **${val}**/10.`);
        return;
      }
      await msg.reply("Persona command not recognized.");
      return;
    }

    if (/^remember\s*:/i.test(text)) {
      const payload = text.replace(/^remember\s*:\s*/i, "").trim();
      if (!payload) return msg.reply("`remember: <note>`");
      await remember(msg.channel.id, payload);
      return msg.reply("Noted.");
    }

    if (/^forget\s*:/i.test(text)) {
      const payload = text.replace(/^forget\s*:\s*/i, "").trim();
      if (!payload) return msg.reply("`forget: <index or text>`");
      const ok = await forget(msg.channel.id, payload);
      return msg.reply(ok ? "Forgotten." : "Not found.");
    }

    if (/^memories$/i.test(text)) {
      const mems = await listMemoriesAsync(msg.channel.id);
      if (!mems?.length) return msg.reply("_(no memories)_");
      const body = mems.map((m, i) => `${i + 1}. ${String(m.text || m)}`).join("\n");
      return deliverInChunks(msg, `**Memories**\n${body}`);
    }

    const reply = await chat([{ role: "user", content: text }], {
      user: msg.author.id,
      channel: msg.channel.id,
    });
    if (!reply) return msg.reply("_(no response)_");
    await deliverInChunks(msg, reply);

  } catch (e) {
    console.error(e);
    try {
      await msg.reply("I hit a snag.");
    } catch {}
  }
});

async function gracefulShutdown() {
  try { await client.destroy(); } catch {}
  process.exit(0);
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

client.login(DISCORD_TOKEN).catch((e) => {
  console.error("Login failed:", e);
  process.exit(1);
});
