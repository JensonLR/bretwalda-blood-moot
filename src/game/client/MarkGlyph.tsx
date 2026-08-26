"use client";

import { markOf } from "@/game/marks.mjs";

/**
 * One profile mark, drawn inline at text size. Inline SVG rather than an icon
 * font or sprite sheet because the whole set is ten hand-authored paths on a
 * 24px grid (`src/game/marks.mjs`) and `currentColor` is the point: the glyph
 * takes the ink of whatever line it sits in — a lobby row, a gilt winner row,
 * a dimmed locked tile — with no colour prop to drift out of step.
 *
 * Renders nothing for "none" and for any id it does not know: an absent mark
 * is a deliberate look (most men are unmarked), and an unknown one — an old
 * client showing a newer profile, a hostile string off the wire — must not
 * leave an empty box where a device should be.
 */
export function MarkGlyph({ id, size = 15, className = "", title }: {
  id?: string;
  size?: number;
  className?: string;
  /** Accessible name; defaults to the mark's own. Pass "" to hide from AT. */
  title?: string;
}) {
  const mark = markOf(id);
  if (!mark.d) return null;
  const label = title === undefined ? mark.name : title;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`inline-block shrink-0 ${className}`}
      fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label === "" || undefined} role={label === "" ? undefined : "img"}>
      {label !== "" && <title>{label}</title>}
      <path d={mark.d} />
    </svg>
  );
}
