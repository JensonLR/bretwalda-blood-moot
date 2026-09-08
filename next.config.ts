import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
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
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
