// ============================================================
// LOCAL PLAYTEST SERVER — Next.js dev (hot reload) + game engine
// + WebSocket on a single port, so you can iterate on the game
// without spending Render free-tier hours.
//
//   npm run play      -> http://localhost:3000
//
// Same wiring as custom-server.mjs, but with `dev: true` so edits
// to the renderer/engine hot-reload in the browser.
// ============================================================
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { networkInterfaces } from "os";
import { getEngine } from "./src/game/engine.mjs";

const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev: true, hostname, port });
const handle = app.getRequestHandler();
const engine = getEngine();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url || "/", true));
});

const wss = new WebSocketServer({ noServer: true });
// Next's dev HMR runs over its own websocket, so anything that isn't the
// game socket has to be handed back to Next instead of dropped.
const upgradeToNext = app.getUpgradeHandler();

server.on("upgrade", (request, socket, head) => {
  const { pathname } = parse(request.url || "/");
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } else {
    upgradeToNext(request, socket, head);
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

// Print every LAN address so you can test from a phone on the same wifi
function lanAddresses() {
  const out = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// A PORT THAT IS ALREADY HELD MUST BE FATAL. Without this the process logs the
// EADDRINUSE and stays alive on its engine tick, listening to nothing — and
// every harness in tools/ that waits for /api/health then gets its answer from
// the STRANGER on the port and measures a build nobody has (the `watchBoot`
// refusal in tools/lib/browser.mjs depends on this exit). In production a
// server that cannot listen should die and be restarted, not idle.
server.on("error", (err) => {
  console.error(`[BRETWALDA] cannot listen on ${hostname}:${port} — ${err && err.code ? err.code : err}`);
  process.exit(1);
});

server.listen(port, hostname, () => {
  console.log("");
  console.log("  \x1b[33m⚔  BRETWALDA: BLOOD MOOT — local playtest\x1b[0m");
  console.log("");
  console.log(`  \x1b[1mThis machine\x1b[0m   http://localhost:${port}`);
  for (const ip of lanAddresses()) {
    console.log(`  \x1b[1mPhone / LAN\x1b[0m     http://${ip}:${port}`);
  }
  console.log("");
  console.log("  Hot reload is on — edit the renderer and the browser updates.");
  console.log("  Render free-tier hours are untouched while you play here.");
  console.log("");
});
