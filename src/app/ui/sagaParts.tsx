"use client";

// ============================================================
// sagaParts.tsx — the Saga (profile) screen's keep panel and stat tile.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: TheKeep, ProfStat.
// Owner: UNIT S. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
// ============================================================

import { useState } from "react";
import { Swords, ArrowLeft, Copy, Check, KeyRound, CloudOff } from "lucide-react";
import type { Link } from "./shared";
// UNIT:S glyphs — an empty module today; turn this line into a named import in place.
import "../glyphs/saga";

/**
 * The only visible surface the whole profile feature has.
 *
 * There is no account, no email and no password anywhere in this game, so the
 * four words below are the entire difference between changing your phone and
 * losing everything you earned. They are therefore given the treatment the war
 * code gets — the largest type on the screen, in a gilt setting — rather than
 * being filed under settings, and they are shown as four numbered stones
 * because the realistic recovery is somebody reading them aloud into a group
 * chat, not copying a string.
 *
 * When there is no database the panel says so plainly instead of hiding. A
 * player whose gold is device-local needs to know it *before* he clears his
 * browser, and there is nothing for him to write down.
 */
export function TheKeep({ link, code, onRestore, onSay }: {
  link: Link; code: string;
  onRestore: (code: string) => Promise<string | null>;
  onSay: (text: string, tone?: "bad" | "good") => void;
}) {
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState("");
  const [trying, setTrying] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [copied, setCopied] = useState(false);

  const words = code.split(/\s+/).filter(Boolean);

  const copy = () => {
    navigator.clipboard?.writeText(code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => onSay("This browser would not let us copy — write the words down instead."));
  };

  const submit = async () => {
    if (!typed.trim() || trying) return;
    setTrying(true);
    const failed = await onRestore(typed);
    setTrying(false);
    setRefusal(failed ?? "");
    if (!failed) { setTyped(""); setEntering(false); }
  };

  return (
    <section className="flex flex-col gap-3">
      {/* The heading has to be true in both states: there are no words to
          promise when there is no database keeping them. */}
      <h2 className="section-title">
        <KeyRound size={12} className="shrink-0" />
        {link === "server" ? "THE WORDS THAT BRING YOU BACK" : "WHERE YOUR HOARD IS KEPT"}
      </h2>

      {link === "reaching" && (
        <div className="card animate-pulse px-4 py-5 text-center text-[13px] text-[var(--ink-dim)]">
          Reaching the war rolls…
        </div>
      )}

      {link === "local" && (
        <div className="card flex flex-col gap-2.5 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <CloudOff size={16} className="shrink-0 text-[var(--ink-dim)]" />
            <span className="badge-stone">KEPT ON THIS DEVICE</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--ink)]/90">
            No war rolls are being kept today. Your gold, your kit and your record live in
            this browser alone — clear it, or change phone, and they are gone. There is
            nothing to write down, and nothing you can do about it from here.
          </p>
        </div>
      )}

      {link === "server" && words.length > 0 && (
        <div className="warcode-frame card-noble flex flex-col gap-4 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2.5">
            {words.map((w, i) => (
              <div key={`${w}-${i}`} className="relative flex min-h-[3.25rem] items-center justify-center rounded-lg border border-amber-300/30 bg-black/45 px-2 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
                <span className="absolute left-2 top-1 text-[9px] font-bold text-amber-200/35">{i + 1}</span>
                {/* Cinzel is a capitals face, so the words are set as capitals
                    rather than being shown lowercase in a font that has no
                    lowercase to show. */}
                <span className="font-display text-center text-[clamp(0.95rem,4.4vw,1.35rem)] uppercase leading-none tracking-[0.08em] text-amber-100">{w}</span>
              </div>
            ))}
          </div>
          <div className="knot-band mx-auto w-full max-w-[15rem]" />
          <button onClick={copy} className="btn-primary w-full !min-h-[3.25rem]">
            {copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "WORDS COPIED!" : "COPY THE WORDS"}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
            Say them, screenshot them, or send them to yourself. Anyone who types these four
            words becomes you — gold, kit and all — so keep them the way you would keep a key.
          </p>
        </div>
      )}

      {link === "server" && (
        entering ? (
          <div className="card animate-fadeIn flex flex-col gap-3 p-4 sm:p-5">
            <label htmlFor="recovery-words" className="label-overline">THE FOUR WORDS</label>
            <input
              id="recovery-words"
              type="text"
              value={typed}
              onChange={(e) => { setTyped(e.target.value.substring(0, 80)); setRefusal(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              placeholder="leaf sapling wolf glass"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="input-frame text-center"
            />
            {refusal && <p className="text-center text-[12px] font-bold text-red-300">{refusal}</p>}
            <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
              Capitals, hyphens and typos are forgiven. This device becomes that warrior, and
              the one you left behind is signed out.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => { void submit(); }} disabled={trying} className="btn-primary flex-1 !min-h-[3.25rem] !text-sm">
                {trying ? "SEARCHING…" : "BRING IT BACK"}
              </button>
              <button onClick={() => { setEntering(false); setRefusal(""); }} aria-label="Cancel recovery" className="btn-ghost !px-4">
                <ArrowLeft size={15} />
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEntering(true)} className="btn-ghost w-full !min-h-[3.25rem] !text-sm">
            <KeyRound size={15} /> I HAVE FOUR WORDS
          </button>
        )
      )}
    </section>
  );
}

/**
 * One figure from a warrior's record.
 *
 * `tone` is THREE VALUES AND NOT SIX FREE COLOURS, and the difference is the
 * whole point. This grid used to be `text-yellow-400`, `text-purple-400`,
 * `text-emerald-400`, `text-white`, `text-red-400` and `text-[var(--ink-dim)]` — six
 * hues, one per tile, none of them from the game's palette: yellow-400 is not
 * gilt and red-400 is not garnet. `globals.css` sets the rule ("three metals and
 * one stone, and no fourth accent hue anywhere in the menus") and this one
 * screen broke it six ways, which is most of why the Saga read as a settings
 * page with a serif heading rather than as a page of the same chronicle.
 *
 * Colour still carries meaning here — this is information, not decoration — but
 * it groups rather than labels, so the eye reads three kinds of fact instead of
 * six unrelated ones:
 *   won   — what he has taken: gold, honour, victories. Gilt.
 *   blood — what it cost: kills, deaths. Garnet.
 *   tally — a plain count that is neither: battles. Vellum.
 */
export function ProfStat({ Icon, val, label, tone }: {
  Icon: typeof Swords; val: number; label: string; tone: "won" | "blood" | "tally";
}) {
  const ink = tone === "won" ? "text-[var(--gilt-lit)]" : tone === "blood" ? "text-[var(--garnet-lit)]" : "text-[#ddd3bd]";
  return (
    <div className="card flex flex-col items-center gap-1 px-2 py-4 text-center">
      <div className={`flex items-center justify-center gap-1.5 text-xl font-bold tabular-nums ${ink}`}>
        <Icon size={15} className="opacity-80" />{val}
      </div>
      <div className="text-[10px] tracking-wide text-[var(--ink-dim)]">{label}</div>
    </div>
  );
}
