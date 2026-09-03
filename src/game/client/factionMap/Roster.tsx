"use client";

/* ==========================================================================
   WHO IS WHO — the roster of the sworn, by kingdom and by hearth.

   The owner, 3 Sep 2026: "There's no list of players who are in the same
   clan or even the same kingdom faction. We want to see whose who & whose
   under what clan even if they're different kingdoms. Want a really good
   layout for this."

   Two readings of one list. BY KINGDOM: four columns in the kingdoms' own
   colours, each headed with its count, and inside it the houses of that
   people as cards — the house's name and device, its seats — and beneath
   them the free swords who sit at no hearth. BY HEARTH: every house across
   the four kingdoms, largest first, each wearing its kingdom's swatch, so a
   brother in another kingdom's house is one glance away. A search box
   narrows both by a man's name or a house's. The viewer's own row is
   marked, and a house he sits at is ringed.

   A house's colour is its kingdom's, never its own — the heraldry law.
   Nothing renders when the roster is empty: a roster of nobody is furniture.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { FIELD, PEOPLE_NAME } from "./territories";
import { StandardGlyph } from "../StandardGlyph";

export interface RosterRow {
  name: string;
  people: string;
  hearth: { id: number; name: string; standard: string | null } | null;
  points: number;
  matches: number;
  kills: number;
  wins: number;
  title: string | null;
}

const PEOPLES = ["saxon", "norse", "briton", "pict"] as const;

export default function Roster({ roster, selfName, selfHearthId }: {
  roster: RosterRow[] | null;
  /** The viewer's own name, to mark his row. */
  selfName: string | null;
  /** The viewer's own house, to ring it. */
  selfHearthId: number | null;
}) {
  const [by, setBy] = useState<"kingdom" | "hearth">("kingdom");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!roster) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((r) => r.name.toLowerCase().includes(needle) || (r.hearth?.name.toLowerCase().includes(needle) ?? false));
  }, [roster, q]);

  if (!roster || roster.length === 0) return null;

  // Houses, keyed by id, with their seated men; free swords by people.
  const houses = new Map<number, { id: number; name: string; standard: string | null; people: string; men: RosterRow[] }>();
  const free = new Map<string, RosterRow[]>();
  for (const r of rows) {
    if (r.hearth) {
      const h = houses.get(r.hearth.id) ?? { ...r.hearth, people: r.people, men: [] };
      h.men.push(r); houses.set(r.hearth.id, h);
    } else {
      const list = free.get(r.people) ?? []; list.push(r); free.set(r.people, list);
    }
  }
  const houseList = [...houses.values()].sort((a, b) => b.men.length - a.men.length || a.name.localeCompare(b.name));
  const countOf = (people: string) => rows.filter((r) => r.people === people).length;

  const Man = ({ r }: { r: RosterRow }) => (
    <li className={`roster-man${selfName && r.name === selfName ? " is-you" : ""}`}>
      <span className="roster-name">{r.name}{r.title ? <em> {r.title}</em> : null}</span>
      <span className="roster-tally" title={`${r.matches} match${r.matches === 1 ? "" : "es"} this season · ${r.kills} kills · ${r.wins} wins all time`}>
        <b>{r.points}</b><i>{r.kills}k · {r.wins}w</i>
      </span>
    </li>
  );

  const House = ({ h, showPeople }: { h: (typeof houseList)[number]; showPeople: boolean }) => {
    const f = FIELD[h.people];
    return (
      <article className={`roster-house${selfHearthId === h.id ? " is-mine" : ""}`} style={{ borderColor: f?.lit ?? undefined }}>
        <header className="roster-house-head">
          <span className="roster-swatch" style={{ background: f?.field, borderColor: f?.lit }}>
            <StandardGlyph people={h.people} id={h.standard} size={14} className="roster-device" />
          </span>
          <strong>{h.name}</strong>
          <em>{showPeople ? `of the ${PEOPLE_NAME(h.people)} · ` : ""}{h.men.length} seat{h.men.length === 1 ? "" : "s"}</em>
        </header>
        <ul className="roster-men">{h.men.map((r, i) => <Man key={`${h.id}-${i}`} r={r} />)}</ul>
      </article>
    );
  };

  return (
    <section className="roster" aria-label="Who is who">
      <style>{CSS}</style>
      <div className="roster-head">
        <span className="label-overline">Who is who</span>
        <div className="roster-tools">
          <div className="roster-by" role="tablist" aria-label="Read the roster by">
            <button type="button" role="tab" aria-selected={by === "kingdom"} className={by === "kingdom" ? "is-on" : ""} onClick={() => setBy("kingdom")}>BY KINGDOM</button>
            <button type="button" role="tab" aria-selected={by === "hearth"} className={by === "hearth" ? "is-on" : ""} onClick={() => setBy("hearth")}>BY HEARTH</button>
          </div>
          <input className="roster-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a man or a house…" aria-label="Find a man or a house" />
        </div>
        <p className="roster-note">{roster.length} sworn · {houses.size} house{houses.size === 1 ? "" : "s"} · the season&rsquo;s points beside each name, kills and wins of all time</p>
      </div>

      {by === "kingdom" ? (
        <div className="roster-kingdoms">
          {PEOPLES.map((people) => {
            const f = FIELD[people]; const n = countOf(people);
            const theirs = houseList.filter((h) => h.people === people); const loose = free.get(people) ?? [];
            return (
              <section key={people} className="roster-kingdom" style={{ borderTopColor: f?.lit }}>
                <header className="roster-kingdom-head" style={{ background: f?.field }}>
                  <strong>{PEOPLE_NAME(people)}</strong><em>{n} sworn</em>
                </header>
                {n === 0 && <p className="roster-empty">No one has sworn here yet.</p>}
                {theirs.map((h) => <House key={h.id} h={h} showPeople={false} />)}
                {loose.length > 0 && (
                  <article className="roster-house roster-free">
                    <header className="roster-house-head"><strong>Free swords</strong><em>{loose.length} at no hearth</em></header>
                    <ul className="roster-men">{loose.map((r, i) => <Man key={`f-${people}-${i}`} r={r} />)}</ul>
                  </article>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="roster-houses">
          {houseList.length === 0 && <p className="roster-empty">No house stands yet — found one at your hearth above.</p>}
          {houseList.map((h) => <House key={h.id} h={h} showPeople />)}
        </div>
      )}
    </section>
  );
}

const CSS = `
.roster {
  margin: 0 0 0.85rem;
  border-radius: 0.5rem; padding: 0.6rem 0.75rem 0.75rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.94), rgba(17,14,11,0.94));
  border: 1px solid rgba(217,164,65,0.24);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.08);
}
.roster-head { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.55rem; }
.roster-tools { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.roster-by { display: inline-flex; border: 1px solid rgba(217,164,65,0.35); border-radius: 0.35rem; overflow: hidden; }
.roster-by button {
  background: rgba(0,0,0,0.35); color: rgba(238,226,204,0.7); border: 0;
  padding: 0.4rem 0.7rem; font-size: 0.66rem; letter-spacing: 0.14em; cursor: pointer; min-height: 40px;
}
.roster-by button.is-on { background: rgba(217,164,65,0.16); color: var(--gilt-lit); }
.roster-search {
  flex: 1 1 10rem; min-width: 9rem;
  background: rgba(10,8,6,0.6); color: #f2e5cb;
  border: 1px solid rgba(217,164,65,0.3); border-radius: 0.3rem;
  padding: 0.4rem 0.55rem; font-size: 0.8rem; min-height: 40px;
}
.roster-search::placeholder { color: rgba(238,226,204,0.35); }
.roster-note { margin: 0; font-size: 0.68rem; color: rgba(238,226,204,0.5); }
.roster-kingdoms { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; }
@media (max-width: 900px) { .roster-kingdoms { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .roster-kingdoms { grid-template-columns: 1fr; } }
.roster-kingdom { border-top: 3px solid; border-radius: 0.4rem; background: rgba(0,0,0,0.25); min-width: 0; }
.roster-kingdom-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem;
  padding: 0.45rem 0.6rem; border-radius: 0 0 0.3rem 0.3rem;
}
.roster-kingdom-head strong { color: #f6ecd6; font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase; }
.roster-kingdom-head em { font-style: normal; font-size: 0.66rem; color: rgba(246,236,214,0.75); }
.roster-houses { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.6rem; }
.roster-house { margin: 0.5rem 0.5rem 0; border: 1px solid rgba(238,226,204,0.16); border-radius: 0.4rem; padding: 0.45rem 0.55rem; background: rgba(0,0,0,0.28); min-width: 0; }
.roster-houses .roster-house { margin: 0; }
.roster-house.is-mine { box-shadow: 0 0 0 1px var(--gilt-lit), 0 0 14px rgba(242,199,107,0.25); }
.roster-house.roster-free { border-style: dashed; margin-bottom: 0.5rem; }
.roster-kingdom > .roster-house:last-child { margin-bottom: 0.5rem; }
.roster-house-head { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.3rem; flex-wrap: wrap; }
.roster-house-head strong { color: #f2e5cb; font-size: 0.86rem; }
.roster-house-head em { font-style: normal; font-size: 0.64rem; color: rgba(238,226,204,0.5); margin-left: auto; }
.roster-swatch { width: 1.1rem; height: 1.1rem; border-radius: 0.25rem; border: 1px solid; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.roster-device { color: rgba(246,236,214,0.92); }
.roster-men { list-style: none; margin: 0; padding: 0; }
.roster-man { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.2rem 0.1rem; border-top: 1px solid rgba(217,164,65,0.08); font-size: 0.78rem; }
.roster-man:first-child { border-top: 0; }
.roster-man.is-you { background: rgba(242,199,107,0.1); border-radius: 0.2rem; padding-left: 0.3rem; }
.roster-name { color: #f2e5cb; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.roster-name em { font-style: normal; font-size: 0.64rem; color: rgba(238,226,204,0.5); }
.roster-tally { display: flex; flex-direction: column; align-items: flex-end; flex: none; line-height: 1.15; }
.roster-tally b { color: var(--gilt-lit); font-variant-numeric: tabular-nums; font-size: 0.8rem; }
.roster-tally i { font-style: normal; font-size: 0.6rem; color: rgba(238,226,204,0.45); }
.roster-empty { margin: 0.6rem; font-size: 0.72rem; color: rgba(238,226,204,0.5); }
`;
