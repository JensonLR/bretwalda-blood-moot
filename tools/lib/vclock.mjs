// ============================================================
// THE FIXED WORLD, SHARED — one clock and one die for every lit probe.
//
// Extracted verbatim from `tools/factionread.mjs` (which lifted it from
// `tools/cosmetictest.mjs`, which lifted it from `tools/shoot.mjs`) so
// `tools/vatprobe.mjs` can stage the same fixed world. The two older copies
// stay where they are — their files document the lineage and re-pointing two
// settled gates to save forty lines is risk spent on nothing. What matters is
// that the ten-minute probe and the two-hour gate agree on what "the same
// picture twice" means: §6.2 of the gate measures the residue at 0.08%, and
// vatprobe's own header used to warn of ±10-30 POINTS on small surfaces —
// the whole of that gap was the unfixed fire.
// ============================================================
export const FRAME_MS = 50;
export function installVirtualClock(stepMs) {
  // xorshift32. Not for cryptography and not for statistics — for repeatability.
  let seed = 0x2545f491;
  Math.random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = 0, queue = [], scheduled = false, nextId = 1;
  const cancelled = new Set();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    if (!scheduled) {
      scheduled = true;
      realRaf(() => {
        scheduled = false;
        vnow += stepMs;
        const batch = queue; queue = [];
        for (const it of batch) if (!cancelled.has(it.id)) it.cb(vnow);
      });
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => { cancelled.add(id); };
  performance.now = () => vnow;
}
