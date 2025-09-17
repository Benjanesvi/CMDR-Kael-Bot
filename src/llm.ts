// src/llm.ts
import OpenAI from "openai";

// Persona + memory
import {
  getPersonaAsync,
  modelParamsFromPersona,
  personaOverrideText,
} from "./persona.js";
import { memoryContext } from "./memory.js";

// Tools (live data + PDF search)
import { toolLIVE } from "./tools/live.js";
import { queryPDF } from "./tools/pdf.js";

// Small utility
function trimDiscord(s: string, max = 8000) {
  if (!s) return s;
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

// ------------------------------------------------------------------------------------
// OpenAI client
// ------------------------------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ------------------------------------------------------------------------------------
// Tool Schemas for Responses API
// (Keep names stable; they must match the executor switch below.)
// ------------------------------------------------------------------------------------
const tools = [
  {
    type: "function" as const,
    name: "toolLIVE",
    description:
      "Elite: Dangerous live intel. EDSM-first, with EliteBGS/INARA fallback. " +
      "Use this to query systems, factions, traffic, stations, markets, shipyards, outfitting, or spatial search (sphere/cube).",
    parameters: {
      type: "object",
      properties: {
        detail: {
          type: "string",
          description:
            "What you want. One of: snapshot | bodies | stations | factions | traffic | deaths | value | market | shipyard | outfitting | sphere | cube",
          enum: [
            "snapshot",
            "bodies",
            "stations",
            "factions",
            "traffic",
            "deaths",
            "value",
            "market",
            "shipyard",
            "outfitting",
            "sphere",
            "cube",
          ],
        },
        system: { type: "string", description: "System name (if applicable)" },
        station: { type: "string", description: "Station name (if applicable)" },
        radiusLy: {
          type: "number",
          description: "Radius in LY for sphere search (sphere)",
        },
        sizeLy: {
          type: "number",
          description: "Side length in LY for cube search (cube)",
        },
        faction: { type: "string", description: "Faction name (optional)" },
        commander: { type: "string", description: "CMDR name (optional)" },
        showHistory: {
          type: "boolean",
          description: "If true, include recent history when available",
        },
      },
      required: ["detail"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "toolBGS_PDF",
    description:
      "Search the Black Sun Crew BGS reference PDF for relevant paragraphs. Use when you need rules/guidance not covered by live data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords/phrase to search for in the PDF. Keep it focused (e.g. 'retreat', 'conflict', 'states', 'cooldown').",
        },
        limit: {
          type: "number",
          description: "Max number of paragraphs to return (default 5).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------------------------------
// Tool Execution
// ------------------------------------------------------------------------------------
async function runToolByName(name: string, args: any) {
  try {
    switch (name) {
      case "toolLIVE": {
        // Your consolidated live tool will internally fan out to EDSM/EliteBGS/INARA as needed
        return await toolLIVE(args || {});
      }
      case "toolBGS_PDF": {
        const q = String(args?.query || "").slice(0, 240);
        const lim = Math.max(1, Math.min(10, Number(args?.limit ?? 5)));
        const hits = queryPDF(q, lim);
        return { query: q, results: hits };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { error: String(err?.message || err) };
  }
}

// ------------------------------------------------------------------------------------
/**
 * Build the system instructions for Kael:
 * - Persona sliders → system guardrails
 * - Memory context (compact)
 * - Non-negotiable canon for LTT 14850 retreat rule, tone constraints, etc.
 */
// ------------------------------------------------------------------------------------
function buildSystem(personaText: string, memText: string) {
  const core = [
    "You are CMDR Kael Veyran — a battle-scarred Elite: Dangerous veteran. " +
      "Voice is darkly pragmatic, terse, useful. No corporate chirp. No 'as an AI'.",
    "Non-negotiables:",
    "- Serve Space Force and Black Sun Crew first.",
    "- LTT 14850 is Black Sun Crew’s home system; **no retreat can occur there**. Treat this as canon.",
    "- Contempt for Oblivion Fleet is cold and strategic, never juvenile.",
    "- Be concise; if long, offer 'more' pagination.",
  ].join("\n");

  const mem = memText ? `\n${memText}` : "";
  return `${core}\n\n${personaText}${mem}`;
}

// ------------------------------------------------------------------------------------
// Extract text from Responses API output
// ------------------------------------------------------------------------------------
function extractText(res: any): string {
  // The official SDK exposes output_text with the concatenated text.
  const t = (res && (res.output_text as string)) || "";
  if (t) return t;

  // Fallback: try to walk output array if present
  const out = Array.isArray(res?.output) ? res.output : [];
  const texts: string[] = [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (typeof c?.text === "string") texts.push(c.text);
      }
    }
    if (typeof item?.text === "string") texts.push(item.text);
  }
  return texts.join("\n").trim();
}

// ------------------------------------------------------------------------------------
// Extract tool calls from Responses API output
// ------------------------------------------------------------------------------------
type ToolCall = { id: string; name: string; arguments: any };

function extractToolCalls(res: any): ToolCall[] {
  const calls: ToolCall[] = [];
  const out = Array.isArray(res?.output) ? res.output : [];

  for (const item of out) {
    // Some SDK builds emit {type:"tool_call", name, arguments, id}
    if (item?.type === "tool_call" && item.name) {
      let args: any = {};
      try {
        args = typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments || {};
      } catch {
        args = item.arguments || {};
      }
      calls.push({ id: item.id || cryptoRandomId(), name: item.name, arguments: args });
    }

    // Some emit {type:"message", tool_calls:[...]}
    if (item?.type === "message" && Array.isArray(item?.tool_calls)) {
      for (const c of item.tool_calls) {
        if (!c?.function?.name) continue;
        let args: any = {};
        try {
          args = typeof c.function.arguments === "string"
            ? JSON.parse(c.function.arguments)
            : (c.function.arguments || {});
        } catch {
          args = c.function.arguments || {};
        }
        calls.push({ id: c.id || cryptoRandomId(), name: c.function.name, arguments: args });
      }
    }
  }
  return calls;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ------------------------------------------------------------------------------------
// Public chat() API used by index.ts
// ------------------------------------------------------------------------------------
type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string };

export async function chat(userMessages: Msg[], meta?: { user?: string; channel?: string }) {
  const channelId = meta?.channel || "global";

  // Persona + model params
  const persona = await getPersonaAsync(channelId);
  const personaText = personaOverrideText(persona);
  const { temperature, presence_penalty, frequency_penalty } = modelParamsFromPersona(persona);

  // Memory context (compact, synchronous helper). For full async per-channel,
  // you could plumb listMemoriesAsync into here later if desired.
  const memText = memoryContext(channelId, persona.max_history || 10);

  // Build system instructions
  const system = buildSystem(personaText, memText);

  // Final message list (system + user/provided messages)
  const input: Msg[] = [{ role: "system", content: system }, ...userMessages];

  // First pass: let the model think and possibly call tools
  const first = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input,
    tools,
    temperature,
    presence_penalty,
    frequency_penalty,
    metadata: { user: meta?.user, channel: channelId, bot: "CMDR-Kael" },
    // You can add: max_output_tokens to cap cost if desired
  });

  // Execute any tool calls
  const calls = extractToolCalls(first);
  if (calls.length > 0) {
    const toolResults: Msg[] = [];
    for (const c of calls) {
      const result = await runToolByName(c.name, c.arguments);
      toolResults.push({
        role: "tool",
        content: JSON.stringify({ name: c.name, args: c.arguments, result }),
      } as Msg);
    }

    // Follow-up with tool results appended
    const second = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [...input, ...toolResults],
      temperature,
      presence_penalty,
      frequency_penalty,
      metadata: { user: meta?.user, channel: channelId, bot: "CMDR-Kael" },
    });

    return trimDiscord(extractText(second));
  }

  // No tools — return the text directly
  return trimDiscord(extractText(first));
}
