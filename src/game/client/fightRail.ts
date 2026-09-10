"use client";
// ============================================================
// THE FIGHT RAIL — the movement-side column of controls, on a screen of any
// shape.
//
// The owner: "This game for mobile should be supported to be played both
// landscape & portrait hand held positions."
//
// It could not be. The manifest pinned `orientation: "portrait"` and said why —
// "the touch controls are laid out for a thumb either side of a portrait
// screen" — and behind that pin the whole movement side was a stack of four
// magic offsets measured down from the top of an 844 px screen: END at 76, the
// mute toggle at 124, the graphics pad at 172, the First Moot's skip at 240.
// Under them the thumb cluster counts UP from the bottom: RUN at 24, the
// handedness button at 92, the ability readout at 152. Two stacks growing
// toward each other, sized for 844 px of height, given 390.
//
// touchtest --w 844 --h 390 photographed the meeting: the skip button drawn
// over the handedness button, and the graphics pad drawn over the ability
// readout. Both are exactly what the arithmetic predicts, and neither had ever
// been measured, because every mobile gate in the tree ran portrait.
//
// WHAT THIS IS. One layout rule with three readers (`page.tsx` owns END and the
// mute toggle, `GameHud.tsx` owns the graphics pad and the skip). The rule:
//
//   * TALL ENOUGH FOR THE COLUMN — hang the column, at the offsets it already
//     shipped with. Portrait is byte-identical; this is not a redesign of a
//     layout four suites already measure.
//   * TOO SHORT — fold the column into TWO, side by side. A landscape phone has
//     no height and a great deal of width, and the rail is the only furniture
//     on that side of the glass that can spend width instead.
//
// AND IT FLOWS FROM A MEASUREMENT, NOT A GUESS. Above the rail sits the timer
// column, whose height depends on the mode — a Burh fight adds a WAVE row, a
// seated bench adds another. Reserving the worst case would push the rail into
// the thumb cluster on the very screens this exists to fix, and computing the
// worst case here would be a second copy of GameHud's render conditions, which
// is `docs/PROCESS.md`'s third failure mode by name. So GameHud measures the
// real element with a ResizeObserver and publishes the number; everything else
// flows below whatever it actually is.
// ============================================================
import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

/** The four buttons that hang on the movement side, in the order they hang. */
export type Rung = "end" | "sound" | "graphics" | "skip";

/**
 * WHAT THE BOTTOM CLUSTER OWNS on the movement side, in px up from the foot.
 *
 * Measured off the controls themselves rather than the design system's 132 px
 * thumb band: RUN sits at 24 and is 56 tall, the handedness button at 92 and is
 * 48, and the ability readout at 152 and is ~44. The readout is the tallest
 * reach and it is the one the graphics pad was landing on, so it — and not the
 * band — is what the rail has to stay clear of.
 */
export const THUMB_RESERVE = 196;

/** Each rung's own box, so the fold can be laid out without measuring four more
 *  elements. These are the classes' own sizes; a rung that changes size changes
 *  here, and `touchtest`'s overlap claim is what catches it if it does not. */
const RUNG = {
  end: { w: 96, h: 40 },
  sound: { w: 44, h: 44 },
  graphics: { w: 48, h: 48 },
  skip: { w: 136, h: 44 },
} as const;

/** The offsets the column shipped with, kept exactly. See `GFX_TOP`'s note in
 *  GameHud for how they were derived; the point of naming them here is that
 *  they are now read rather than retyped. */
const TALL_TOP: Record<Rung, number> = { end: 76, sound: 124, graphics: 172, skip: 240 };

/** The gap the folded rail uses between rungs and between its two columns. */
const FOLD_GAP = 8;
/** The edge inset every rung on the glass already uses. */
const EDGE = 12;

