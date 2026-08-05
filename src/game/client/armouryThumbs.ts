// The armoury's thumbnail registry — the request side of it, and nothing else.
//
// The owner's read of the shop's option cards was that they "run off the
// window edge and read as identical dark lozenges with an eye glyph. Nothing
// distinguishes a 30-gold item from a 2400-gold one." A glyph cannot: there is
// one helmet glyph for ten helmets, and it is the same glyph on the 30-gold
// spangenhelm and on the 2400-gold Sutton Hoo. So every card gets a real
// photograph of the thing it sells, rendered with the same materials, lights
// and environment map as the mannequin beside it.
//
// WHY THIS IS ITS OWN FILE AND HAS NO IMPORTS THAT SURVIVE COMPILATION.
// `page.tsx` is the landing screen — the first thing a player downloads on a
// phone, over whatever signal he has. `CharacterPreview` is behind
// `next/dynamic` for exactly that reason. The registry is a Map, a queue and a
// set of watchers; if it lived in `armouryStage.ts` then importing it would
// pull three.js, the texture generator and the sky shader into the landing
// bundle to draw an empty card frame. Every import below is `import type`, so
// this module compiles to plain data structures.
//
// `armouryStage.ts` is the other half: it drains `takeThumbJob()` one job per
// frame and calls `publishThumb()` with the picture.
import type { Appearance } from "./characters";
import type { WarriorClass } from "../types";

/**
 * How close the shop stands to the thing it is selling.
 *
 * A crop is not decoration; it decides which item the screen is selling. The
 * owner's screenshot cropped the warrior at the shins with his head near the
 * top edge, so the two things actually on sale — the helm and the face — sat
 * at the frame's weakest point.
 */
export type PreviewLens = "face" | "bust" | "figure" | "fight";

/**
 * Which lens each armoury slot is sold through.
 *
 * `armor` is a bust and not a figure because the audit measured what
 * `ap.armorColor` actually reaches: the two shoulders and a sliver of chest,
 * with the shield over the rest at every bearing a player sees. Framing it as
 * a full figure would be the shop flattering a 510-gold tint.
 */
export const SLOT_LENS: Readonly<Record<string, PreviewLens>> = {
  helm: "face",
  hair: "face",
  hairColor: "face",
  beard: "face",
  beardColor: "face",
  warPaint: "face",
  cloak: "figure",
  armor: "bust",
};

export interface ThumbSpec {
  warriorClass: WarriorClass;
  appearance: Appearance;
  /** Which armoury slot this card belongs to — decides the crop. */
  slot: string;
  faceSeed: number;
}

interface ThumbJob {
  key: string;
  spec: ThumbSpec;
}

const THUMBS = new Map<string, string>();
const QUEUE: ThumbJob[] = [];
const PENDING = new Set<string>();
const WATCHERS = new Set<(key: string, url: string) => void>();

/** True while a stage is mounted and able to take pictures. */
let live = false;

/** Called by `armouryStage.ts` as its canvas comes and goes. */
export function setThumbForgeLive(state: boolean): void {
  live = state;
  if (!state) {
    // Anything still queued when the context goes is not coming back; a card
    // left waiting on it would spin forever behind a placeholder.
    QUEUE.length = 0;
    PENDING.clear();
  }
}

/** Called when the GL context is torn down: the data URLs outlive it, the
 *  pictures do not have to be retaken unless the library was regenerated. */
export function dropThumbCache(): void {
  THUMBS.clear();
  QUEUE.length = 0;
  PENDING.clear();
}

/** Stable cache key. Everything the picture depends on has to be in it. */
export function thumbKey(spec: ThumbSpec): string {
  const a = spec.appearance;
  const lens = SLOT_LENS[spec.slot] ?? "face";
  // A portrait cannot be changed by a cloak and a full figure cannot be
  // changed by a war paint, so neither belongs in the other's key — otherwise
  // staging a cloak silently invalidates and re-renders all ten helmet cards.
  const kit = lens === "face"
    ? [a.helm, a.hairStyle, a.hairColor, a.beardStyle, a.beardColor, a.warPaint]
    : [a.helm, a.cloak, a.armorColor, a.hairStyle, a.beardStyle];
  return [spec.warriorClass, spec.slot, spec.faceSeed, ...kit].join("|");
}

