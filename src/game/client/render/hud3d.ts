// In-world HUD: nameplates, health bars, floating damage numbers.
//
// This is the only thing in the frame that is interface rather than world, and
// it is held to a different test than everything else in this directory: it has
// to stay readable in the worst frame the game can produce. Against a blown
// horizon and against black turf, at two metres and at forty, with eight plates
// stacked on one another. Legibility beats decoration here every single time —
// a treatment that looks handsome in `duel` and costs a read in `brawl` is the
// wrong treatment.
//
// Two things about the pipeline shape everything below.
//
// First, this draws into postfx's linear HDR beauty buffer, and the grade at the
// end of the chain applies exposure, a contrast power and a filmic curve
// normalised to a white point several stops above 1.0. A colour picked by eye in
// a paint program lands about two stops darker than it looks. That is the whole
// story of the black-box bug: the old backing quad's 0x1a0a08 is 0.009 units of
// linear radiance, the curve maps that to a code value of about two, and with
// nothing to de-overlap it, three warriors in a line stacked three of those
// translucent backings on top of each other and sealed off what little sky came
// through. Every bar in `brawl` rendered as a solid black slab. So colours here
// are authored as *radiance* — see `radiance()` — and the design leans on bright
// ink and thin dark grooves rather than on dark fills the curve will eat.
//
// Second, plates live in the scene, not on the warrior's rig group, and they are
// oriented by copying the camera's rotation rather than by `lookAt`. `lookAt`
// aims at the camera's *position* around a world up-vector, so under a pitched
// camera it rolls every plate away from frame centre — which is why the old bars
// sat at an angle while the sprite nameplates above them stayed level. Owning
// the transform outright is also what makes de-overlap possible at all: plates
// have to be moved in *screen* space to stop stacking, and you cannot do that
// through a parent whose rotation you do not control.
//
// Materials are per-instance on purpose: the bar tints and drains per warrior
// and the numbers carry their own canvas, so nothing here can be shared with
// materials.ts. Geometry and glyph textures are shared and refcounted.

import * as THREE from "three";
import { LAYER_UNOCCLUDED, setLayerDeep, type FrameContext, type QualitySettings, type QualityTier } from "./quality";

