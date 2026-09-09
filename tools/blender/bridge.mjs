// BRIDGE — the one place that knows how to make Blender do something.
//
//   import { run, live, doctor } from "./bridge.mjs";
//
// WHY THIS EXISTS. "The Blender MCP is unreliable" was, for months, a true
// sentence about a false cause. Nothing was flaky. Two different projects, both
// calling themselves BlenderMCP, were installed at once and both answer to port
// 9876:
//
//   * Claude Desktop ships the official Blender Lab bridge
//     (~/Library/Application Support/Claude/Claude Extensions/
//      ant.dir.gh.blender.blender-mcp). Its connection.py sends
//         {"type":"execute","code":...,"strict_json":...} + "\0"
//     and then reads until it sees a NUL byte back.
//
//   * Blender has the third-party ahujasid add-on installed
//     (~/Library/Application Support/Blender/5.1/scripts/addons/addon.py,
//      bl_info name "Blender MCP", ~96 mentions of Hyper3D/PolyHaven). It
//     dispatches on
//         {"type":"execute_code","params":{"code":...}}
//     and replies with bare JSON, no delimiter.
//
// So the add-on drops the bridge's message as an unknown type, and the bridge
// blocks waiting for a NUL that is never coming, until its 300 s timeout. Every
// MCP tool that touches the live scene hangs; every tool that reads the bundled
// RST docs or shells out to headless Blender works perfectly. That is the whole
// of the "unreliability" — not a flaky socket, a coin-flip over which half of
// the toolset you happened to reach for.
//
// Measured 9 Sep 2026, both against the same running Blender 5.1.2:
//   bridge protocol  {"type":"execute"} + \0   -> no reply, timed out
//   addon  protocol  {"type":"execute_code"}   -> 0.00 s, {"status":"success"}
//
// WHAT THIS DOES ABOUT IT. It speaks the protocol that is actually installed,
// and it prefers not to need it at all. Two ways to reach Blender:
//
//   headless (default)  spawn `Blender -b -P`, one process per call. Slower to
//                       start (~1.2 s) and reproducible from a cold machine, a
//                       CI runner, or a session with no GUI. This is the
//                       production path and every exporter in this directory
//                       already uses it.
//   live    (opt-in)    talk to the running GUI over 9876, ~0 ms. For looking
//                       at, and nudging, a scene a human has open.
//
// The rule that follows from that split: an asset must never depend on a live
// session to be reproducible. Anything a build needs goes in a .py file next to
// this one and runs headless. The socket is for inspection and iteration, never
// for the hundred invisible scene mutations that a rebuild cannot replay.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const HOST = process.env.BLENDER_MCP_HOST || "127.0.0.1";
const PORT = Number(process.env.BLENDER_MCP_PORT || 9876);

// Blender prints a great deal on the way up and on the way down, and the
// add-on hands back captured stdout as one string. Fencing our own payload
// means a warning about a missing OpenEXR codec cannot be parsed as a result.
const OPEN = "<<<BW_JSON";
const CLOSE = "BW_JSON>>>";

/** Wrap a value so `run()` can find it in a mess of Blender's own chatter. */
export const EMIT = (expr) => `
import json as _bwjson
print(${JSON.stringify(OPEN)}); print(_bwjson.dumps(${expr})); print(${JSON.stringify(CLOSE)})`;

function carve(stdout) {
  const a = stdout.indexOf(OPEN);
  if (a < 0) return undefined;
  const b = stdout.indexOf(CLOSE, a);
  if (b < 0) return undefined;
  const body = stdout.slice(a + OPEN.length, b).trim();
  try { return JSON.parse(body); } catch { return undefined; }
}

/**
 * Is a GUI Blender listening? Resolves false rather than throwing, because
 * "no session open" is the ordinary state, not an error.
 */
export function live(timeoutMs = 700) {
  return new Promise((done) => {
    const s = createConnection({ host: HOST, port: PORT });
    const end = (v) => { s.destroy(); done(v); };
    s.setTimeout(timeoutMs);
    s.once("connect", () => end(true));
    s.once("timeout", () => end(false));
    s.once("error", () => end(false));
  });
}

/**
 * One request to the running add-on, in ITS protocol: bare JSON out, bare JSON
 * back, no framing. We read until the buffer parses, which is what the add-on's
 * own reference client does and the only thing that can work without a
 * delimiter.
 */
export function ask(type, params = {}, timeoutMs = 120_000) {
  return new Promise((done, fail) => {
    const s = createConnection({ host: HOST, port: PORT });
    let buf = "";
    s.setTimeout(timeoutMs);
    s.once("error", (e) => { s.destroy(); fail(new Error(`blender socket: ${e.message}`)); });
    s.once("timeout", () => { s.destroy(); fail(new Error(`blender socket: no reply in ${timeoutMs} ms`)); });
    s.once("connect", () => s.write(JSON.stringify({ type, params })));
    s.on("data", (d) => {
      buf += d.toString("utf8");
      let parsed;
      try { parsed = JSON.parse(buf); } catch { return; }   // keep reading
      s.destroy();
      if (parsed.status === "error") return fail(new Error(`blender: ${parsed.message}`));
      done(parsed.result);
    });
  });
}