/**
 * ONE OFFSET, PLUS WHATEVER THE HARDWARE IS EATING.
 *
 * `layout.tsx` sets `viewportFit: "cover"`, so the page is laid out edge to
 * edge and the notch, the rounded corners and the home indicator are all drawn
 * OVER it. Four `env(safe-area-inset-*)` uses existed in the tree and every one
 * of them was in a menu (`globals.css:219,220,1083`, `page.tsx:2402`); the
 * fight — the one screen a phone is actually held sideways for — had none.
 *
 * The arithmetic that follows from that: with `orientation: "any"` and a 44–59
 * px landscape inset, the whole 12–16 px-inset control cluster and this rail
 * sit under the notch, and RUN at bottom 24 (h56) and HEAVY at bottom 32 (h68)
 * sit inside the 34 px home-indicator band, where iOS takes the touch for its
 * own gesture before the page ever sees it.
 *
 * Note what this deliberately is NOT: a re-layout. `env()` resolves to 0 on
 * every screen without a cutout — every desktop, the capture box, and the
 * phones `touchtest` and `hudshot` photograph — so the numbers four suites
 * already measure do not move by a pixel. The inset is added only where the
 * hardware actually takes something away.
 *
 * (`touchtest` measures against `window.innerWidth/innerHeight`, which under
 * `viewport-fit=cover` INCLUDES the unsafe region. That is why the harness
 * never caught this and cannot confirm the fix; it needs the insets themselves,
 * which is noted in docs/MOBILE-CONTROLS.md rather than papered over here.)
 */
export function inset(side: "top" | "bottom" | "left" | "right", px: number): string {
  // `var(--safe-*)` and not `env()` directly. The variable is DECLARED as the
  // env() in globals.css, so a real device is byte-identical — but env() can be
  // written by nothing except the browser, and that made this whole fix
  // untestable: `touchtest` measures against a viewport that includes the
  // region the OS is covering, so it could see neither the fault nor the cure.
  // One property a harness can set turns an assertion nobody could make into
  // `tools/safearea.mjs`.
  return `calc(${px}px + var(--safe-${side}, 0px))`;
}

/**
 * Is there room to hang the column?
 *
 * The deepest rung is the skip button, so the question is whether its foot
 * clears what the thumbs own. It is asked of the viewport and of nothing else,
 * so it answers the same for a landscape phone and for a short desktop window —
 * which is right: the fault is the height, not the device.
 */
export function railFolds(h: number): boolean {
  return TALL_TOP.skip + RUNG.skip.h + FOLD_GAP > h - THUMB_RESERVE;
}

export interface RailGeometry {
  /** Viewport height in CSS px. */
  h: number;
  /** The foot of the timer column, measured. */
  readoutBottom: number;
  /** True when the column has been folded into two. */
  folded: boolean;
  /**
   * A mouse is driving. END centres on a fine pointer and hangs on the rail
   * on a coarse one — see `railStyle`.
   *
   * Asked here rather than in a Tailwind `pointer-fine:` class because the
   * class LOST. `railStyle` returns an inline style, an inline declaration
   * beats every class regardless of specificity, and the button carried
   * `pointer-fine:left-1/2 pointer-fine:-translate-x-1/2`: the `left:50%` was
   * overridden by the inline `left`, the TRANSFORM was not, so END rendered at
   * 12 px and was then shifted left by half its own 96 px width. Its left edge
   * sat at −36 px and the player saw "…D SESSION" jammed against the glass.
   *
   * The fix is not a more specific selector. It is that ONE owner decides where
   * a rung goes, which is this file — the same reason `folded` is here and not
   * a media query.
   */
  fine: boolean;
}

/**
 * Where a rung sits, as an inline style.
 *
 * `endShown` is the one presence question the layout has to ask, and it is
 * passed in rather than recomputed: END is solo-only, so on every other mode
 * the mute toggle takes its slot instead of leaving a hole where the rail can
 * least afford one. `page.tsx` hands over the same `mode === "solo"` expression
 * that decides whether to render the button at all — an argument, not a mirror.
 */
/**
 * Is END the wide, centred, spelled-out button?
 *
 * ONE PREDICATE, TWO READERS, and it exists because they had drifted. The
 * POSITION was decided here and the LABEL was decided by a
 * `pointer-fine:hidden` / `pointer-fine:inline` pair in the markup — so on a
 * short desktop window the rail folded (placing its second column at
 * `EDGE + RUNG.end.w + FOLD_GAP` = 116 px) while the label stayed the long one
 * and rendered 159 px wide. END ran from 12 to 171 and straight through the
 * graphics pad and the skip button.
 *
 * `RUNG.end.w` is 96 and it is right: it is the SHORT button. What was wrong
 * was a second rule deciding which button it is. Anything that changes END's
 * size asks this, and `railgate` fails if the two disagree.
 */
