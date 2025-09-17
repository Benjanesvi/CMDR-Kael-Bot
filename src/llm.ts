// src/llm.ts
import OpenAI from "openai";
import { getPersonaAsync, modelParamsFromPersona, personaOverrideText } from "./persona.js";
import { memoryContext } from "./memory.js";
import { toolLIVE } from "./tools/live.js";
import { queryPDF } from "./tools/pdf.js";

function trimDiscord(s: string, max = 8000) {
  if (!s) return s;
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const tools = [
  {
    type: "function" as const,
    strict: true,
    name: "toolLIVE",
    description: "Elite Dangerous live intel.",
    parameters: {
      type: "object",
      properties: {
        detail: { type: "string" },
        system: { type: "string" },
        station: { type: "string" },
        radiusLy: { type: "number" },
        sizeLy: { type: "number" },
        faction: { type: "string" },
        commander: { type: "string" },
        showHistory: { type: "boolean" },
      },
      required: ["detail"],
    },
  },
  {
    type: "function" as const,
    strict: true,
    name: "toolBGS_PDF",
    description: "Search Black Sun Crew BGS PDF.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
];

async function runToolByName(name: string, args: any) {
  switch (name) {
    case "toolLIVE": return await toolLIVE(args || {});
    case "toolBGS_PDF": {
      const q = String(args?.query || "").slice(0, 240);
      const lim = Math.max(1, Math.min(10, Number(args?.limit ?? 5)));
      return { query: q, results: queryPDF(q, lim) };
    }
    default: return { error: `Unknown tool: ${name}` };
  }
}

function buildSystem(personaText: string, memText: string) {
  const core = [
    "You are CMDR Kael Veyran — a battle-scarred Elite: Dangerous veteran.",
    "- Serve Space Force and Black Sun Crew first.",
    "- LTT 14850 is Black Sun Crew’s home system; no retreat there.",
    "- Contempt for Oblivion Fleet is cold and strategic.",
    "- No 'as an AI'.",
  ].join("\n");
  return `${core}\n\n${personaText}\n\n${memText}`;
}

function extractText(res: any): string {
  return (res.output_text as string) || "";
}

type ToolCall = { id: string; name: string; arguments: any };

function extractToolCalls(res: any): ToolCall[] {
  const calls: ToolCall[] = [];
  const out = Array.isArray(res?.output) ? res.output : [];
  for (const item of out) {
    if (item?.type === "tool_call" && item.name) {
      let args: any = {};
      try { args = typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments || {}; }
      catch { args = item.arguments || {}; }
      calls.push({ id: item.id || Math.random().toString(36).slice(2), name: item.name, arguments: args });
    }
  }
  return calls;
}

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string };

export async function chat(userMessages: Msg[], meta?: { user?: string; channel?: string }) {
  const channelId = meta?.channel || "global";
  const persona = await getPersonaAsync(channelId);
  const personaText = personaOverrideText(persona);
  const { temperature, presence_penalty, frequency_penalty } = modelParamsFromPersona(persona);
  const memText = memoryContext(channelId, persona.max_history || 10);
  const system = buildSystem(personaText, memText);

  const input = [
    { role: "system", content: system },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const first = await openai.responses.create({
    input,
    tools,
    temperature,
    strict: true,
});


  const calls = extractToolCalls(first);
  if (calls.length) {
    const toolResults: Msg[] = [];
    for (const c of calls) {
      const result = await runToolByName(c.name, c.arguments);
      toolResults.push({ role: "tool", content: JSON.stringify({ name: c.name, args: c.arguments, result }) });
    }

    const second = await openai.responses.create({
      input,
      tools,
      temperature,
      strict: true,
    });

    return trimDiscord(extractText(second));
  }

  return trimDiscord(extractText(first));
}