/**
 * Run Python in Blender and hand back whatever it EMIT()ed.
 *
 * @param {string} code            Python. Use EMIT(expr) to return a value.
 * @param {object} [opt]
 * @param {boolean} [opt.live]     Use the open GUI session instead of spawning.
 * @param {string}  [opt.blend]    .blend to open first (headless only).
 * @param {string[]}[opt.args]     Passed after `--`, readable via sys.argv.
 * @returns {Promise<{value:unknown, stdout:string, stderr:string}>}
 */
export async function run(code, opt = {}) {
  if (opt.live) {
    if (!(await live())) throw new Error(BLENDER_CLOSED);
    // The add-on captures stdout and returns it, so the fence still works.
    const r = await ask("execute_code", { code });
    const stdout = String(r?.result ?? "");
    return { value: carve(stdout), stdout, stderr: "" };
  }
  if (!existsSync(BLENDER)) throw new Error(`no Blender at ${BLENDER} — set BLENDER=`);
  const dir = mkdtempSync(join(tmpdir(), "bwblend-"));
  const script = join(dir, "run.py");
  try {
    writeFileSync(script, code);
    const argv = ["-b", "-noaudio"];
    if (opt.blend) argv.push(opt.blend);
    argv.push("-P", script);
    if (opt.args?.length) argv.push("--", ...opt.args);
    const r = spawnSync(BLENDER, argv, { encoding: "utf8", maxBuffer: 64 << 20 });
    const stdout = r.stdout || "", stderr = r.stderr || "";
    if (r.status !== 0) {
      // Blender's traceback goes to stdout, so a stderr-only report hides it.
      const tail = (stdout + stderr).trim().split("\n").slice(-12).join("\n");
      throw new Error(`Blender exited ${r.status}\n${tail}`);
    }
    return { value: carve(stdout), stdout, stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export const BLENDER_CLOSED =
  "no GUI Blender on " + HOST + ":" + PORT + " — open /Applications/Blender.app " +
  "(the add-on auto-starts the server, ~2 s), or drop the { live: true } and run headless.";

/**
 * Everything we can learn about the Blender path without changing anything.
 * Named failures beat a stack trace: each field below distinguishes one of the
 * states that all present as "the Blender MCP is broken".
 */
export async function doctor() {
  const out = {
    blenderPath: BLENDER,
    blenderInstalled: existsSync(BLENDER),
    blenderVersion: null,
    headless: false,
    gltfExport: false,
    guiListening: await live(),
    guiSpeaksAddonProtocol: null,   // null = not asked (no GUI)
    guiSpeaksBridgeProtocol: null,
    notes: [],
  };
  if (out.blenderInstalled) {
    try {
      const { value } = await run(EMIT('{"v": bpy.app.version_string, "gltf": hasattr(bpy.ops.export_scene, "gltf")}')
        .replace(/^/, "import bpy\n"));
      out.blenderVersion = value?.v ?? null;
      out.gltfExport = !!value?.gltf;
      out.headless = !!value;
    } catch (e) { out.notes.push(`headless failed: ${e.message.split("\n")[0]}`); }
  } else {
    out.notes.push(`Blender not at ${BLENDER}. Set BLENDER= to its binary.`);
  }
  if (out.guiListening) {
    try { await ask("execute_code", { code: "pass" }, 5000); out.guiSpeaksAddonProtocol = true; }
    catch { out.guiSpeaksAddonProtocol = false; }
    out.guiSpeaksBridgeProtocol = await probeBridgeProtocol();
    if (out.guiSpeaksAddonProtocol && out.guiSpeaksBridgeProtocol === false) {
      out.notes.push(
        "The add-on in Blender is the third-party (ahujasid) build; Claude Desktop's " +
        "MCP extension is the official Blender Lab one. They disagree on the wire " +
        "format, so every MCP tool that touches the live scene hangs for 300 s while " +
        "the doc-search and *_for_cli tools work. Use this bridge, not those tools.");
    }
  } else {
    out.notes.push("No GUI Blender. Headless is unaffected; { live: true } will refuse.");
  }
  return out;
}

/** Does the listener answer the OFFICIAL bridge's framing? Cheap, 3 s cap. */
function probeBridgeProtocol() {
  return new Promise((done) => {
    const s = createConnection({ host: HOST, port: PORT });
    let buf = "";
    const end = (v) => { s.destroy(); done(v); };
    s.setTimeout(3000);
    s.once("error", () => end(null));
    s.once("timeout", () => end(false));   // the diagnostic case: silence
    s.once("connect", () => s.write(JSON.stringify({ type: "execute", code: "pass", strict_json: false }) + "\0"));
    s.on("data", (d) => { buf += d.toString("utf8"); if (buf.includes("\0")) end(true); });
  });
}