export function endIsWide(geo: RailGeometry): boolean {
  return geo.fine && !geo.folded;
}

export function railStyle(rung: Rung, geo: RailGeometry, lefty: boolean, endShown: boolean): CSSProperties {
  const side = lefty ? "right" : "left";
  // END, ON A MOUSE, IS CENTRED — and it is centred HERE.
  //
  // Why it earns the exception is unchanged and is in page.tsx: centred, it
  // straddles the line the touch scheme splits the screen on, so on a thumb it
  // eats free-look drags (touchtest read 223 dead points on a Z Fold). By
  // POINTER and not by width, because a Z Fold's inner screen is 841 px wide
  // AND coarse.
  //
  // Not while folded: the fold is a deliberate two-column layout for a screen
  // with no height, and a rung yanked to the middle of it is not in either
  // column.
  if (rung === "end" && endIsWide(geo)) {
    return {
      position: "absolute",
      top: inset("top", TALL_TOP.end),
      left: "50%",
      transform: "translateX(-50%)",
    };
  }
  if (!geo.folded) return { position: "absolute", top: inset("top", TALL_TOP[rung]), [side]: inset(side, EDGE) };
  // TWO COLUMNS. The first carries the two narrow rungs a player reaches for
  // between fights (END, mute), the second the two he reaches for during one
  // (the graphics pad, the skip) — so the wider column is the outer one and the
  // rail's silhouette narrows toward the free-look half rather than widening
  // into it.
  const col = rung === "end" || rung === "sound" ? 0 : 1;
  const x = EDGE + (col === 1 ? RUNG.end.w + FOLD_GAP : 0);
  const top = geo.readoutBottom + FOLD_GAP;
  // Row 1 clears row 0 by that column's own tallest box.
  const second = col === 0 ? top + RUNG.end.h + FOLD_GAP : top + RUNG.graphics.h + FOLD_GAP;
  const y = rung === "graphics" ? top
    : rung === "skip" ? second
      : rung === "end" ? top
        : endShown ? second : top;
  // `y` is already measured down from the timer column, which is itself laid
  // out below the top inset, so only the horizontal edge needs the cutout here.
  return { position: "absolute", top: y, [side]: inset(side, x) };
}

// ---- the measured foot of the timer column -------------------------------
//
// A module store rather than React state lifted through both trees: the two
// readers are in different components in different files, and the value is one
// number written by one element. `useSyncExternalStore` is what the rest of
// this client already uses for exactly this shape (see `input.ts`).

/** Until something measures: the timer and the ALIVE line, which is every mode
 *  that has no wave and no bench, and the commonest case. */
let readoutBottom = 59;
const listeners = new Set<() => void>();

/** Called by whoever renders the timer column, with its measured foot. */
export function publishReadoutBottom(px: number): void {
  const next = Math.max(24, Math.round(px));
  if (next === readoutBottom) return;
  readoutBottom = next;
  for (const l of listeners) l();
}

/** Live, because a hybrid laptop gains and loses a mouse without a reload. */
const FINE = "(pointer: fine)";
function finePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(FINE).matches;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window === "undefined") return () => { listeners.delete(cb); };
  window.addEventListener("resize", cb);
  // Safari below 14 has no addEventListener on MediaQueryList; the rail is
  // simply not live to a pointer change there, which is the old behaviour and
  // not a crash.
  const mq = window.matchMedia?.(FINE);
  mq?.addEventListener?.("change", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("resize", cb);
    mq?.removeEventListener?.("change", cb);
  };
}

/** One snapshot object per distinct geometry, because `useSyncExternalStore`
 *  compares by identity and a fresh object every call is an infinite render. */
let snap: RailGeometry = { h: 0, readoutBottom, folded: false, fine: false };
function getSnapshot(): RailGeometry {
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  const folded = railFolds(h);
  const fine = finePointer();
  if (snap.h === h && snap.readoutBottom === readoutBottom && snap.folded === folded
    && snap.fine === fine) return snap;
  snap = { h, readoutBottom, folded, fine };
  return snap;
}
/** The server renders the tall column: it is the shipped layout, and a phone
 *  corrects it on its first client frame before anything is pressed. */
const SERVER: RailGeometry = { h: 844, readoutBottom: 59, folded: false, fine: false };

export function useFightRail(): RailGeometry {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}
