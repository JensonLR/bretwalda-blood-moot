// WHERE AUTHORED ASSETS LAND.
//
// This was `BRETWALDA - Blood Moot/Assets/StreamingAssets` — a path into a
// Unity project that is no longer built (docs/ONE-CLIENT.md §4.4). The
// exporters themselves were never Unity-specific: they write glTF, OBJ and
// PNG, all of which three.js reads as natively as Unity did. Only the
// destination was.
//
// THIS DIRECTORY IS P2'S INPUT. An exporter writes here; the renderer's asset
// loader will read here; nothing else should know the path. One constant so
// that the next move is one edit rather than fourteen.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The authored-asset sink. Created by the exporters, ignored by git. */
export const GLTF_SINK = resolve(ROOT, "art/gltf");
