// ============================================================
// CLIENTMODULE — import the CLIENT'S OWN TypeScript and call the exact
// functions the renderer calls.
//
// `tools/factionread.mjs` has done this since it was written: emit
// `src/game/client/render/anim.ts` with `tsc` — which drags `characters.ts` in
// as its own import, so one invocation gets both — patch the extensionless
// relative imports the emit leaves behind, and `import()` the result. Its
// header says why, and the sentence is the whole reason this file exists:
//
//   "a harness that keeps its own copy of a constant audits the constant it
//    was written against"
//
// The moment a SECOND harness needed the same thing — `tools/vatprobe.mjs`,
// which asks §7.1's question per surface and therefore needs `kitFor`,
// `finishKit` and `buildCharacter` — copying thirty lines of emit-and-patch
// would have been the same failure one level up: two harnesses compiling the
// client two ways, and a difference between them impossible to see. So it
// lives here once. docs/PROCESS.md failure mode 3.
//
// IT IS A TEST SEAM AND NOT A BUILD STEP. Nothing in `src/` knows it exists;
// Next compiles the same files with the same tsconfig for the real client.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";

/**
 * Compile the client into `<root>/<work>` and import it.
 *
 * Returns `{ CH, ANIM, work }` — `characters.js`'s module, `anim.js`'s (null if
 * the emit produced none), and the directory, so a caller can clean up.
 * Throws with the compiler's own output when nothing is emitted: a default here
 * would be a harness quietly measuring a build it did not make.
 */
export async function loadClient(root, work = ".clientmodule") {
  const dir = resolve(root, work);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts",
    "--outDir", work, "--target", "es2022", "--module", "esnext",
    "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: root, encoding: "utf8" });
  const emitted = [];
  let charJs = null, animJs = null;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = resolve(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".js")) {
        emitted.push(f);
        if (e.name === "characters.js") charJs = f;
        if (e.name === "anim.js") animJs = f;
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  // `tsc` emits the source's own extensionless relative specifiers, which Node
  // will not resolve. Rewritten here rather than by a loader hook so the files
  // on disk are the files that ran.
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  if (!charJs) throw new Error(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
  const CH = await import(pathToFileURL(charJs).href);
  const ANIM = animJs && existsSync(animJs) ? await import(pathToFileURL(animJs).href) : null;
  return { CH, ANIM, work: dir };
}
