import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE BUILD STAMP, and the confusion it exists to kill.
 *
 * The owner reported a defect as "exactly the same as before" on a tree where
 * the gate for it passed and the fix was photographed — and the favicon on
 * their device was old too. Every signal pointed one way: the device was not
 * running the build the repository said it should be. Nothing in the product
 * could confirm or refute that, so the argument had to be had blind.
 *
 * This stamps the short commit hash into the client at build time. Render
 * exposes the deployed commit as RENDER_GIT_COMMIT; a local build asks git.
 * Neither failing is allowed to fail the build — a missing stamp prints
 * "unstamped", which is itself information.
 */
function buildSha(): string {
  const fromEnv = process.env.RENDER_GIT_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch {
    return "unstamped";
  }
}

/**
 * ARE THE AUTHORED WARRIORS IN THIS BUILD?
 *
 * The authored man is DEFAULT ON, on the owner's instruction. He is also, in
 * production today, ABSENT: `public/authored/` and its source `art/blender/`
 * are both in `.gitignore` — "this repository's identity is a game with no
 * binary assets" — and the Dockerfile runs `next build` and never `npm run
 * authored`. Checked, not assumed: `GET /authored/warrior-warden.glb` on the
 * live site is a 404.
 *
 * A default that asks for eleven files that are not there is eleven failed
 * requests a fight and a console full of warnings, for a man the player was
 * never going to see. The renderer already falls back gracefully, so nothing
 * BREAKS — it is just waste, and waste nobody would have noticed.
 *
 * So the default follows the build. Where the assets are present the owner's
 * instruction takes effect exactly as given; where they are absent the client
 * does not go looking. Ship the assets and the default turns itself on, with
 * no second edit and nothing to remember.
 *
 * The graphics-panel switches and the URL door are unaffected: a player on a
 * build with no assets can still turn FORGED MEN on, and will get the same
 * graceful fallback the code has always had. This changes the DEFAULT, which
 * is the thing that should not be spending requests on a guess.
 */
function authoredPresent(): boolean {
  try {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), "public/authored");
    if (!existsSync(dir)) return false;
    // A directory with a stray file in it is not a shipped set. The four bodies
    // are what `loadAuthoredWarrior` asks for by class and the minimum this can
    // mean; helms, hair and beards are per-appearance and may legitimately vary.
    const have = new Set(readdirSync(dir));
    // The CLASS IDS from src/game/types.ts, which are not the names on screen:
    // the runekeeper is shown as WRECCA and the warden as WEARD. Written out
    // rather than imported because this file is loaded by the Next config
    // before any TypeScript path alias exists — and `authoredtest` asserts the
    // same four, so a fifth class breaks a gate rather than this silently.
    return ["huscarl", "warden", "runekeeper", "berserker"]
      .every((c) => have.has(`warrior-${c}.glb`));
  } catch {
    return false;
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_AUTHORED: authoredPresent() ? "1" : "0",
  },
  /**
   * THE WORKSPACE ROOT, PINNED, AND IT WAS NOT WHERE ANYONE THOUGHT.
   *
   * Every build on this machine printed:
   *
   *   We detected multiple lockfiles and selected the directory of
   *   /Users/jensonlr/package-lock.json as the root directory.
   *
   * Turbopack walks up from the project looking for a lockfile and takes the
   * OUTERMOST one it finds, so a stray `package.json` in the developer's home
   * directory — this one holds a single Neon dependency somebody installed
   * there once — silently made the HOME DIRECTORY the workspace root. Module
   * resolution and the file trace for the server output are both scoped to
   * that root, so the build was reaching a level above the repository.
   *
   * Nothing had visibly broken, and that is the reason to pin it rather than
   * to leave it: what a build resolves must not depend on what happens to be
   * lying in a directory the repository does not own, and the failure it can
   * produce — a module resolved from outside the tree — is one that would only
   * ever show up on somebody else's machine.
   *
   * Fixed here and not by deleting the developer's file, because the file is
   * not this repository's to delete and the next checkout would meet the same
   * hazard anyway.
   */
  /**
   * THE AUTHORED WARRIORS ARE WORTH CACHING, AND WERE NOT BEING.
   *
   * Next serves everything under `public/` as `Cache-Control: public,
   * max-age=0`, so a returning player revalidated all eleven authored files on
   * every single load — eleven conditional requests before a fight can upgrade
   * a man. Cheap per file and pointless eleven times, and it got worse the
   * moment the authored man became the default.
   *
   * NOT `immutable`, deliberately. These filenames carry no content hash:
   * `warrior-huscarl.glb` is re-exported from Blender under the same name, so
   * a year-long immutable cache would pin a stale body on every returning
   * player until they cleared their storage. A day is long enough that a
   * session costs one revalidation instead of eleven, and short enough that a
   * re-export reaches people the next time they play.
   *
   * `stale-while-revalidate` is what keeps the fight smooth across the change:
   * the old body is used immediately and the new one is fetched behind it, so
   * the day the assets change nobody waits for them.
   */
  async headers() {
    return [{
      source: "/authored/:path*",
      headers: [{
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800",
      }],
    }];
  },
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