export interface Hud3D {
  /**
   * Registers a nameplate and health bar tracking a warrior's rig group.
   * `headTop` is the crown height of that warrior in metres; the plate is hung
   * a fixed clearance above it.
   */
  attach(id: string, name: string, parent: THREE.Object3D, isLocal: boolean, headTop?: number): void;
  detach(id: string): void;
  setHealth(id: string, current: number, max: number): void;
  spawnDamageNumber(amount: number, at: { x: number; z: number }, big: boolean): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * A HUD colour, expressed as scene radiance rather than as a display value.
 *
 * `hex` carries the hue and `gain` says where on the grade's curve the brightest
 * channel lands. Roughly: 0.04 is a groove that reads as carved shadow, 1.2 is
 * confident ink, 1.9 is the brightest thing worth putting on screen before the
 * crosstalk term starts walking it toward white and it loses its hue.
 */
function radiance(hex: number, gain: number): THREE.Color {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return c.multiplyScalar(gain / Math.max(c.r, c.g, c.b, 1e-4));
}

// Health reads as *value* here, not as saturation, and that is forced rather
// than chosen: the grade's crosstalk term walks anything past its knee toward
// its own peak channel, so a bright red comes out of the curve as dusty pink and
// a bright green as sage. Fighting it by picking a more saturated hex does not
// work — the term keys off brightness. So the three states descend the curve as
// health falls, healthy sitting high and bright, critical low and genuinely red.
// A bar that dims as it empties turns out to be the better read anyway.
const FILL_HEALTHY = radiance(0x35d94e, 1.25);
// Amber rather than orange: orange is mostly red, and red is exactly the channel
// the crosstalk has already saturated, so it comes back off the curve as brick.
const FILL_WOUNDED = radiance(0xffc21a, 0.95);
const FILL_CRITICAL = radiance(0xff2a14, 0.62);
/**
 * The streak a hit leaves behind: the brightest thing on the plate for a beat.
 * White rather than a hue, because a coloured streak beside a coloured fill is
 * one more thing to decode, and at critical health a bright orange streak beside
 * a dark red fill reads as the health rather than as the loss.
 */
const FILL_LAG = radiance(0xfff4e6, 1.45);

// Cool limewashed bone, deliberately not warm — the rim sits directly against
// the wounded amber and a warm rim makes that state unreadable.
const RIM_REMOTE = radiance(0xc6c3b4, 1.02);
const RIM_LOCAL = radiance(0xf3c469, 1.2);
/** Deep umber. The grade will crush this nearly to black, which is the point. */
const TROUGH = radiance(0x1c1210, 0.045);

/**
 * Mood is a tint on the ink, not a second set of glyph textures. Last stand
 * pulls the whole interface toward the fire the same way the grade pulls the
 * frame, so the HUD belongs to the moment rather than floating above it.
 */
const TINT_DUSK = new THREE.Color(1, 1, 1);
const TINT_LAST_STAND = new THREE.Color(1.12, 0.9, 0.76);

/** Canvas glyphs are display-referred; this is what lifts them onto the curve. */
const GLYPH_GAIN = 1.2;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Clearance over the crown, in metres. The crown itself comes from the caller —
 * anim.ts measures it off the built body — because character proportion is not
 * this module's to know and a constant here goes wrong the moment it changes.
 * This is the only number the plate's height is entitled to have an opinion on.
 */
const HEAD_CLEARANCE = 0.26;
/** Used only when a caller attaches without measuring. A 1.98 m man plus helm. */
const ANCHOR_FALLBACK = 2.03 + HEAD_CLEARANCE;

// Plate-local geometry. The bar is deliberately thinner than the one it
// replaces — it is a status line, not a slab — and the name is the taller of the
// two, because at any real distance the name is what you are actually reading.
const BAR_W = 1.0;
const BAR_H = 0.085;
const NAME_H = 0.29;
const NAME_GAP = 0.055;

/**
 * Distance where the plate is exactly its authored world size. Nearer than this
 * it shrinks a little, further it grows — but only as `dist^0.55`, so a warrior
 * across the arena keeps a legible bar without shouting as loudly as the one in
 * front of you. Full screen-space compensation is the mistake here: it makes the
 * back of a brawl exactly as loud as the front and the eye has nowhere to land.
 */
const REF_DIST = 9;
const NEAR_POWER = 0.45;
const FAR_POWER = 0.72;

// Distance is carried by size, not by opacity. Fading a plate out at the range a
// shield wall actually forms at just means you cannot read the fight; the ramp
// only exists to retire plates that are no longer part of it.
const FADE_START = 30;
const FADE_END = 46;
/** Inside this the plate is in the player's face; it dissolves rather than clips. */
const NEAR_FADE_IN = 1.3;
const NEAR_FADE_FULL = 2.6;

/**
 * How far a plate may be pushed off its warrior to clear another, in NDC. Past
 * this the plate has stopped pointing at anything and become furniture, so the
 * answer is to make it smaller rather than to keep moving it.
 */
const MAX_PUSH = 0.38;
const PUSH_PAD_Y = 0.006;
const PUSH_PAD_X = 0.004;

// ---------------------------------------------------------------------------
// Bar shader
// ---------------------------------------------------------------------------

const BAR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// Everything is solved against a chamfered box SDF rather than drawn into a
// canvas, because the bar is the one HUD element whose shape has to survive
// being four pixels tall at forty metres and thirty at two. An SDF antialiases
// itself at both; a bitmap picks one and shimmers at the other.
const BAR_FRAG = /* glsl */ `
uniform vec3 uFillColor;
uniform vec3 uLagColor;
uniform vec3 uRimColor;
uniform vec3 uTroughColor;
uniform float uPct;
uniform float uLag;
uniform float uOpacity;
uniform float uAspect;
uniform float uSegments;
uniform float uFlash;
uniform float uSeed;
varying vec2 vUv;

// A box with 45-degree ends. A slot cut with a chisel does not have round caps.
float chiselBox( vec2 p, vec2 b, float ch ) {
	vec2 q = abs( p ) - b;
	float box = min( max( q.x, q.y ), 0.0 ) + length( max( q, 0.0 ) );
	float cut = ( abs( p.x ) + abs( p.y ) - ( b.x + b.y - ch ) ) * 0.70710678;
	return max( box, cut );
}

float hash21( vec2 p ) {
	p = fract( p * vec2( 127.1, 311.7 ) );
	p += dot( p, p + 34.23 );
	return fract( p.x * p.y );
}

void main() {
	// Work in units of the bar's height so the rim, the chamfer and the notches
	// keep the same weight however wide the bar gets.
	vec2 p = vec2( ( vUv.x - 0.5 ) * uAspect, vUv.y - 0.5 );
	vec2 b = vec2( uAspect * 0.5, 0.5 );

	// Three bands, and the order is the whole legibility argument. A dark
	// keyline on the outside is what separates the bar from a blown horizon; a
	// bone rim inside it is what separates it from black turf. Brightness alone
	// cannot win against a sky the grade has already taken to 240, so the plate
	// carries its own dark edge and stops trying.
	float dOut = chiselBox( p, b, 0.22 );
	float aa = max( fwidth( dOut ), 1e-5 );
	float outer = 1.0 - smoothstep( -aa, aa, dOut );

	float dRim = chiselBox( p, b - 0.08, 0.18 );
	float rimIn = 1.0 - smoothstep( -aa, aa, dRim );

	float dIn = chiselBox( p, b - 0.21, 0.12 );
	float inner = 1.0 - smoothstep( -aa, aa, dIn );

	float keyline = clamp( outer - rimIn, 0.0, 1.0 );
	float rim = clamp( rimIn - inner, 0.0, 1.0 );

	float fw = max( fwidth( vUv.x ), 1e-5 );
	float fill = inner * ( 1.0 - smoothstep( uPct - fw, uPct + fw, vUv.x ) );
	float lag = clamp( inner * ( 1.0 - smoothstep( uLag - fw, uLag + fw, vUv.x ) ) - fill, 0.0, 1.0 );

	// Tally notches, one per 25 health. A hit that crosses two of them is
	// visibly twice a hit that crosses one, which is a thing you can read at a
	// glance in a way that a proportion of a smooth bar is not.
	float seg = vUv.x * uSegments;
	float tick = abs( fract( seg + 0.5 ) - 0.5 );
	float notch = 1.0 - smoothstep( 0.0, max( fwidth( seg ), 1e-5 ) + 0.05, tick );
	notch *= inner * ( 1.0 - smoothstep( 0.28, 0.42, abs( p.y ) ) );

	// Limewash wears off a carved edge long before it wears out of the groove.
	float wear = hash21( floor( vec2( vUv.x * 70.0, vUv.y * 4.0 ) ) + uSeed );

	vec3 col = uTroughColor;
	col = mix( col, uLagColor, lag );
	col = mix( col, uFillColor * ( 0.94 + 0.10 * wear ), fill );
	// A tally mark is cut into the stone, so it catches light in an empty groove
	// and shadows against a filled one. Same mark, opposite sign.
	col = mix( col, mix( uRimColor * 0.3, col * 0.25, max( fill, lag ) ), notch * 0.8 );
	col = mix( col, uRimColor * ( 0.88 + 0.14 * wear ), rim );
	col = mix( col, uTroughColor * 0.7, keyline );
	col += uFlash * ( 0.55 + 0.75 * fill );

	// The dark bands stay a hair short of opaque so the plate reads as inset
	// into the frame rather than stuck on top of it — but only a hair. At 0.84
	// the sun behind the horizon comes straight through the groove and the bar
	// loses its bottom end exactly where the frame is brightest.
	float alpha = mix( 0.95, 1.0, max( fill, max( lag, rim ) ) );
	gl_FragColor = vec4( col, outer * alpha * uOpacity );
}
`;

// ---------------------------------------------------------------------------
// Glyph canvases
// ---------------------------------------------------------------------------

const SERIF = "Cinzel, 'Trajan Pro', Georgia, 'Times New Roman', serif";

/** Deterministic per-name wear, so two capture runs produce the same frame. */
function seedFrom(text: string): () => number {
  let h = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Glyphs {
  texture: THREE.CanvasTexture;
  /** Width / height of the drawn area, so the quad never stretches the type. */
  aspect: number;
  /**
   * Fraction of the canvas width the drawn glyphs actually cover. The quad is a
   * fixed aspect so type never stretches, which means a short name carries a lot
   * of empty texture — and de-overlap has to spread plates by the ink, not by
   * the quad, or four-letter names shove each other halfway up the screen.
   */
  ink: number;
  /** Cache key, carried so a release is a delete rather than a search. */
  key: string;
  refs: number;
}

/** Manual tracking: canvas letterSpacing is not universally typed or supported. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return w - track;
}

function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number, stroke: boolean): void {
  let cx = x;
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cx, y);
    else ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
}

// Sized so the type nearly fills the canvas, leaving only enough margin for the
// halo. Padding here is not free: the quad is a fixed aspect, so every wasted
// row of canvas is glyph height thrown away on screen at the same world size.
const NAME_CANVAS: Record<QualityTier, { w: number; h: number; size: number }> = {
  high: { w: 512, h: 112, size: 60 },
  medium: { w: 384, h: 84, size: 45 },
  low: { w: 256, h: 56, size: 30 },
};

/**
 * A nameplate with no slab behind it. Legibility comes from a three-stage
 * outline — a wide soft shadow that separates it from a bright sky, a hard dark
 * stroke that holds the letterform against dark turf, and a light bevel on the
 * upper edge that reads as a chiselled face rather than a drop shadow.
 */
function buildNameGlyphs(key: string, name: string, isLocal: boolean, tier: QualityTier): Glyphs {
  const spec = NAME_CANVAS[tier];
  const c = document.createElement("canvas");
  c.width = spec.w;
  c.height = spec.h;
  const ctx = c.getContext("2d")!;
  const text = (name || "warrior").substring(0, 16);
  const rand = seedFrom(text);

  const track = spec.size * 0.07;
  let size = spec.size;
  ctx.font = `600 ${size}px ${SERIF}`;
  // Enough side margin for the halo, and no more.
  const room = spec.w - spec.size * 0.8;
  const measured = trackedWidth(ctx, text, track);
  if (measured > room) {
    size = Math.max(spec.size * 0.5, size * (room / measured));
    ctx.font = `600 ${size}px ${SERIF}`;
  }

  const width = trackedWidth(ctx, text, size * 0.07);
  const x = (spec.w - width) * 0.5;
  const y = spec.h * 0.7;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  // Soft halo first: this is what survives being drawn over the blown horizon.
  ctx.shadowColor = "rgba(6,4,3,0.95)";
  ctx.shadowBlur = size * 0.34;
  ctx.strokeStyle = "rgba(6,4,3,0.95)";
  ctx.lineWidth = size * 0.19;
  drawTracked(ctx, text, x, y, size * 0.07, true);
  drawTracked(ctx, text, x, y, size * 0.07, true);
  ctx.shadowBlur = 0;

  // Hard stroke: the letterform's own edge, against dark ground.
  ctx.strokeStyle = "rgba(14,9,7,0.98)";
  ctx.lineWidth = size * 0.13;
  drawTracked(ctx, text, x, y, size * 0.07, true);

  // Chiselled face: a warm gradient down the glyph, lighter at the top where a
  // carved letter catches the sky.
  const grad = ctx.createLinearGradient(0, y - size * 0.78, 0, y + size * 0.16);
  if (isLocal) {
    grad.addColorStop(0, "#fff2c8");
    grad.addColorStop(0.55, "#ffd67e");
    grad.addColorStop(1, "#e0a341");
  } else {
    grad.addColorStop(0, "#fffaf0");
    grad.addColorStop(0.55, "#efe4cd");
    grad.addColorStop(1, "#bfae91");
  }
  ctx.fillStyle = grad;
  drawTracked(ctx, text, x, y, size * 0.07, false);

  // Bevel highlight along the top edge only.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = isLocal ? "#fff8dc" : "#ffffff";
  drawTracked(ctx, text, x, y - size * 0.035, size * 0.07, false);
  ctx.globalAlpha = 1;

  // Weathering, kept to nicks at the scale of a chisel slip. Anything heavier
  // starts eating strokes and the name stops being a name.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i++) {
    ctx.globalAlpha = 0.2 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(x + rand() * width, y - size * (0.1 + rand() * 0.55), size * (0.02 + rand() * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The plate crosses a lot of the frame edge-on at range; without this the
  // type crawls under SMAA.
  tex.anisotropy = 4;
  return { texture: tex, aspect: spec.w / spec.h, ink: width / spec.w, key, refs: 0 };
}

const DMG_CANVAS: Record<QualityTier, { w: number; h: number; size: number }> = {
  high: { w: 192, h: 128, size: 76 },
  medium: { w: 160, h: 106, size: 64 },
  low: { w: 112, h: 74, size: 44 },
};

/**
 * Damage numbers say two things and they say them in this order: *someone was
 * hit* and *by roughly this much*. Magnitude is carried by size, weight and
 * temperature together rather than by the digits, because in a brawl nobody
 * reads the digits — they read whether the thing that appeared was small and
 * bone-white or large and burning.
 */
function buildDamageGlyphs(key: string, amount: number, weight: 0 | 1 | 2, tier: QualityTier): Glyphs {
  const spec = DMG_CANVAS[tier];
  const c = document.createElement("canvas");
  c.width = spec.w;
  c.height = spec.h;
  const ctx = c.getContext("2d")!;
  const text = String(amount);
  const size = spec.size * (weight === 2 ? 1 : weight === 1 ? 0.82 : 0.68);
  const cx = spec.w * 0.5;
  const cy = spec.h * 0.5 + size * 0.35;

  ctx.font = `700 ${size}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  if (weight === 2) {
    // A gash behind a heavy hit, long enough to read past both ends of the
    // numerals — the digits' own halo swallows whatever crosses them, so a mark
    // that only lives behind the type reads as two stray dots and nothing else.
    // Same job as the number being bigger, one channel further out, so the blow
    // lands before the eye has focused on what it says.
    ctx.strokeStyle = "rgba(150,26,12,0.55)";
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - size * 1.02, cy - size * 0.02);
    ctx.lineTo(cx + size * 1.02, cy - size * 0.66);
    ctx.stroke();
  }

  ctx.shadowColor = "rgba(4,2,2,0.95)";
  ctx.shadowBlur = size * 0.4;
  ctx.strokeStyle = "rgba(6,3,2,0.95)";
  ctx.lineWidth = size * (weight === 2 ? 0.2 : 0.16);
  ctx.strokeText(text, cx, cy);
  ctx.strokeText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(18,9,6,0.98)";
  ctx.lineWidth = size * 0.1;
  ctx.strokeText(text, cx, cy);

  const grad = ctx.createLinearGradient(0, cy - size, 0, cy + size * 0.2);
  if (weight === 2) {
    grad.addColorStop(0, "#fff4d0");
    grad.addColorStop(0.4, "#ffb63a");
    grad.addColorStop(1, "#e0521c");
  } else if (weight === 1) {
    grad.addColorStop(0, "#fffdf4");
    grad.addColorStop(0.6, "#ffe9b8");
    grad.addColorStop(1, "#d8a862");
  } else {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#cfc4ae");
  }
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return { texture: tex, aspect: spec.w / spec.h, ink: 1, key, refs: 0 };
}

// ---------------------------------------------------------------------------

interface Plate {
  parent: THREE.Object3D;
  isLocal: boolean;
  /** Height above the rig origin this plate tracks. Measured off the warrior. */
  anchorY: number;
  group: THREE.Group;
  bar: THREE.Mesh;
  /** Drawn behind everything with depth off: what an occluded warrior leaves. */
  ghost: THREE.Mesh | null;
  name: THREE.Mesh;
  glyphs: Glyphs;
  barUniforms: Record<string, THREE.IUniform>;
  ghostOpacity: THREE.IUniform | null;
  nameMat: THREE.MeshBasicMaterial;
  /** Plate-local half extents, before the distance scale. */
  halfW: number;
  halfH: number;
  centreY: number;
  pct: number;
  lag: number;
  lagHold: number;
  flash: number;
  /** Seconds since this warrior hit zero health. Negative while alive. */
  dying: number;
  push: number;
  /** Screen-space rect for de-overlap, refilled every frame. */
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  /** The bar's own screen rect, which is what a compacted plate collapses to. */
  ndcY: number;
  barHx: number;
  barHy: number;
  /** Name dropped because the stack was too deep to solve by pushing. */
  compact: boolean;
  dist: number;
  /** World units per unit of NDC height at this plate's depth, this frame. */
  worldPerNdc: number;
  alpha: number;
  live: boolean;
}

interface FloatingNumber {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glyphs: Glyphs;
  age: number;
  life: number;
  weight: 0 | 1 | 2;
  vel: THREE.Vector3;
  spin: number;
  base: number;
}

export function createHud3d(scene: THREE.Scene, settings: QualitySettings): Hud3D {
  const plates = new Map<string, Plate>();
  const order: Plate[] = [];
  const live: FloatingNumber[] = [];
  const pool: FloatingNumber[] = [];
  /** This frame's visible plates, nearest first. Reused so a frame allocates nothing. */
  const placed: Plate[] = [];

  /**
   * Slide `p` up until it clears everything already placed. Three sweeps,
   * because clearing one plate can walk into another and a small fixed number
   * is cheaper and steadier under a moving camera than iterating to a fixpoint.
   */
  function settle(p: Plate, upto: number, from: number, hx: number, hy: number): number {
    let y = from;
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < upto; j++) {
        const q = placed[j];
        if (Math.abs(p.sx - q.sx) > hx + q.hx + PUSH_PAD_X) continue;
        const minGap = hy + q.hy + PUSH_PAD_Y;
        if (Math.abs(y - q.sy) >= minGap) continue;
        y = q.sy + minGap;
      }
    }
    return y;
  }

  // One unit quad behind every plate, bar, ghost and number in the game.
  const quad = new THREE.PlaneGeometry(1, 1);

  const nameCache = new Map<string, Glyphs>();
  const dmgCache = new Map<string, Glyphs>();
  const DMG_CACHE_MAX = 40;

  const tint = new THREE.Color().copy(TINT_DUSK);
  const glyphInk = new THREE.Color();
  const camPos = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camRight = new THREE.Vector3(1, 0, 0);
  const camFwd = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();

  // Damage numbers landing on the same body in the same instant have to be told
  // apart, so each one remembers where the last one went in.
  const lastDmgAt = new THREE.Vector3(1e6, 0, 1e6);
  let lastDmgTime = -10;
  let clock = 0;

  function acquireName(name: string, isLocal: boolean): Glyphs {
    const key = `${name}|${isLocal ? 1 : 0}`;
    let g = nameCache.get(key);
    if (!g) {
      g = buildNameGlyphs(key, name, isLocal, settings.tier);
      nameCache.set(key, g);
    }
    g.refs++;
    return g;
  }

  function releaseName(g: Glyphs): void {
    if (--g.refs > 0) return;
    nameCache.delete(g.key);
    g.texture.dispose();
  }

  /**
   * Damage amounts repeat constantly inside a match, so these are cached and
   * only evicted once the map outgrows its cap — and never while a number that
   * is still on screen is holding one.
   */
  function acquireDamage(amount: number, weight: 0 | 1 | 2): Glyphs {
    const key = `${amount}|${weight}`;
    let g = dmgCache.get(key);
    // Re-insert so the eviction sweep walks a genuine recency order.
    if (g) dmgCache.delete(key);
    else g = buildDamageGlyphs(key, amount, weight, settings.tier);
    dmgCache.set(key, g);
    g.refs++;
    return g;
  }

  function releaseDamage(g: Glyphs): void {
    g.refs--;
    if (dmgCache.size <= DMG_CACHE_MAX) return;
    for (const entry of Array.from(dmgCache.values())) {
      if (dmgCache.size <= DMG_CACHE_MAX) break;
      if (entry.refs > 0) continue;
      dmgCache.delete(entry.key);
      entry.texture.dispose();
    }
  }

  function detach(id: string): void {
    const plate = plates.get(id);
    if (!plate) return;
    scene.remove(plate.group);
    (plate.bar.material as THREE.Material).dispose();
    if (plate.ghost) (plate.ghost.material as THREE.Material).dispose();
    plate.nameMat.dispose();
    releaseName(plate.glyphs);
    plates.delete(id);
    const at = order.indexOf(plate);
    if (at >= 0) order.splice(at, 1);
  }

  function retire(n: FloatingNumber): void {
    scene.remove(n.mesh);
    releaseDamage(n.glyphs);
    pool.push(n);
  }

  /**
   * How large a plate should be at this distance, in world units per unit of
   * plate-local height. Sub-linear on both sides of the reference distance: near
   * plates back off a little so they stop filling the frame, far ones grow but
   * never enough to match the front of the fight.
   */
  function distanceScale(dist: number): number {
    const t = Math.max(dist, 0.5) / REF_DIST;
    return Math.pow(t, t < 1 ? NEAR_POWER : FAR_POWER);
  }

  return {
    attach(id, name, parent, isLocal, headTop) {
      if (plates.has(id)) return;

      const glyphs = acquireName(name, isLocal);
      const group = new THREE.Group();

      const barUniforms: Record<string, THREE.IUniform> = {
        uFillColor: { value: FILL_HEALTHY.clone() },
        uLagColor: { value: FILL_LAG.clone() },
        uRimColor: { value: (isLocal ? RIM_LOCAL : RIM_REMOTE).clone() },
        uTroughColor: { value: TROUGH.clone() },
        uPct: { value: 1 },
        uLag: { value: 1 },
        uOpacity: { value: 1 },
        uAspect: { value: BAR_W / BAR_H },
        uSegments: { value: 4 },
        uFlash: { value: 0 },
        uSeed: { value: (seedFrom(id)() * 64) | 0 },
      };

      const barMat = new THREE.ShaderMaterial({
        uniforms: barUniforms,
        vertexShader: BAR_VERT,
        fragmentShader: BAR_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const bar = new THREE.Mesh(quad, barMat);
      bar.scale.set(BAR_W, BAR_H, 1);
      bar.renderOrder = 992;
      group.add(bar);

      // The ghost shares every uniform except its opacity, so a health change is
      // one write and both passes follow it.
      let ghost: THREE.Mesh | null = null;
      let ghostOpacity: THREE.IUniform | null = null;
      if (settings.tier !== "low") {
        ghostOpacity = { value: 0 };
        const ghostMat = new THREE.ShaderMaterial({
          uniforms: { ...barUniforms, uOpacity: ghostOpacity },
          vertexShader: BAR_VERT,
          fragmentShader: BAR_FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        });
        ghost = new THREE.Mesh(quad, ghostMat);
        ghost.scale.copy(bar.scale);
        ghost.renderOrder = 990;
        group.add(ghost);
      }

      // fog: false everywhere in here. Aerial perspective on a nameplate is how
      // a HUD ends up dissolving exactly when the fight spreads out and you
      // most need to know who is where.
      const nameMat = new THREE.MeshBasicMaterial({
        map: glyphs.texture,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      nameMat.color.copy(tint).multiplyScalar(GLYPH_GAIN);
      const nameW = NAME_H * glyphs.aspect;
      const nameMesh = new THREE.Mesh(quad, nameMat);
      nameMesh.scale.set(nameW, NAME_H, 1);
      nameMesh.position.y = BAR_H * 0.5 + NAME_GAP + NAME_H * 0.5;
      nameMesh.renderOrder = 994;
      group.add(nameMesh);

      const top = nameMesh.position.y + NAME_H * 0.5;
      const bottom = -BAR_H * 0.5;
      const plate: Plate = {
        parent, isLocal, group, bar, ghost, name: nameMesh, glyphs,
        anchorY: headTop !== undefined ? headTop + HEAD_CLEARANCE : ANCHOR_FALLBACK,
        barUniforms, ghostOpacity, nameMat,
        halfW: Math.max(BAR_W, nameW * glyphs.ink) * 0.5,
        halfH: (top - bottom) * 0.5,
        centreY: (top + bottom) * 0.5,
        pct: 1, lag: 1, lagHold: 0, flash: 0, dying: -1, push: 0,
        sx: 0, sy: 0, hx: 0, hy: 0, ndcY: 0, barHx: 0, barHy: 0, compact: false,
        dist: 0, worldPerNdc: 1, alpha: 1, live: false,
      };
      group.visible = false;
      // Interface, not surface: the occlusion pass must not see it. Without
      // this a plate against the sky wears a dark halo of its own making.
      setLayerDeep(group, LAYER_UNOCCLUDED);
      scene.add(group);
      plates.set(id, plate);
      order.push(plate);
    },

    detach,

    setHealth(id, current, max) {
      const plate = plates.get(id);
      if (!plate) return;
      const safeMax = max > 0 ? max : 1;
      const pct = Math.min(1, Math.max(0, current / safeMax));

      if (pct < plate.pct - 0.0005) {
        // The fill snaps and the lag streak stays put: the gap between them is
        // the hit, and it is the only part of this the player actually reads.
        plate.lagHold = 0.22;
        plate.flash = 1;
      } else if (pct > plate.pct + 0.0005) {
        plate.lag = Math.max(plate.lag, pct);
      }
      plate.pct = pct;
      if (pct <= 0 && plate.dying < 0) plate.dying = 0;
      if (pct > 0) plate.dying = -1;

      // Notches every 25 health, clamped so a boss-sized pool does not turn the
      // trough into a hatched texture.
      plate.barUniforms.uSegments.value = Math.min(8, Math.max(2, Math.round(safeMax / 25)));

      const fill = pct > 0.55 ? FILL_HEALTHY : pct > 0.25 ? FILL_WOUNDED : FILL_CRITICAL;
      (plate.barUniforms.uFillColor.value as THREE.Color).copy(fill);
    },

    spawnDamageNumber(amount, at, big) {
      const weight: 0 | 1 | 2 = big || amount >= 22 ? 2 : amount >= 11 ? 1 : 0;

      let n = pool.pop();
      if (!n) {
        if (live.length >= settings.damageNumberBudget) {
          // Recycling the oldest beats dropping the newest: a hit that produced
          // no feedback reads as a hit that did not land.
          n = live.shift()!;
          scene.remove(n.mesh);
          releaseDamage(n.glyphs);
        } else {
          const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(quad, mat);
          mesh.renderOrder = 996;
          n = { mesh, mat, glyphs: null as unknown as Glyphs, age: 0, life: 1, weight, vel: new THREE.Vector3(), spin: 0, base: 0 };
        }
      }

      const glyphs = acquireDamage(amount, weight);
      const hadMap = n.mat.map !== null;
      n.glyphs = glyphs;
      n.mat.map = glyphs.texture;
      // Going from no map to a map changes the program, not just the binding.
      if (!hadMap) n.mat.needsUpdate = true;
      n.mat.color.copy(glyphInk);
      n.age = 0;
      n.life = weight === 2 ? 1.25 : 0.98;
      n.weight = weight;

      // Chest height, pulled a little toward the camera so a number never opens
      // inside the body that earned it.
      scratch.set(at.x, 1.52, at.z);
      scratch2.copy(camPos).sub(scratch);
      scratch.addScaledVector(scratch2, 0.42 / (scratch2.length() || 1));

      // Blows land in flurries. Two numbers in the same place in the same third
      // of a second have to be told apart or they read as one.
      const stacked = clock - lastDmgTime < 0.4 && scratch.distanceToSquared(lastDmgAt) < 1.4;
      const side = stacked
        ? (Math.random() < 0.5 ? -1 : 1) * (0.42 + Math.random() * 0.3)
        : (Math.random() - 0.5) * 0.34;
      lastDmgAt.copy(scratch);
      lastDmgTime = clock;

      n.mesh.position.copy(scratch);
      if (stacked) n.mesh.position.y += 0.3;
      n.base = n.mesh.position.y;
      // Fan across the camera's right, not the world's X, or the separation
      // collapses to nothing whenever the fight lines up with the view axis.
      n.vel.copy(camRight).multiplyScalar(side);
      n.vel.y += weight === 2 ? 2.35 : 1.85;
      n.spin = weight === 2 ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.22;
      n.mesh.visible = true;
      n.mesh.layers.set(LAYER_UNOCCLUDED);
      scene.add(n.mesh);
      live.push(n);
    },

    update(dt, ctx) {
      clock = ctx.time;
      const camera = ctx.camera;
      // camera.ts poses the camera in step 5 but nothing derives its inverse
      // until the render call, and every projection below needs it this frame.
      // This recomputes a derived matrix; it does not move the camera.
      camera.updateMatrixWorld();
      camPos.setFromMatrixPosition(camera.matrixWorld);
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      tint.copy(ctx.mood === "lastStand" ? TINT_LAST_STAND : TINT_DUSK);
      glyphInk.copy(tint).multiplyScalar(GLYPH_GAIN);

      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
      const aspect = camera.aspect || 1;

      // ---- plates: place, size, fade ----
      for (const plate of order) {
        plate.live = false;

        // A rig that left the scene without a detach must not keep a plate.
        if (!plate.parent.parent) {
          plate.group.visible = false;
          continue;
        }

        if (plate.dying >= 0) {
          plate.dying += dt;
          if (plate.dying > 0.85) {
            plate.group.visible = false;
            continue;
          }
        }

        plate.parent.updateWorldMatrix(true, false);
        anchor.setFromMatrixPosition(plate.parent.matrixWorld);
        anchor.y += plate.anchorY;

        // Behind the eye, project() divides by a negative w and hands back a
        // plausible-looking point in front. Reject on the view vector instead.
        scratch.copy(anchor).sub(camPos);
        const dist = scratch.length();
        if (scratch.dot(camFwd) <= camera.near || dist > FADE_END) {
          plate.group.visible = false;
          continue;
        }
        ndc.copy(anchor).project(camera);

        const scale = distanceScale(dist) * (plate.isLocal ? 1.04 : 1);
        const worldPerNdc = Math.max(dist * tanHalf, 1e-3);

        plate.dist = dist;
        plate.worldPerNdc = worldPerNdc;
        // De-overlap works in a square screen space — NDC x premultiplied by
        // aspect — so that a horizontal gap and a vertical one mean the same
        // thing. Both half-extents therefore divide by worldPerNdc alone; the
        // aspect is already folded into sx.
        plate.sx = ndc.x * aspect;
        plate.ndcY = ndc.y;
        plate.sy = ndc.y + (plate.centreY * scale) / worldPerNdc;
        plate.hx = (plate.halfW * scale) / worldPerNdc;
        plate.hy = (plate.halfH * scale) / worldPerNdc;
        plate.barHx = (BAR_W * 0.5 * scale) / worldPerNdc;
        plate.barHy = (BAR_H * 0.5 * scale) / worldPerNdc;

        let alpha = 1 - smooth(FADE_START, FADE_END, dist);
        alpha *= smooth(NEAR_FADE_IN, NEAR_FADE_FULL, dist);
        if (plate.dying >= 0) alpha *= 1 - plate.dying / 0.85;
        // The local warrior's health already has a screen HUD. In-world this is
        // a name badge that happens to carry a bar, so it sits back a stop.
        if (plate.isLocal) alpha *= 0.86;
        if (alpha <= 0.01) {
          plate.group.visible = false;
          // Drop the de-overlap offset while hidden, so a plate that comes back
          // does not fade in already shoved halfway up the frame.
          plate.push = 0;
          continue;
        }

        plate.alpha = alpha;
        plate.group.visible = true;
        plate.group.scale.setScalar(scale);
        plate.group.quaternion.copy(camera.quaternion);
        plate.group.position.copy(anchor);
        plate.live = true;
      }

      // ---- de-overlap, nearest first ----
      // Warriors lining up behind each other is the normal case in a shield
      // wall, not an edge case, so this runs every frame rather than on demand.
      placed.length = 0;
      for (const plate of order) if (plate.live) placed.push(plate);
      placed.sort(byDistance);

      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const y = settle(p, i, p.sy, p.hx, p.hy);

        if (y - p.sy <= MAX_PUSH) {
          p.compact = false;
          p.push += (y - p.sy - p.push) * Math.min(1, dt * 10);
          p.sy += p.push;
        } else {
          // Too deep a stack to solve by moving. Drop the name and re-place on
          // the bar alone — eight bars in a column still read, eight names on
          // top of each other read as nothing, and the bar is the part that is
          // actually changing during a fight.
          p.compact = true;
          p.hx = p.barHx;
          p.hy = p.barHy;
          const compactY = Math.min(settle(p, i, p.ndcY, p.barHx, p.barHy), p.ndcY + MAX_PUSH);
          p.push += (compactY - p.ndcY - p.push) * Math.min(1, dt * 10);
          p.sy = p.ndcY + p.push;
        }

        p.name.visible = !p.compact;
        if (Math.abs(p.push) > 1e-4) p.group.position.addScaledVector(camUp, p.push * p.worldPerNdc);
      }

      // ---- per-plate material state ----
      for (const plate of order) {
        if (!plate.live) continue;
        const alpha = plate.alpha;

        if (plate.lagHold > 0) plate.lagHold -= dt;
        else if (plate.lag > plate.pct) plate.lag = Math.max(plate.pct, plate.lag - dt * 0.75);
        else plate.lag = plate.pct;

        plate.flash = Math.max(0, plate.flash - dt * 3.6);

        plate.barUniforms.uPct.value = plate.pct;
        plate.barUniforms.uLag.value = plate.lag;
        plate.barUniforms.uFlash.value = plate.flash * plate.flash * 0.55;
        plate.barUniforms.uOpacity.value = alpha;
        // Occluded plates read as an outline at a fifth strength — enough to
        // know a warrior is behind the hut, not enough to argue with the ones
        // you can actually see.
        if (plate.ghostOpacity) plate.ghostOpacity.value = alpha * 0.2;

        const rim = plate.isLocal ? RIM_LOCAL : RIM_REMOTE;
        (plate.barUniforms.uRimColor.value as THREE.Color).copy(rim).multiply(tint);
        plate.nameMat.color.copy(glyphInk);
        plate.nameMat.opacity = alpha;
      }

      // ---- floating numbers ----
      for (let i = live.length - 1; i >= 0; i--) {
        const n = live[i];
        n.age += dt;
        if (n.age >= n.life) {
          live.splice(i, 1);
          retire(n);
          continue;
        }

        n.mesh.position.addScaledVector(n.vel, dt);
        n.vel.y -= 3.4 * dt;
        n.vel.x *= 1 - Math.min(0.9, dt * 2.2);
        n.vel.z *= 1 - Math.min(0.9, dt * 2.2);
        // Never let a number fall back through the body that threw it.
        if (n.mesh.position.y < n.base) n.mesh.position.y = n.base;

        const dist = n.mesh.position.distanceTo(camPos);
        // A punch out of the gate, settling in about a tenth of a second. This
        // is most of what makes a number read before it is consciously seen.
        const pop = n.age < 0.11 ? 0.5 * (1 - n.age / 0.11) : 0;
        const base = (n.weight === 2 ? 0.62 : n.weight === 1 ? 0.48 : 0.38) * (1 + pop);
        const scale = base * distanceScale(dist) * (n.weight === 2 ? 1.1 : 1);
        n.mesh.scale.set(scale * n.glyphs.aspect, scale, 1);
        n.mesh.quaternion.copy(camera.quaternion);
        if (n.spin !== 0) n.mesh.rotateZ(n.spin * (1 - n.age / n.life));

        const inFade = Math.min(1, n.age / 0.05);
        const outFade = 1 - smooth(n.life * 0.5, n.life, n.age);
        n.mat.opacity = inFade * outFade * (1 - smooth(FADE_START, FADE_END, dist));
        n.mat.color.copy(glyphInk);
      }
    },

    dispose() {
      for (const id of Array.from(plates.keys())) detach(id);
      for (const n of live) {
        scene.remove(n.mesh);
        n.mat.dispose();
      }
      for (const n of pool) n.mat.dispose();
      live.length = 0;
      pool.length = 0;
      order.length = 0;
      for (const g of nameCache.values()) g.texture.dispose();
      for (const g of dmgCache.values()) g.texture.dispose();
      nameCache.clear();
      dmgCache.clear();
      quad.dispose();
    },
  };
}

/** Nearest first: the plate closest to the camera is the one that keeps its spot. */
function byDistance(a: Plate, b: Plate): number {
  return a.dist - b.dist;
}

/** Hermite ramp, matching GLSL smoothstep so shader and CPU fades agree. */
function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}
