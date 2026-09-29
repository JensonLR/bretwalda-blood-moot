/**
 * THE EYE'S TEXTURES — a sclera that is darker at the corners, an iris that has a limbal
 * ring, fibres and a catchlight, painted into the parts the export already carries.
 *
 * WHAT THE FRAME SHOWED (CHAR-PLAN CH-03): a sclera the colour of mud (L* 19-35 against
 * skin at L* 46-53), an iris that is a black bead (L* 5.8) and no catchlight. Three faults,
 * and only the first two are colour: the third is the difference between an eye that is
 * looking at you and a hole. The geometry is right (the lids, the globe, the aperture are
 * gated by `eyeclip`), so this is surface work and it can reach the shipped GLBs today.
 *
 * WHY THIS IS POSSIBLE WITHOUT A REBAKE. `attach_textures` in the Blender chain overwrites
 * the UVs of the world-tiled substances (skin among them) and of nothing else, so the eye's
 * parts keep the parameters `patch()` gave them, in the exported GLB, untouched:
 *
 *   sclera  u = across the aperture (medial to lateral, or the reverse: the two eyes share a
 *           frame and the texture is symmetric), v = from the UPPER margin (0) to the LOWER (1)
 *   iris    u = the angle round the disc (0..1 for a turn, running BACKWARDS: `a = -u * 2pi`
 *           in the eye's own frame, whose x is the skull's +x on both eyes), v = ONE MINUS the
 *           radius over the iris radius (1 at the pupil's centre, 0 at the limbus)
 *
 * The v is flipped from what `patch()` wrote (`j / nv` from the lower margin, from the
 * centre) because glTF's v runs down the image and the exporter writes `1 - v`; a texture
 * laid out the way `patch()` documents would have the iris inside out. Both are measured off
 * the shipped files by `tools/facemap.mjs`, which is how the flip was found.
 *
 * THE TEXTURE IS THE ABSOLUTE COLOUR, per man, not a multiplier. The catchlight has to be
 * nearly white whatever the iris is, and a white spot multiplied into a blue material is a
 * darker blue: so the colour is BAKED into a small texture (128 x 32 for an iris, 64 x 16
 * for a sclera: 16 KB and 4 KB) and the material's colour is white. One texture per colour
 * in the table, made on first use.
 *
 * Pure: `DataTexture`s and arithmetic, no DOM.
 */
import * as THREE from "three";

const TAU = Math.PI * 2;
const srgb = (l: number): number => {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};
const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (i: number, j: number): number => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** value noise, periodic in `i` with period `per` */
const noise = (x: number, y: number, per: number): number => {
  const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0;
  const a = hash(((i0 % per) + per) % per, j0), b = hash((((i0 + 1) % per) + per) % per, j0);
  const c = hash(((i0 % per) + per) % per, j0 + 1), d = hash((((i0 + 1) % per) + per) % per, j0 + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

function texture(w: number, h: number, data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** The angle of the catchlight in the eye's own frame: 10 to 11 o'clock, up and toward the skull's -x, where the arena's key stands. */
export const CATCHLIGHT_DEG = 128;

/**
 * The iris, as the colour it is: fibres running out from the pupil, a lighter collarette
 * round it, a darker outer zone, the catchlight. `hex` is the man's iris colour (sRGB).
 */
export function irisTexture(hex: number): THREE.DataTexture {
  const W = 128, H = 32;
  const data = new Uint8Array(W * H * 4);
  const base = new THREE.Color(hex);
  const light = base.clone().lerp(new THREE.Color(0xe8dcc0), 0.32);   // the collarette: lighter, and a little warm on a cool eye
  const dark = base.clone().multiplyScalar(0.62);
  // u runs backwards: the angle in the eye's frame is -u * 2pi
  const a0 = (CATCHLIGHT_DEG * Math.PI) / 180;
  const u0 = ((-a0 / TAU) % 1 + 1) % 1;
  for (let j = 0; j < H; j++) {
    const s = 1 - (j + 0.5) / H;          // glTF's v runs down the image: row 0 is the limbus
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const fibre = 0.5 * noise(u * 26, s * 3, 26) + 0.3 * noise(u * 61 + 7, s * 6, 61) + 0.2 * noise(u * 11 + 3, s * 2, 11);
      const c = base.clone();
      c.lerp(light, smooth(0.36, 0.52, s) * (1 - smooth(0.52, 0.72, s)) * 0.85);   // the collarette
      c.lerp(dark, smooth(0.62, 0.95, s) * 0.9);                                    // the outer zone toward the limbus
      c.multiplyScalar(0.72 + 0.56 * fibre);                                        // the fibres
      // the catchlight: a soft-edged spot, a bright point inside a softer glow, in the visible annulus of the disc
      const du = Math.min(Math.abs(u - u0), 1 - Math.abs(u - u0)) * TAU * 0.62 * 6.1;   // mm along the arc at radius 0.62
      const dv = (s - 0.62) * 6.1;
      const d2 = du * du + dv * dv;
      const glow = Math.exp(-d2 / (2 * 0.55 * 0.55));
      const spot = Math.exp(-d2 / (2 * 0.28 * 0.28));
      c.lerp(new THREE.Color(0xfbf8ee), Math.min(1, 0.35 * glow + 0.95 * spot));
      const o = (j * W + i) * 4;
      data[o] = srgb(c.r); data[o + 1] = srgb(c.g); data[o + 2] = srgb(c.b); data[o + 3] = 255;
    }
  }
  return texture(W, H, data);
}

/**
 * The sclera, as the colour it is: the man's off-white in the middle, going toward the
 * warm shadow at both corners (the caruncle and the lateral fold are pink and dark), and
 * a little under the upper lid, where the lid's own shade falls on the ball. Symmetric
 * across the aperture, because the two eyes share the parameterisation and are mirror
 * images of one another.
 */
export function scleraTexture(hex: number): THREE.DataTexture {
  const W = 64, H = 16;
  const data = new Uint8Array(W * H * 4);
  const base = new THREE.Color(hex);
  const corner = base.clone().multiply(new THREE.Color(0.66, 0.46, 0.44));    // warm, dark, a little pink
  for (let j = 0; j < H; j++) {
    const s = 1 - (j + 0.5) / H;          // row 0 is the upper margin (glTF's v runs down the image)
    for (let i = 0; i < W; i++) {
      const t = (i + 0.5) / W;
      const e = Math.abs(t * 2 - 1);                     // 0 at the middle of the aperture, 1 at a corner
      const c = base.clone();
      c.lerp(corner, smooth(0.55, 1.0, e) * 0.92);
      c.multiplyScalar(1 - 0.30 * smooth(0.55, 1.0, s) - 0.14 * smooth(0.28, 0.0, s));
      const o = (j * W + i) * 4;
      data[o] = srgb(c.r); data[o + 1] = srgb(c.g); data[o + 2] = srgb(c.b); data[o + 3] = 255;
    }
  }
  return texture(W, H, data);
}
