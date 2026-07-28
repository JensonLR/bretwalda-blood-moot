// Custom server: Next.js + game engine + WebSocket on one port
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { getEngine } from "./src/game/engine.mjs";

const dev = false;
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const engine = getEngine();

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url || "/", true);
  handle(req, res, parsedUrl);
});

// WebSocket transport (preferred) on /ws
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const { pathname } = parse(request.url || "/");
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  const sid = engine.connect((str) => {
    try { if (ws.readyState === 1) ws.send(str); } catch { /* closed */ }
  });
  ws.on("message", (raw) => {
    try { engine.message(sid, JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  const cleanup = () => engine.disconnectSession(sid);
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

server.listen(port, hostname, () => {
  console.log(`[BRETWALDA] Server ready on http://${hostname}:${port}`);
  console.log(`[BRETWALDA] WebSocket on /ws + HTTP fallback on /api/game/*`);
});
