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

/**
 * WHERE THE BROWSER ACTUALLY FETCHES FROM. `authoredSource.ts` asks for
 * `/authored/warrior-<cls>.glb`, and Next serves `/` out of `public/`, so this
 * directory — and only this directory — is reachable by a running client.
 *
 * IT IS NOT `GLTF_SINK`, AND FOR A WHILE EVERY EXPORTER THOUGHT IT WAS.
 * `exportclips.mjs` opens with "A build step with no copy step is a build step
 * that lies", and then copied its warriors into `art/gltf`, which nothing in
 * `src/` has ever read. Grep it: `art/gltf` and `GLTF_SINK` appear nowhere
 * under `src/`, and the directory holds one `armoury.json` and not a single
 * GLB. Four exporters wrote there; nothing read any of it. So `npm run
 * exportclips` could rebuild all fifteen clips, report success, and ship
 * nothing a player could load — which is the precise fault that file exists to
 * prevent, committed inside it.
 *
 * The copy that did reach the client was a shell one-liner in package.json
 * (`npm run authored`), separate from the exporters, remembered by hand.
 *
 * The two are kept as separate constants rather than merged because they mean
 * different things and only one of them is served to the public internet:
 * `GLTF_SINK` is the build's own scratch output, and this is the shipping
 * shelf. An exporter that produces something the RUNTIME needs writes here.
 *
 * WHAT STILL WRITES TO `GLTF_SINK`, AND WHY THAT IS NOW SETTLED. Two exporters
 * do, and both were left as an open question when the warriors were moved. It
 * is not open: neither output is read by anything, and neither should be.
 *
 *   `exportarmoury`  -> art/gltf/armoury.json. A dump of the catalogue for a
 *                       human to read; the client's catalogue is `src/db`, and
 *                       the tool's real job is its `--check` arm (`npm run
 *                       armourytest`). Nothing anywhere reads the file.
 *   `exportportraits`-> art/gltf/portrait-<cls>.png. The portraits a player
 *                       sees are drawn live by `CharacterPreview`; the gate,
 *                       `portraittest`, reads its four PNGs out of
 *                       `art/blender` and never touches this copy.
 *
 * They are DIAGNOSTIC, so they stay where the build's scratch goes. The thing
 * that made the warriors a defect was not the directory — it was that a
 * RUNTIME asset went somewhere no runtime could reach while the log said
 * "shipped".
 */
export const AUTHORED_WEB = resolve(ROOT, "public/authored");
