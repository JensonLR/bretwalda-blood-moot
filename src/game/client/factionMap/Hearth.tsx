"use client";

/* ==========================================================================
   THE HEARTH — backlog 4.4's clans, on the map screen.

   Two states, one compartment. A man at a hearth sees his house: its name in
   its kingdom's colour, who sits at it, and LEAVE — one verb, because
   belonging that cannot be undone is a trap, not a bond. A sworn man at no
   hearth sees one input and two verbs: FOUND raises a house in his own
   kingdom's name, JOIN takes a seat at one that exists. The unsworn see
   nothing here at all — the oath section below is their screen, and a hearth
   belongs to a kingdom before it belongs to anybody.

   Below both: the HEARTHS OF THE SEASON, the houses by their banked points
   off the same ledger the men's roll reads. A house's colour is its
   kingdom's, never its own — docs/DESIGN-SYSTEM.md's heraldry law.
   ========================================================================== */

import React, { useCallback, useState } from "react";
import { FIELD, PEOPLE_NAME } from "./territories";

export interface HearthViewData {
  id: number;
  name: string;
  people: string;
  members: number;
}

export interface HearthSeatData {
  seat: number;
  name: string;
  people: string;
  members: number;
  points: number;
  matches: number;
}

export default function Hearth({ sworn, hearth, seats, credentials, onChanged }: {
  /** The viewer's allegiance, or null — the unsworn see nothing here. */
  sworn: string | null;
  /** The viewer's own house, if any. */
  hearth: HearthViewData | null;
  /** The season's houses, or null while loading / in local mode. */
  seats: HearthSeatData[] | null;
  /** The bearer pair for the three verbs, or null when no profile exists. */
  credentials: { id: number; secret: string } | null;
  /** Called after any verb lands, so the page can re-read the war. */
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState<string | null>(null);

  const act = useCallback(async (verb: "found" | "join" | "leave") => {
    if (!credentials || busy) return;
    setBusy(true);
    setWord(null);
    try {
      const res = await fetch("/api/war/hearth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...credentials, act: verb, name: name.trim() || undefined }),
      });
      const body = await res.json() as { ok?: boolean; message?: string };
      if (body.ok) { setName(""); onChanged(); }
      else setWord(body.message ?? "The hearth did not answer.");
    } catch {
      setWord("The hearth did not answer.");
    } finally {
      setBusy(false);
    }
  }, [credentials, busy, name, onChanged]);

  if (!sworn) return null;

  const field = hearth ? FIELD[hearth.people] : null;

  return (
    <section className="hearth" aria-label="Your hearth">
      <style>{CSS}</style>

      <div className="hearth-own">
        {hearth ? (
          <>
            <span className="hearth-swatch" style={{ background: field?.field, borderColor: field?.lit }} />
            <span className="hearth-own-text">
              <strong>{hearth.name}</strong>
              <em>a hearth of the {PEOPLE_NAME(hearth.people)} · {hearth.members} seat{hearth.members === 1 ? "" : "s"} taken</em>
            </span>
            <button className="hearth-verb" disabled={busy} onClick={() => void act("leave")}>LEAVE</button>
          </>
        ) : (
          <>
            <span className="hearth-own-text">
              <strong>No hearth</strong>
              <em>found a house of the {PEOPLE_NAME(sworn)}, or take a seat at one</em>
            </span>
            <input
              className="hearth-name" value={name} maxLength={24}
              placeholder="Name a hearth…"
              aria-label="Name a hearth"
              onChange={(e) => setName(e.target.value)} disabled={busy}
            />
            <button className="hearth-verb" disabled={busy || !name.trim()} onClick={() => void act("found")}>FOUND</button>
            <button className="hearth-verb" disabled={busy || !name.trim()} onClick={() => void act("join")}>JOIN</button>
          </>
        )}
      </div>
      {word && <p className="hearth-word">{word}</p>}

      {seats && seats.length > 0 && (
        <>
          <div className="hearth-head">
            <span className="label-overline">Hearths of the season</span>
          </div>
          <ol className="hearth-list">
            {seats.map((s) => {
              const f = FIELD[s.people];
              return (
                <li key={s.seat} className="hearth-seat">
                  <span className="hearth-n">{s.seat}</span>
                  <span className="hearth-swatch" style={{ background: f?.field, borderColor: f?.lit }} />
                  <span className="hearth-who">
                    <strong>{s.name}</strong>
                    <em>of the {PEOPLE_NAME(s.people)} · {s.members} seat{s.members === 1 ? "" : "s"}</em>
                  </span>
                  <span className="hearth-tally">
                    <b>{s.points}</b>
                    <i>{s.matches} match{s.matches === 1 ? "" : "es"}</i>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

const CSS = `
.hearth {
  margin: 0 0 0.85rem;
  border-radius: 0.5rem; padding: 0.6rem 0.75rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.94), rgba(17,14,11,0.94));
  border: 1px solid rgba(217,164,65,0.24);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.08);
}
.hearth-own { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.hearth-swatch { width: 1.1rem; height: 1.1rem; border-radius: 0.25rem; border: 1px solid; flex: none; }
.hearth-own-text { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.3; }
.hearth-own-text strong { color: #f2e5cb; font-weight: 700; font-size: 0.95rem; }
.hearth-own-text em { font-style: normal; font-size: 0.7rem; color: rgba(238,226,204,0.5); }
.hearth-name {
  flex: 1 1 9rem; min-width: 8rem;
  background: rgba(10,8,6,0.6); color: #f2e5cb;
  border: 1px solid rgba(217,164,65,0.3); border-radius: 0.3rem;
  padding: 0.4rem 0.55rem; font-size: 0.8rem;
}
.hearth-name::placeholder { color: rgba(238,226,204,0.35); }
.hearth-verb {
  border: 1px solid rgba(217,164,65,0.45); border-radius: 0.3rem;
  background: rgba(217,164,65,0.1); color: var(--gilt-lit);
  padding: 0.4rem 0.7rem; font-size: 0.68rem; letter-spacing: 0.12em;
  cursor: pointer; min-height: 44px;
}
.hearth-verb:disabled { opacity: 0.45; cursor: default; }
.hearth-word { margin: 0.4rem 0 0; font-size: 0.74rem; color: rgba(238,196,150,0.85); }
.hearth-head { margin: 0.55rem 0 0.25rem; }
.hearth-list { list-style: none; margin: 0; padding: 0; }
.hearth-seat {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.26rem 0.2rem; font-size: 0.8rem;
  border-top: 1px solid rgba(217,164,65,0.08);
}
.hearth-seat:first-child { border-top: 0; }
.hearth-seat .hearth-swatch { width: 0.7rem; height: 0.7rem; border-radius: 0.15rem; }
.hearth-n {
  width: 1.4rem; text-align: right; flex: none;
  font-variant-numeric: tabular-nums;
  color: rgba(238,226,204,0.45); font-size: 0.72rem;
}
.hearth-who { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
.hearth-who strong { color: #f2e5cb; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hearth-who em { font-style: normal; font-size: 0.66rem; color: rgba(238,226,204,0.5); }
.hearth-tally { display: flex; flex-direction: column; align-items: flex-end; flex: none; line-height: 1.2; }
.hearth-tally b { color: var(--gilt-lit); font-variant-numeric: tabular-nums; }
.hearth-tally i { font-style: normal; font-size: 0.64rem; color: rgba(238,226,204,0.45); }
`;
