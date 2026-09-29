// ============================================================
// pagesrc — "the page", as source, for the harnesses that read it as TEXT.
//
// Several gates assert things about the menu screens by reading
// `src/app/page.tsx` (a stat bar carries no typed ceiling, the tour's targets
// exist, the round hold is derived from the replay, ...). That was one file until
// the F0 scaffold of the UI overhaul carved the screen components out of it into
// `src/app/ui/*` and reserved `src/app/glyphs/*` for the drawn icons. A gate that
// kept reading only `page.tsx` would go BLIND rather than red: the text it looks
// for now lives next door, so a regex that used to find it finds nothing, and
// "nothing found" reads as green wherever the assertion is "this must not be
// there" (a typed ceiling, a clamp, a raw hex). This module is the single answer
// to "what is the page's source": the page and everything that was carved from it.
//
// Two shapes, because two kinds of gate exist:
//   pageSources()  -> [{ file, text }]   for a gate that reports `file:line`
//   pageSource()   -> one string         for a gate that only asks "is it anywhere"
// ============================================================
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Repo-relative paths of the page and of every module carved out of it or reserved for it. */
export function pageFiles(root = ROOT) {
  const files = ["src/app/page.tsx"];
  for (const dir of ["src/app/ui", "src/app/glyphs"]) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).sort()) if (/\.(ts|tsx)$/.test(f)) files.push(`${dir}/${f}`);
  }
  return files;
}

export function pageSources(root = ROOT) {
  return pageFiles(root).map((file) => ({ file, text: readFileSync(resolve(root, file), "utf8") }));
}

export function pageSource(root = ROOT) {
  return pageSources(root).map((s) => s.text).join("\n");
}
