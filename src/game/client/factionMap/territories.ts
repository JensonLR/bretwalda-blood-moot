/* ==========================================================================
   THE SIXTEEN TERRITORIES, PROJECTED

   `britain.ts` holds the coastline; `src/game/war.mjs` holds the territories.
   This file is the join between them, and it is deliberately thin: it
   projects each territory's boundary rings — authored in degrees, because
   that is the coordinate system the history is recorded in — into the same
   639 x 1000 frame the coastline lives in, and hands back SVG path data.

   NOTHING HERE IS A SECOND TERRITORY TABLE. There is exactly one, in
   `war.mjs`, and it is shared with the server, so the ground a match is fought
   over and the ground this screen draws cannot be two different lists.
   `docs/PROCESS.md` failure mode 3 is what that would be.

   THE CLIP, which is the whole trick and it is britain.ts's, not a new one:
   each ring is a crude polygon that runs well out to sea, and the browser
   clips it to LAND. So a political fill picks up the real Natural Earth
   shoreline exactly and no coast is ever traced by hand twice. It is also why
   the rings may overlap: they are painted in table order and the later one
   wins, which is how Kernow takes its ground out of Wessex and how Mann and
   the Hebrides are cut out of everything at the end.
   ========================================================================== */

import { TERRITORIES, project, type Territory } from "@/game/war.mjs";

/** One territory's rings, as one SVG path. */
function pathOf(t: Territory): string {
  return t.bounds.map((ring) => {
    const points = ring.map(([lat, lon]) => {
      const { x, y } = project(lat, lon);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `M${points.join("L")}Z`;
  }).join("");
}

export interface DrawnTerritory {
  id: string;
  name: string;
  native: string;
  blurb: string;
  /** The people whose ground this was in 878, and the season's opening holder. */
  origin: string;
  seat?: string;
  threshold: number;
  /** The clip polygon, in britain.ts's frame. */
  d: string;
  /** Where the marker and the label sit. */
  x: number;
  y: number;
}

/**
 * Paint order is table order. Stated here as well as in `war.mjs` because it
 * is the kind of implicit contract that survives exactly as long as nobody
 * sorts the array for a legend.
 */
export const DRAWN: readonly DrawnTerritory[] = TERRITORIES.map((t) => {
  const { x, y } = project(t.anchor[0], t.anchor[1]);
  return {
    id: t.id, name: t.name, native: t.native, blurb: t.blurb,
    origin: t.people, seat: t.seat, threshold: t.threshold,
    d: pathOf(t), x, y,
  };
});

export const DRAWN_BY_ID: Readonly<Record<string, DrawnTerritory>> =
  Object.fromEntries(DRAWN.map((t) => [t.id, t]));

/**
 * The four fields, from `globals.css`. Not fresh colours — the palette comment
 * there already says "four peoples need four distinguishable fields", and
 * these are those.
 */
export const FIELD: Readonly<Record<string, { field: string; lit: string; name: string }>> = {
  saxon: { field: "var(--gilt)", lit: "var(--gilt-lit)", name: "Anglo-Saxons" },
  norse: { field: "var(--garnet)", lit: "var(--garnet-lit)", name: "Norse" },
  briton: { field: "var(--moss)", lit: "var(--moss-lit)", name: "Britons" },
  pict: { field: "var(--woad)", lit: "var(--woad-lit)", name: "Picts" },
};

export const PEOPLE_NAME = (id: string): string => FIELD[id]?.name ?? id;
