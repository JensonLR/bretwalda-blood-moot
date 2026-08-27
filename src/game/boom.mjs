// THE CAMERA BOOM'S OCCLUSION MARCH (backlog 8.7) — a pure module for the
// same reason `spectate.mjs` is one: the rule for how far the follow camera
// may stand from the man has ONE home, imported by the rig that moves the
// lens and by the headless claims in `tools/solidtest.mjs`. A second copy in
// a harness is a harness that cannot fail when this changes.
//
// The jank strip photographed the follow camera inside a palisade post: the
// boom had no idea the world was solid. The march walks the boom line from
// just behind the man's head out to the wanted length, sampling against the
// ground's OWN obstacle table — the one `resolveSolids` walks for movement —
// so what blocks a stride blocks the lens, and there is exactly one opinion
// about what is solid. A solid shorter than the sample's height does not
// block: the camera films OVER a wood pile, and only pulls in for things
// that would actually eat the frame.
import { solidDistance } from "./solidground.mjs";

/**
 * How much of the wanted boom is clear.
 *
 * The side offset and the height ride the boom's fraction (`t / want`), so a
 * pulled camera slides down the same line the full one sat on. Returns the
 * longest length whose every sample stands clear — `want` itself on an open
 * line, never less than `min` (a camera inside the man's head is a worse
 * frame than one inside a post).
 *
 * @param occluders The ground's obstacle table; passables are skipped here,
 *   so a caller may hand the table over unfiltered.
 * @param opts { want, min, step, clear, lookY, camY } — the rig's own
 *   constants, passed rather than owned so this module states geometry only.
 */
export function clearBoom(occluders, focusX, focusZ, fwdX, fwdZ, sideX, sideZ, opts) {
  const { want, min, step, clear, lookY, camY, bound } = opts;
  for (let t = min; t <= want + 1e-6; t += step) {
    const k = t / want;
    const px = focusX - fwdX * t + sideX * k;
    const pz = focusZ - fwdZ * t + sideZ * k;
    const py = lookY + (camY - lookY) * k;
    // THE RING GOES FIRST AND THE SOLIDS GO LAST — resolveSolids' own order,
    // for the same reason: the palisade is the PLAY BOUND, not an obstacle
    // row, and the strip's post was the bound's own fence. A man backed
    // against it puts the full boom OUTSIDE the pen, which is exactly the
    // photographed defect. No height check on the ring: the arena edge is a
    // wall to the lens whatever world.ts happens to build on it.
    if (Number.isFinite(bound) && Math.hypot(px, pz) > bound - clear) {
      return Math.max(min, t - step);
    }
    for (const s of occluders) {
      if (s.kind !== "solid") continue;
      if (s.height + clear <= py) continue;
      if (solidDistance(s, px, pz) < clear) return Math.max(min, t - step);
    }
  }
  return want;
}
