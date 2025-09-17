import http from "http";

export function startHttpServer(port = Number(process.env.PORT) || 3000) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "kael-online" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => console.log(`[HTTP] listening on :${port}`));
}
