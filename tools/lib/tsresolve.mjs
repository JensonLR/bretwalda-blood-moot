// ============================================================
// TSRESOLVE — a module-resolution hook so a harness can import the SERVER'S
// OWN TypeScript, unchanged, and call the exact function production calls.
//
// WHY A HARNESS NEEDS THIS AT ALL. `src/db/war.ts`'s `bankMatch` is the whole
// attribution write, and until now nothing in the repository could call it
// except Next. So the only instruments that existed were one that never
// touched the database (`wartest`) and one that could only reach the write
// through a socket and a match (`warflow`) — and neither of them could fire the
// SAME REPORT TWICE, which is the one thing the replay guard exists to survive.
// An adversary deleted `if (!inserted.length) return false;` from `bankOne` and
// both suites stayed green, 79/79 and 22/22, while every retry moved the map.
//
// Node 22 strips the types itself. What it will not do is resolve this repo's
// two TypeScript-only conventions, so this hook does exactly those and nothing
// else:
//
//   `@/db/war`   -> <root>/src/db/war.ts     (the tsconfig path alias)
//   `./index`    -> ./index.ts               (extensionless relative imports)
//
// It is a TEST SEAM AND NOT A BUILD STEP. Next compiles the same files with the
// same tsconfig; nothing in `src/` knows this file exists, and if it ever needs
// to, that is the signal that the seam has become a fork.
// ============================================================
import { existsSync } from "fs";
import { dirname, resolve as joinPath } from "path";
import { fileURLToPath, pathToFileURL } from "url";

let ROOT = "";

export async function initialize(data) {
  ROOT = (data && data.root) || process.cwd();
}

const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(joinPath(ROOT, "src", spec.slice(2))).href;
  }
  try {
    return await nextResolve(spec, context);
  } catch (err) {
    // Extensionless. Work out the absolute path it meant, then try the
    // TypeScript endings in the order tsc itself would.
    let base = null;
    if (spec.startsWith("file:")) base = fileURLToPath(spec);
    else if (spec.startsWith(".") && context.parentURL?.startsWith("file:")) {
      base = joinPath(dirname(fileURLToPath(context.parentURL)), spec);
    }
    if (base) {
      for (const ext of CANDIDATES) {
        if (existsSync(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
    throw err;
  }
}
