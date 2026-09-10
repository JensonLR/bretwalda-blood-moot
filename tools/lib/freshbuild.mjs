// ============================================================
// FRESHBUILD — refuse to photograph or measure a bundle older than the source
// it claims to test.
//
// THE INCIDENT, and it is `docs/PROCESS.md` failure mode 1 wearing a new coat.
//
// `warflow` and `warshot` both chose their server like this:
//
//     const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
//     spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"])
//
// and nothing anywhere asked how old that bundle was. In the worktree the war
// spine was built in, `.next/BUILD_ID` predated the commit by seven minutes.
// An adversary then mutated two source files, re-ran `warflow`, and got the
// same 22/22 — because `custom-server.mjs` was serving a bundle compiled
// before either mutation existed. The suite was green about a build nobody had
// made. The 22/22 is true when the run is forced into dev mode; the MECHANISM
// that produced it was not trustworthy, and neither were the PNGs.
//
// A gate that is green because the case is absent is not a gate, and a stale
// bundle makes EVERY case absent at once. So this module answers one question
// — is `.next` newer than every file that feeds it? — and a harness that gets
// "no" does not get to quietly carry on.
//
// WHAT HAPPENS WHEN IT IS STALE is a decision, not a default, and it is this:
// the harness FALLS BACK TO DEV MODE and says so on its verdict line. Dev mode
// compiles from source on demand, so the run measures the source in the
// worktree, which is the thing the harness claims to be about. It does not
// rebuild silently — `next build` is minutes, and a harness that decides on its
// own to spend them is a harness people stop running. Set
// `REQUIRE_FRESH_BUILD=1` to make staleness a hard exit instead, which is what
// a release gate should do.
// ============================================================
import { readdirSync, statSync, existsSync } from "fs";
import { resolve, join } from "path";

/** Everything whose edit invalidates a compiled bundle. */
const WATCHED_DIRS = ["src"];
const WATCHED_FILES = [
  "custom-server.mjs", "dev-server.mjs", "next.config.ts",
  "package.json", "postcss.config.mjs", "tsconfig.json",
];
/** Compiled output and caches, which are of course newer than their input. */
const SKIP_DIRS = new Set([".next", "node_modules", ".git", "art"]);

function newestUnder(path, worst) {
  let st;
  try { st = statSync(path); } catch { return worst; }
  if (st.isDirectory()) {
    let base = path.split("/").pop();
    if (SKIP_DIRS.has(base)) return worst;
    for (const entry of readdirSync(path)) worst = newestUnder(join(path, entry), worst);
    return worst;
  }
  return st.mtimeMs > worst.at ? { at: st.mtimeMs, file: path } : worst;
}

/**
 * The newest source file in the tree, and when it was touched.
 * Returns `{ at, file }`.
 */
export function newestSource(root) {
  let worst = { at: 0, file: "" };
  for (const d of WATCHED_DIRS) worst = newestUnder(resolve(root, d), worst);
  for (const f of WATCHED_FILES) worst = newestUnder(resolve(root, f), worst);
  return worst;
}

/**
 * Which server a harness should spawn, and why.
 *
 * Returns `{ script, prod, mode, note }`. `note` is a sentence written to be
 * printed on a verdict line — `docs/PROCESS.md` R4, every deferral rides the
 * verdict — and it is never empty, because "which build did you measure" is
 * always part of what a harness is claiming.
 */
export function chooseServer(root, label = "harness", opts = {}) {
  // A harness with its own dev switch (USE_DEV, FPSTEST_DEV) passes it here
  // rather than branching around this call — a caller that skips the check to
  // honour its own flag is a caller with no staleness check at all.
  if (opts.forceDev) {
    return {
      script: "dev-server.mjs", prod: false, mode: "dev",
      note: "dev mode (forced by this run)",
    };
  }
  const buildId = resolve(root, ".next/BUILD_ID");
  if (!existsSync(buildId)) {
    return {
      script: "dev-server.mjs", prod: false, mode: "dev",
      note: "dev mode (no .next bundle to test)",
    };
  }
  const built = statSync(buildId).mtimeMs;
  const newest = newestSource(root);
  if (newest.at <= built) {
    return {
      script: "custom-server.mjs", prod: true, mode: "prod",
      note: `production bundle, verified newer than every source file (BUILD_ID ${new Date(built).toISOString()})`,
    };
  }

  const behindMin = Math.round((newest.at - built) / 60000);
  const stale =
    `.next/BUILD_ID is ${behindMin} minute(s) OLDER than ${newest.file.replace(root + "/", "")} ` +
    `— the bundle does not contain the source this run is about`;
  if (process.env.REQUIRE_FRESH_BUILD === "1") {
    console.error(`\n[${label}] REFUSING A STALE BUNDLE: ${stale}`);
    console.error(`[${label}] run \`npm run build\`, or unset REQUIRE_FRESH_BUILD to fall back to dev mode.\n`);
    process.exit(2);
  }
  console.log(`\n[${label}] STALE BUNDLE REFUSED: ${stale}`);
  console.log(`[${label}] falling back to dev mode so this run measures the source in the worktree.\n`);
  return {
    script: "dev-server.mjs", prod: false, mode: "dev",
    note: `dev mode — a STALE .next bundle was refused (${behindMin} min behind ${newest.file.replace(root + "/", "")})`,
  };
}

/**
 * For a harness that MUST have the production bundle — one whose anchors are
 * pinned to built output, or which photographs it.
 *
 * `chooseServer` falls back to dev, which is right for a harness that can
 * measure either. It is wrong for these: dev ships different JavaScript, so
 * falling back would silently change what the numbers mean. Eight harnesses
 * refused a MISSING build and then measured whatever stale one happened to be
 * there — "no production build" and "a production build from before your edit"
 * are the same problem and only one of them was being caught.
 *
 * Exits 2 with the offending file named. Set `ALLOW_STALE_BUILD=1` to proceed
 * anyway, which is for someone deliberately re-measuring an old bundle and
 * should never be set in a gate run.
 */
export function requireFreshBuild(root, label = "harness") {
  const buildId = resolve(root, ".next/BUILD_ID");
  if (!existsSync(buildId)) {
    console.error(`[${label}] NO PRODUCTION BUILD — run \`npm run build\` first.`);
    process.exit(2);
  }
  const built = statSync(buildId).mtimeMs;
  const newest = newestSource(root);
  if (newest.at <= built) return { built, note: `production bundle, newer than every source file` };
  const behindMin = Math.round((newest.at - built) / 60000);
  const rel = newest.file.replace(root + "/", "");
  if (process.env.ALLOW_STALE_BUILD === "1") {
    console.log(`[${label}] WARNING: measuring a bundle ${behindMin} min older than ${rel} (ALLOW_STALE_BUILD=1).`);
    return { built, note: `STALE bundle, ${behindMin} min behind ${rel}, allowed by ALLOW_STALE_BUILD` };
  }
  console.error(`\n[${label}] STALE BUILD: .next/BUILD_ID is ${behindMin} minute(s) older than ${rel}.`);
  console.error(`[${label}] This harness is pinned to production output, so falling back to dev would`);
  console.error(`[${label}] change what the numbers mean. Run \`npm run build\` and try again.\n`);
  process.exit(2);
}