export function cachedThumb(key: string): string | null {
  return THUMBS.get(key) ?? null;
}

/**
 * The picture, or null and a job queued for it. Safe to call every render:
 * a key already drawn or already queued costs one map lookup.
 */
export function requestThumb(spec: ThumbSpec): string | null {
  const key = thumbKey(spec);
  const hit = THUMBS.get(key);
  if (hit) return hit;
  if (live && !PENDING.has(key)) {
    PENDING.add(key);
    QUEUE.push({ key, spec });
  }
  return null;
}

export function watchThumbs(fn: (key: string, url: string) => void): () => void {
  WATCHERS.add(fn);
  return () => { WATCHERS.delete(fn); };
}

/** True while cards are still waiting on a picture. The stage's frame loop
 *  refuses to idle down while this holds. */
export function thumbsWaiting(): boolean {
  return QUEUE.length > 0;
}

/** One job, for the stage's frame loop. Null when there is nothing to draw. */
export function takeThumbJob(): ThumbJob | null {
  return QUEUE.shift() ?? null;
}

/** Puts a job back at the head of the queue — the canvas was too small. */
export function returnThumbJob(job: ThumbJob): void {
  QUEUE.unshift(job);
}

export function publishThumb(key: string, url: string): void {
  THUMBS.set(key, url);
  PENDING.delete(key);
  WATCHERS.forEach((w) => w(key, url));
}

/**
 * What one option looks like when worn, as a spec the forge can shoot.
 *
 * The interesting part is what it takes OFF. A hairstyle cannot be
 * photographed under a helmet and a war paint cannot be photographed under a
 * mask — the audit's sharpest finding is that all four war paints are
 * IDENTICAL under the Sutton Hoo helm, so a player who owns Half-Face Shadow
 * at 110 gold and the helm at 2400 owns nothing he can see. The CARD shows the
 * thing it is selling, bare-headed, because a card of four identical black
 * rectangles sells nothing and explains nothing. The MANNEQUIN behind it goes
 * on wearing everything the player has staged, which is where he finds that
 * out — and finding it out is the shop being honest rather than the shop
 * being flattering.
 */
export function specForOption(
  cls: WarriorClass, faceSeed: number, base: Appearance,
  slot: string, value: string | number,
): ThumbSpec {
  const ap: Appearance = { ...base };
  switch (slot) {
    case "helm": ap.helm = String(value); break;
    case "hair": ap.hairStyle = String(value); break;
    case "hairColor": ap.hairColor = Number(value); break;
    case "beard": ap.beardStyle = String(value); break;
    case "beardColor": ap.beardColor = Number(value); break;
    case "cloak": ap.cloak = String(value); break;
    case "armor": ap.armorColor = Number(value); break;
    case "warPaint": ap.warPaint = String(value); break;
  }
  if (slot === "hair" || slot === "hairColor" || slot === "warPaint") ap.helm = "none";
  if (slot === "beard" || slot === "beardColor") {
    if (ap.helm === "suttonhoo" || ap.helm === "hood") ap.helm = "none";
  }
  // A cloak over the shoulder is exactly what a finish card must not have on.
  if (slot === "armor") ap.cloak = "none";
  return { warriorClass: cls, appearance: ap, slot, faceSeed };
}

/**
 * A stable small integer per profile, for `buildCharacter`'s face traits.
 *
 * Without one the builder falls back to build order, which resolved to 0 for
 * every warrior the old preview ever drew — so the armoury showed every player
 * on earth the same man, and it was not the man he fights as.
 */
export function faceSeedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 4096;
}
