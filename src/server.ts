import http from "node:http";

// Read Upstash REST creds
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const PORT = Number(process.env.PORT || 3000);

// Minimal REST GET helper for Upstash
async function upstashGet(key: string): Promise<string | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  // Upstash REST "GET" format: GET {URL}/get/{key}
  const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: string | null };
  return json?.result ?? null;
}

function isStale(ts: number | null, maxAgeMs = 120_000): boolean {
  if (!ts) return true;
  return Date.now() - ts > maxAgeMs;
}

const server = http.createServer(async (_req, res) => {
  try {
    const raw = await upstashGet("health:heartbeat");
    let heartbeat: any = null;
    try {
      heartbeat = raw ? JSON.parse(raw) : null;
    } catch {
      heartbeat = null;
    }

    const ts = typeof heartbeat?.ts === "number" ? heartbeat.ts : null;
    const stale = isStale(ts);
    const ok = Boolean(heartbeat?.ready) && !stale;

    const body = {
      ok,
      stale,
      now: new Date().toISOString(),
      last_heartbeat: ts ? new Date(ts).toISOString() : null,
      source_host: heartbeat?.hostname || null,
      bot: heartbeat?.bot || null,
      bot_user_id: heartbeat?.userId || null,
      env: process.env.NODE_ENV || "development",
    };

    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`[status] listening on ${PORT}`);
});
