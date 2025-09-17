// src/index.ts
import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Message } from "discord.js";

// LLM + tools
import { chat } from "./llm.js";
import { loadPDF } from "./tools/pdf.js";

// Caching/session/persona/memory utilities (from your repo)
import { initCache } from "./cache.js";
import { splitForDiscord } from "./utils/reply.js";
import { setPending, hasPending, popNext, clearPending } from "./session.js";
import { loadPersonaDB, setPersona, resetPersona } from "./persona.js";
import { loadMemoryDB, remember, forget, listMemories } from "./memory.js";

// Centralized env/config (new)
import {
  validateEnv,
  DISCORD_TOKEN,
  TARGET_CHANNEL_ID,
  ADMIN_IDS,
} from "./config.js";

// --------------------------------------------------------------------------------
// Boot checks
// --------------------------------------------------------------------------------
validateEnv();

// Legacy FS cache path support (safe to keep); if you switch to KV in cache.ts,
// you can ignore this but leaving it won't hurt.
const CACHE_PATH = process.env.CACHE_PATH || "./data/cache.json";

// Utility: check admin permissions
function isAdmin(userId: string) {
  return !ADMIN_IDS.length || ADMIN_IDS.includes(userId);
}

// --------------------------------------------------------------------------------
/** Discord client */
// --------------------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    await initCache(CACHE_PATH);
  } catch (err) {
    console.warn("[cache] initCache failed or not needed:", err);
  }

  try {
    loadPersonaDB();
  } catch (err) {
    console.warn("[persona] loadPersonaDB warn:", err);
  }

  try {
    loadMemoryDB();
  } catch (err) {
    console.warn("[memory] loadMemoryDB warn:", err);
  }

  // Fetch and parse remote BGS PDF (uses BGS_PDF_URL under the hood)
  try {
    await loadPDF();
  } catch (err) {
    console.warn("[pdf] loadPDF warn:", err);
  }
});

// --------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------
async function deliverInChunks(msg: Message, content: string) {
  const chunks = splitForDiscord(content, 1900);
  if (!chunks.length) return;

  // Send first chunk immediately
  await msg.reply(chunks[0]);

  // Queue the rest for "more"
  const rest = chunks.slice(1);
  if (rest.length) {
    setPending(msg.channel.id, rest);
    await msg.reply(`_(reply **more** for the next part • **stop** to clear)_`);
  } else {
    clearPending(msg.channel.id);
  }
}

// --------------------------------------------------------------------------------
/** Message handler */
// --------------------------------------------------------------------------------
client.on("messageCreate", async (msg) => {
  try {
    // Ignore our own messages and other bots
    if (msg.author.bot) return;

    // If a TARGET_CHANNEL_ID is set, only respond in that channel
    if (TARGET_CHANNEL_ID && msg.channel.id !== TARGET_CHANNEL_ID) return;

    const text = (msg.content || "").trim();
    if (!text) return;

    const lower = text.toLowerCase();

    // -------------------------------
    // Paged delivery controls
    // -------------------------------
    if (lower === "more" && hasPending(msg.channel.id)) {
      const next = popNext(msg.channel.id);
      if (next) {
        await msg.reply(next);
        if (!hasPending(msg.channel.id)) {
          await msg.reply("_(end of message)_");
        } else {
          await msg.reply("_(reply **more** for the next part • **stop** to clear)_");
        }
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

    // -------------------------------
    // Admin persona controls
    // -------------------------------
    if (isAdmin(msg.author.id) && /^persona\s+/i.test(text)) {
      const cmd = text.replace(/^persona\s+/i, "").trim();

      if (/^reset$/i.test(cmd)) {
        resetPersona(msg.channel.id);
        await msg.reply("Persona has been reset to defaults for this channel.");
        return;
      }

      const toneMatch = /^tone\s+(friendly|neutral|gruff|acerbic)$/i.exec(cmd);
      if (toneMatch) {
        const tone = toneMatch[1].toLowerCase() as any;
        setPersona(msg.channel.id, { tone });
        await msg.reply(`Tone set to **${tone}**.`);
        return;
      }

      const sliderMatch =
        /^(humor|snark|formality|verbosity|drone|darkness|colloquial|max_history)\s+(\d{1,2})$/i.exec(
          cmd
        );
      if (sliderMatch) {
        const key = sliderMatch[1].toLowerCase() as any;
        const val = Math.max(0, Math.min(10, parseInt(sliderMatch[2], 10)));
        setPersona(msg.channel.id, { [key]: val } as any);
        await msg.reply(`${key} set to **${val}**/10.`);
        return;
      }

      await msg.reply(
        "Persona command not recognized. Try:\n" +
          "- `persona reset`\n" +
          "- `persona tone friendly|neutral|gruff|acerbic`\n" +
          "- `persona humor|snark|formality|verbosity|drone|darkness|colloquial <0-10>`\n" +
          "- `persona max_history <0-20>`"
      );
      return;
    }

    // -------------------------------
    // Memory helpers
    // -------------------------------
    if (/^remember\s*:/i.test(text)) {
      const payload = text.replace(/^remember\s*:\s*/i, "").trim();
      if (!payload) {
        await msg.reply("Give me something to remember: `remember: <note>`");
        return;
      }
      try {
        await remember(msg.channel.id, payload);
        await msg.reply("Noted. I’ll keep that in mind.");
      } catch (err: any) {
        await msg.reply(`Couldn't remember that: ${String(err?.message || err)}`);
      }
      return;
    }

    if (/^forget\s*:/i.test(text)) {
      const payload = text.replace(/^forget\s*:\s*/i, "").trim();
      if (!payload) {
        await msg.reply("Specify what to forget: `forget: <index or text>`");
        return;
      }
      try {
        const ok = await forget(msg.channel.id, payload);
        await msg.reply(ok ? "Forgotten." : "I couldn’t find that memory.");
      } catch (err: any) {
        await msg.reply(`Couldn't forget that: ${String(err?.message || err)}`);
      }
      return;
    }

    if (/^memories$/i.test(text)) {
      try {
        const mems = await listMemoriesAsync(msg.channel.id);
        if (!mems || !mems.length) {
          await msg.reply("_(no memories on file)_");
        } else {
          const body = mems.map((m: any, i: number) => `${i + 1}. ${String(m)}`).join("\n");
          await deliverInChunks(msg, `**Memories**\n${body}`);
        }
      } catch (err: any) {
        await msg.reply(`Couldn't list memories: ${String(err?.message || err)}`);
      }
      return;
    }

    // -------------------------------
    // Main chat flow (prefix removed)
    // Reply to EVERY non-bot message in the designated channel
    // -------------------------------
    const prompt = text;

    const reply = await chat([{ role: "user", content: prompt }], {
      user: msg.author.id,
      channel: msg.channel.id,
    });

    if (!reply) {
      await msg.reply("I hit a snag. Try again in a moment.");
      return;
    }

    await deliverInChunks(msg, reply);
  } catch (err: any) {
    console.error("[handler] error:", err);
    try {
      await msg.reply("I hit a snag. Try again in a moment.");
    } catch {}
  }
});

// --------------------------------------------------------------------------------
/** Graceful shutdown (Render deploys/restarts) */
// --------------------------------------------------------------------------------
async function gracefulShutdown() {
  try {
    console.log("[shutdown] Closing Discord client...");
    await client.destroy();
    console.log("[shutdown] Client closed. Exiting.");
  } catch (err) {
    console.error("[shutdown] Error while closing:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// --------------------------------------------------------------------------------
/** Login */
// --------------------------------------------------------------------------------
client
  .login(DISCORD_TOKEN)
  .catch((err) => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
  });
