// ============================================================
// CROWNWINDOW — is there a head where the head belongs, in the pixels the canvas drew?
//
// The owner's words (PROCESS R6), four times over four screens: the armoury /
// oath / lobby / training mannequin is "a torso ending in a neck stump with hair
// strands floating over the collar". Every number this project had about that
// man said he was fine — the swap landed, ten joints repointed, forty-six meshes
// dressed, `head.det` +1, the skull "visible" — because none of them looked at
// the picture, and the picture had no head in it.
//
// So this looks at the picture, and only at where a head must be. The stage
// (`window.__armouryStage`, see `StageProbe` in armouryStage.ts) projects a
// rectangle from the PROCEDURAL crown — the height the builder measured off the
// man it built — draws a frame and reads that rectangle back. This module counts
// what is in it.
//
// THE MEASURE. Skin-hue pixels, H 15-35 deg, S .2-.6, V > .25 (the brief's own
// numbers), as a fraction of the window. A face is the one thing on a warrior
// that is that colour and the one thing the owner's screenshot did not have. It
// is asked only of a man who faces the lens (`FACING`), because the cloak tab
// turns him round on purpose and a back of a head is hair.
//
// WHAT IT CANNOT SEE, so that nobody mistakes it for more than it is: a head on
// the right way up but the wrong way round, a face that is skin-coloured and
// wrong, or a head painted by something that is not the man (a skin-coloured
// pixel in the window passes it). The numbers (`__authored.head`, and the head
// net's verdict) are the other half of the claim and the two are asked together;
// neither is enough alone (PROCESS R3, and `stagehead --paint` proves it).
// ============================================================
import sharp from "sharp";

/** The brief's skin: hue degrees, saturation, value. */
export const SKIN = { hue: [15, 35], sat: [0.2, 0.6], val: 0.25 };

/** The turntable bearing (radians) inside which a man is looking at the lens. */
export const FACING = 1.2;

export function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export const isSkin = (r, g, b) => {
  const [h, s, v] = hsv(r, g, b);
  return h >= SKIN.hue[0] && h <= SKIN.hue[1] && s >= SKIN.sat[0] && s <= SKIN.sat[1] && v > SKIN.val;
};

/** Count a window of RGBA bytes. */
export function measure(rgba, w, h) {
  let skin = 0, lit = 0, sum = 0, sum2 = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    if (isSkin(r, g, b)) skin++;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (y > 46) lit++;
    sum += y; sum2 += y * y;
  }
  const mean = sum / n;
  return { n, skin, skinFrac: skin / n, lit, litFrac: lit / n, meanY: mean, sdY: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}

/**
 * Ask the live stage about the head and count the window.
 * Returns null when there is no stage (nothing mounted, or a tree that predates
 * the probe), and a reading with `win: null` when the head is off the canvas.
 */
export async function readHead(page) {
  const raw = await page.evaluate(() => {
    const st = window.__armouryStage;
    if (!st) return null;
    const win = st.headWindow();
    const base = { lens: st.lens, slot: st.slot ?? null, turn: st.turn, crown: st.crown, ready: st.ready };
    const a = window.__authored ?? null;
    const authored = a && {
      cls: a.cls, ok: a.ok !== false, refused: !!a.refused, why: a.why ?? null,
      net: a.net ?? null,
      head: a.head ? {
        visible: a.head.visible?.length ?? 0, hidden: a.head.hidden?.length ?? 0, skull: a.head.skull ?? null,
        scale: a.head.scale ?? null, det: a.head.det ?? null, boneName: a.head.boneName ?? null,
        crown: a.head.crown ?? null, reach: a.head.reach ?? null, verts: a.head.verts ?? null,
      } : null,
    };
    if (!win) return { ...base, win: null, authored };
    return { ...base, win, px: st.read(win.x, win.y, win.w, win.h), authored };
  });
  if (!raw) return null;
  if (!raw.win) return { ...raw, m: null, rgba: null };
  const rgba = Buffer.from(raw.px.rgba, "base64");
  return { ...raw, px: undefined, rgba, m: measure(rgba, raw.px.w, raw.px.h) };
}

