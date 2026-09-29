"use client";

// ============================================================
// shell.tsx — the frame every menu screen sits in, the title screen's stat tile, the first-visit
// tour and the two chrome buttons.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: MenuShell, ContentWrap, ScreenHead, LandingStat, TourGuide, SoundToggle, BackButton.
// Owner: UNIT T. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { createTour, TOUR_KEY } from "@/game/tour.mjs";
import { browserStore } from "@/game/tuition.mjs";
import HeroBackdrop from "@/game/client/HeroBackdrop";
import type { Notice } from "./shared";
// UNIT:T glyphs — an empty module today; turn this line into a named import in place.
import "../glyphs/landing";

// Every screen sits inside this. The gutter, the safe areas and the backdrop
// are decided here once so no screen can invent its own edge spacing.
//
// The banner lives here too, and that is a fix rather than tidiness: it used to
// be rendered inside the menu block alone, so a purchase that failed in the
// armoury — or a lobby that lost the link — said nothing at all. A message a
// player cannot see is the same as no message.
export function MenuShell({ children, art = "hall", notice, onDismiss, muted, onMute }: {
  children: React.ReactNode; art?: "hero" | "hall" | "none";
  notice?: Notice | null; onDismiss?: () => void;
  muted?: boolean; onMute?: () => void;
}) {
  return (
    <div className="shell">
      {onMute && <SoundToggle muted={muted === true} onToggle={onMute} className="fixed right-3 top-3 z-40" />}
      {art !== "none" && (
        <div className={`backdrop ${art === "hero" ? "backdrop-hero" : "backdrop-hall"}`}>
          {/* The canvas field replaces `.embers`, which was eight CSS dots on a
              26-second loop — see HeroBackdrop for why that read as a still
              image. Landing only: the other screens want a quiet ground behind
              a lot of reading, and a hall on the horizon behind the armoury
              would be competing with the mannequin. */}
          {art === "hero" && <HeroBackdrop />}
        </div>
      )}
      {notice && (
        <div role="status" className="fixed left-1/2 top-4 z-50 w-[92%] max-w-sm -translate-x-1/2">
          <button onClick={onDismiss} className={`card animate-fadeIn w-full !min-h-0 px-5 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur ${
            notice.tone === "good"
              ? "!border-amber-400/70 !bg-amber-950/85 text-amber-100"
              : "!border-red-600/70 !bg-red-950/85 text-red-200"
          }`}>
            {notice.text}
          </button>
        </div>
      )}
      <div className="shell-inner">{children}</div>
    </div>
  );
}

// The centred column. `wide` is for screens that put two things side by side
// on a large viewport; everything else stays at a reading measure so a 1440px
// desktop does not stretch a list of four items across the whole window.
export function ContentWrap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`wrap ${wide ? "wrap-wide" : ""} screen`}>{children}</div>;
}

