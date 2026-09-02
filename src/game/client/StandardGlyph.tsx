"use client";
import React from "react";
import { standardOf, TIERS } from "@/game/standards.mjs";

/**
 * A Hearth's standard, drawn inline — the same 24-grid stroke convention as
 * `MarkGlyph`, in `currentColor`, so it sits beside a name at any size. The
 * accessible name carries the tier in as many words, because §9.0 says a
 * device ships with its tier visible and a screen reader is a screen.
 */
export function StandardGlyph({ people, id, size = 15, className = "", title }: {
  people?: string | null;
  id?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  const s = standardOf(people ?? "", id ?? "");
  if (!s) return null;
  const tier = TIERS[s.tier as keyof typeof TIERS];
  const label = title === undefined ? `${s.name} — ${tier.label}` : title;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`inline-block shrink-0 ${className}`}
      fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label === "" || undefined} role={label === "" ? undefined : "img"}>
      {label !== "" && <title>{label}</title>}
      <path d={s.d} />
    </svg>
  );
}