/** Write the window's RGBA as a PNG, for the person who has to LOOK (PROCESS R5). */
export async function saveWindow(reading, file, scale = 3) {
  if (!reading?.rgba) return;
  await sharp(reading.rgba, { raw: { width: reading.win.w, height: reading.win.h, channels: 4 } })
    .resize(reading.win.w * scale, reading.win.h * scale, { kernel: "nearest" }).png().toFile(file);
}

/** One line a person can read, for a log. */
export function describe(r) {
  if (!r) return "no stage";
  if (!r.win) return `head window OFF the canvas (crown ${r.crown?.toFixed?.(3)})`;
  const a = r.authored;
  return `lens ${r.lens}${r.slot ? "/" + r.slot : ""} bearing ${r.turn.toFixed(2)}  window ${r.win.w}x${r.win.h} at (${r.win.x},${r.win.y}) of ${r.win.canvasW}x${r.win.canvasH}`
    + `  skin ${(r.m.skinFrac * 100).toFixed(1)}% (${r.m.skin} px)  lit ${(r.m.litFrac * 100).toFixed(0)}%  sd ${r.m.sdY.toFixed(0)}`
    + `  crown@${(r.win.crownAt * 100).toFixed(0)}% boots@${(r.win.bootsAt * 100).toFixed(0)}%`
    + (a ? `  authored ${a.ok ? "ok" : a.refused ? "REFUSED" : "not ok"} det ${a.head?.det} scale ${JSON.stringify(a.head?.scale)} skull ${a.head?.skull ? "yes" : "NO"} visible ${a.head?.visible}${a.net ? ` net turn ${a.net.turnDeg?.toFixed?.(1)} drift ${a.net.reachDrift?.toFixed?.(3)}` : ""}` : "  (no authored man)");
}

/**
 * Judge a reading. Returns the list of things wrong, empty when there is a head.
 *
 * `bars.skinFrac` is the smallest fraction of the window that may be skin on a
 * man facing the lens, per lens (the window is 27 cm tall at 20 px in the fight
 * lens and ~430 px in the portrait, so a fraction is the only fair unit; the
 * absolute floor `bars.skinPx` covers the fight lens where a fraction of 150 px
 * is a dozen). Both come from `stagehead`'s calibration table.
 */
export function judge(r, bars, { requireAuthored = true } = {}) {
  const bad = [];
  if (!r) return ["no stage is mounted (window.__armouryStage is absent)"];
  if (!r.win) return [`the head window is off the canvas (crown ${r.crown})`];
  const facing = Math.abs(((r.turn + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) <= FACING;
  const b = bars[r.lens];
  if (facing && b) {
    if (r.m.skinFrac < b.skinFrac) bad.push(`skin-hue pixels are ${(r.m.skinFrac * 100).toFixed(1)}% of the crown window, under ${(b.skinFrac * 100).toFixed(1)}% (${r.lens})`);
    if (r.m.skin < b.skinPx) bad.push(`only ${r.m.skin} skin-hue pixels in the crown window, under ${b.skinPx} (${r.lens})`);
  }
  const a = r.authored;
  if (requireAuthored) {
    if (!a) bad.push("no authored man reported on window.__authored");
    else {
      if (a.refused) bad.push(`the head net REFUSED the authored man: ${a.why}`);
      else if (!a.ok) bad.push(`the authored swap did not land: ${a.why}`);
    }
  }
  if (a?.head) {
    const h = a.head;
    if (!(h.det >= 1e-3)) bad.push(`head.det ${h.det} < 1e-3`);
    if (h.skull === null || h.skull === undefined) bad.push("head.skull is null");
    if (!(h.visible > 0)) bad.push("head.visible is empty");
    if (h.scale?.some((c) => !(c >= 0.5))) bad.push(`a head.scale component < 0.5 (${JSON.stringify(h.scale)})`);
  }
  return bad;
}
