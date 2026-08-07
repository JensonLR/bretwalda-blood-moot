import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // `.claude/` for the same reason `.gitignore` carries it, and the note there
  // spells it out: the agent harness creates git worktrees INSIDE this
  // repository, and each one is a whole checkout of it. ESLint was walking into
  // them and reporting this project's own twelve findings three times over —
  // once for real and once per worktree — plus their `.next/` build output,
  // which the top-level `.next/**` pattern does not reach. 117 problems, twelve
  // of them true. A count that changes when an unrelated agent opens a worktree
  // is not a gate, and the first thing it costs is somebody's afternoon working
  // out which of the 117 are theirs.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**"]),
]);