// One masthead treatment for every screen, so a heading is never just the next
// element after whatever preceded it.
export function ScreenHead({ overline, title, lede, center, onBack, aside }: {
  overline?: string; title: string; lede?: string; center?: boolean;
  onBack?: () => void; aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {onBack && <BackButton onClick={onBack} />}
      <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${center ? "justify-center" : ""}`}>
        {/* The min-width forces an aside onto its own line on a phone rather
            than squeezing the lede into a 3-word column beside it. */}
        <div className={`screen-head min-w-[18rem] flex-1 ${center ? "screen-head-center" : ""}`}>
          {overline && <div className="label-overline">{overline}</div>}
          <h1>{title}</h1>
          {/* Only under a centred masthead: off to one side the plait has no
              axis to sit on and reads as a stray rule. */}
          {center && <div className="knot-band w-full max-w-[16rem]" />}
          {lede && <p>{lede}</p>}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function LandingStat({ value, label, cls = "text-amber-100" }: { value: React.ReactNode; label: string; cls?: string }) {
  return (
    <div className="min-w-0 px-1 text-center">
      <div className={`font-display text-sm ${cls}`}>{value}</div>
      <div className="truncate text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">{label}</div>
    </div>
  );
}

/**
 * One tap, everywhere, and it looks the same everywhere. `data-snd="none"`
 * keeps the delegated tap off it: a button that silences the game must not make
 * a noise on the way, and un-silencing it says `confirm` for itself.
 */
/**
 * THE TOUR — five doors, pointed at, after the oath.
 *
 * The owner: "...then a tour of the armoury, the sage, training, find a fight,
 * create a match." `src/game/tour.mjs` owns which doors there are, who is owed
 * the walk and what happens when one is not on the glass; this is the drawing.
 *
 * IT MEASURES THE BUTTON. `data-tour` is on the real control and the ring is
 * that element's own rect, read on mount and on every resize — a tour with its
 * own idea of the layout points at the wrong corner the first time a button
 * moves, and this codebase has spent a day on exactly that class of fault.
 * `has()` is the same measurement, so a door that is not rendered is stepped
 * over by the module rather than ringed at the origin.
 *
 * The scrim takes the whole glass and the ring is a hole in it: everything is
 * dimmed EXCEPT the door being named, which is the one thing a tour has to do.
 * The card places itself under the ring, or over it when the ring is low
 * enough that under would be off the foot of a phone.
 */
export function TourGuide({ onDone }: { onDone: () => void }) {
  const store = browserStore(TOUR_KEY);
  const seen = useCallback((target: string) =>
    typeof document !== "undefined" && !!document.querySelector(`[data-tour="${target}"]`), []);
  const tourRef = useRef<ReturnType<typeof createTour> | null>(null);
  const [stop, setStop] = useState<{ title: string; line: string; target: string; at: number; total: number } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Built after mount, never during render: `createTour` reads localStorage and
  // walks the DOM through `has`, and neither exists on the server.
  useEffect(() => {
    // On a 0 ms timer, so the effect body itself sets no state — the cascade
    // react-doctor flags, and the same shape the First Moot's own first write
    // uses. A ring appearing one task after the landing screen commits is not
    // observable, and the module has to read localStorage and walk the DOM
    // before it can say whether there is anything to draw at all.
    const t0 = setTimeout(() => {
      const t = tourRef.current ?? (tourRef.current = createTour({ ...store, has: seen }));
      const s = t.stop;
      setStop(s ? { title: s.title, line: s.line, target: s.target, at: t.at, total: t.total } : null);
    }, 0);
    return () => clearTimeout(t0);
    // `store` and `seen` are stable for the life of this component (one is a
    // fresh object per render but only its two closures are used, and they
    // close over a constant key); the tour is built once by the ref guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ring follows the button, including through a rotation — which is not
  // hypothetical now that the game plays in landscape.
  useEffect(() => {
    const target = stop?.target;
    const read = () => {
      const el = target ? document.querySelector(`[data-tour="${target}"]`) : null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    // Same 0 ms deferral as above, and here it earns something besides the
    // lint: the ring is measured after the browser has laid the button out,
    // which on the first commit of the landing screen it has not.
    // THE VIEW GOES WHERE THE TOUR POINTS. The stops are measured, never
    // placed — but on a desktop the hall is taller than the window and a door
    // below the fold was ringed off-screen while the scrim held the page
    // still (owner, 3 Sep 2026: "just freezes on desktop so can't see what
    // it's showing"). Each stop is scrolled to the middle of the window
    // first; the scroll listener below re-measures as it arrives, and two
    // later reads catch a browser whose smooth scroll ends silently.
    const el0 = target ? document.querySelector(`[data-tour="${target}"]`) : null;
    if (el0 && typeof (el0 as HTMLElement).scrollIntoView === "function") {
      try { (el0 as HTMLElement).scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch { (el0 as HTMLElement).scrollIntoView(); }
    }
    const t0 = setTimeout(read, 0);
    const t1 = setTimeout(read, 450);
    const t2 = setTimeout(read, 900);
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, true);
    return () => {
      clearTimeout(t0); clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read, true);
    };
  }, [stop]);

  if (!stop || !rect) return null;
  const advance = (all: boolean) => {
    const t = tourRef.current;
    if (!t) return;
    if (all) t.skip(); else t.next();
    const s = t.stop;
    setStop(s ? { title: s.title, line: s.line, target: s.target, at: t.at, total: t.total } : null);
    if (!s) onDone();
  };
  // Under the ring by default; above it when under would run off the foot.
  const below = rect.y + rect.h + 190 < (typeof window === "undefined" ? 800 : window.innerHeight);
  return (
    <div className="fixed inset-0 z-[60] animate-fadeIn">
      {/* The hole. Four panels rather than a mask so the ring is a real gap in
          a real scrim on every browser, and so a press anywhere on the dimmed
          part is caught by this layer instead of opening a door he has not
          been told about yet. */}
      {/* THE SCRIM CATCHES, IT DOES NOT ADVANCE. Blocking is what these four
          panels are for — a press on the dimmed part must not reach a door the
          new arrival has not been told about yet — and an element on top
          absorbs the press whether or not it has a handler. Advancing on it as
          well meant one stray click stepped past a door he never read, which
          is the opposite of what a tour is. The card's own NEXT is the way
          on, and it says so on its face. */}
      <div className="absolute inset-x-0 top-0 bg-black/78" style={{ height: Math.max(0, rect.y - 6) }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/78" style={{ top: rect.y + rect.h + 6 }} />
      <div className="absolute bg-black/78" style={{ top: rect.y - 6, height: rect.h + 12, left: 0, width: Math.max(0, rect.x - 6) }} />
      <div className="absolute bg-black/78" style={{ top: rect.y - 6, height: rect.h + 12, left: rect.x + rect.w + 6, right: 0 }} />
      <div className="pointer-events-none absolute rounded-xl border-2 border-amber-400/90 shadow-[0_0_28px_rgba(217,164,65,0.5)]"
        style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />
      <div className="absolute left-1/2 w-[min(22rem,88vw)] -translate-x-1/2 px-1"
        style={below ? { top: rect.y + rect.h + 22 } : { bottom: (typeof window === "undefined" ? 800 : window.innerHeight) - rect.y + 22 }}>
        <div className="card !bg-stone-950/95 p-4 text-center backdrop-blur">
          <div className="text-[9px] font-bold uppercase tracking-[0.34em] text-amber-500/80">
            THE HALL · {stop.at + 1} OF {stop.total}
          </div>
          <div className="font-display mt-1.5 text-lg tracking-[0.14em] text-amber-100">{stop.title}</div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink)]">{stop.line}</p>
          <div className="mt-3.5 flex gap-2">
            <button onClick={() => advance(true)} data-snd="back"
              className="btn-ghost flex-1 !min-h-[2.75rem] !text-[11px]">I&apos;LL LOOK MYSELF</button>
            <button onClick={() => advance(false)} data-snd="confirm"
              className="btn-primary flex-1 !min-h-[2.75rem] !text-[11px]">
              {stop.at + 1 >= stop.total ? "TO THE FIGHT" : "NEXT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SoundToggle({ muted, onToggle, className = "", style }: {
  muted: boolean; onToggle: () => void; className?: string;
  /** Where it hangs, when a caller places it rather than classing it — the
   *  fight rail does, because on a landscape phone that position is arithmetic
   *  and not a Tailwind offset. See `fightRail.ts`. */
  style?: React.CSSProperties;
}) {
  return (
    <button
      style={style}
      onClick={onToggle}
      data-snd="none"
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off — tap for sound" : "Sound on — tap to silence"}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border backdrop-blur transition ${
        muted
          ? "border-stone-600 bg-stone-900/90 text-[var(--ink-faint)] hover:text-[var(--ink)]"
          : "border-amber-700/70 bg-stone-900/90 text-amber-400 hover:border-amber-500 hover:text-amber-300"
      } ${className}`}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} data-snd="back" className="btn-back">
      <ArrowLeft size={16} /> BACK
    </button>
  );
}
