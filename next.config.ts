import type { NextConfig } from "next";
import { execSync } from "node:child_process";

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
};

export default nextConfig;
