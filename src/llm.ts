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

// Chat Completions tools
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
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
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
        },
        required: ["detail"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toolBGS_PDF",
      description: "Search Black Sun Crew BGS PDF for relevant guidance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

async function runToolByName(name: string, args: any) {
  switch (name) {
    case "toolLIVE":
      return await toolLIVE(args || {});
    case "toolBGS_PDF": {
      const q = String(args?.query || "").slice(0, 240);
      const lim = Math.max(1, Math.min(10, Number(args?.limit ?? 5)));
      return { query: q, results: queryPDF(q, lim) };
    }
    default:
      return { error: `Unknown tool: ${name}` };
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

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string };

export async function chat(userMessages: Msg[], meta?: { user?: string; channel?: string }) {
  const channelId = meta?.channel || "global";
  const persona = await getPersonaAsync(channelId);
  const personaText = personaOverrideText(persona);
  const { temperature } = modelParamsFromPersona(persona);

  const memText = memoryContext(channelId, persona.max_history || 10);
  const system = buildSystem(personaText, memText);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...userMessages.map((m) => ({ role: m.role as any, content: m.content })),
  ];

  // First turn
  const first = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature,
    messages,
    tools,
    tool_choice: "auto",
  });

  const msg = first.choices[0].message;
  const toolCalls = msg.tool_calls || [];

  if (toolCalls.length > 0) {
    const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    for (const call of toolCalls) {
      const name = call.function?.name || "";
      let args: any = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const result = await runToolByName(name, args);
      toolResults.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    const second = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature,
      messages: [
        ...messages,
        msg,            // the assistant message that requested tools
        ...toolResults, // the tool outputs
      ],
    });

    return trimDiscord(second.choices[0].message.content || "");
  }

  return trimDiscord(msg.content || "");
}
