"use client";

/* ==========================================================================
   THE WAR MAP — Britain, and who holds it this morning.

   `docs/WHAT-THIS-GAME-IS.md` §3 states the retention thesis in one sentence:
   "the map moved while you were asleep, and your kingdom is losing Mercia."
   This screen is that sentence. Three things and no fourth:

     WHO HOLDS WHAT      sixteen territories, filled in their holder's field.
     WHAT MOVED          the flips, newest first, in words.
     WHERE THE SEASON    territory count per people, and the days left.
       STANDS

   It is built on the coastline `britain.ts` already ships — Natural Earth,
   public domain, Web Mercator, 1,655 points of committed SVG path data. No d3,
   no topojson, no CDN: a previous design fetched them and was cut for putting
   250 KB of script on the critical path of a game whose whole distribution
   argument is that it opens in four seconds.

   THE STYLES ARE IN THIS FILE, in a <style> element, and that is deliberate
   rather than lazy: `globals.css` belongs to another wave, and a screen that
   carries its own rules cannot collide with theirs in a merge. Every colour
   here is a token that file already defines.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { LAND, NEIGHBOUR, MAP_W, MAP_H, CLIP_DALRIATA } from "./britain";
import { DRAWN, DRAWN_BY_ID, FIELD, PEOPLE_NAME } from "./territories";

export interface WarTerritoryView {
  id: string;
  holder: string;
  threshold: number;
  epoch: number;
  contest: Record<string, number>;
  remaining: number | null;
  challenger: string | null;
}

export interface WarViewData {
  season: {
    index: number; startedAt: number; endsAt: number; state: string; days: number;
    /** Both computed on the server — see `WarView` in `src/db/war.ts`. */
    daysLeft: number; elapsed: number;
  };
  territories: WarTerritoryView[];
  standings: { people: string; held: number; points: number; contesting: number }[];
  recent: { territoryId: string; from: string; to: string; at: number; agoMinutes: number }[];
  champions: { people: string; name: string; points: number }[];
  crowns: { seasonIndex: number; people: string; name: string | null }[];
}

/** One territory this man has personally banked a point on. From `warSelf`. */
export interface WarSelfGround {
  territoryId: string;
  points: number;
  matches: number;
  holder: string;
}

export interface WarMapProps {
  war: WarViewData | null;
  /** The people this man swore to, so his own ground reads first. */
  mine?: string | null;
  /**
   * The ground he has BLED FOR — every territory carrying a ledger row of his
   * this season. Deliberately a different question from `mine`, and the map
   * answers both with different devices: `mine` is a FILL (whose people holds
   * it) and this is a CUT (where you were). A man sworn to the Anglo-Saxons
   * looking at a gold map cannot otherwise tell his own fourteen nights apart
   * from the other four peoples' — which was the defect.
   */
  fought?: readonly WarSelfGround[];
  /** Highlights and selects. Used by the swearing screen. */
  onPick?: (people: string) => void;
}

/**
 * Minutes to words. The MINUTES come from the server (`WarView`), not from a
 * clock in here: a component that reads the time while rendering draws one
 * tree on the server and a different one in the browser, and a phone with a
 * wrong date would disagree with the man standing next to it about when
 * Mercia fell.
 */
const ago = (mins: number): string => {
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * The opening map, for a deployment with no database.
 *
 * NOT A LIE, AND THE SCREEN SAYS SO. A war is a shared object by definition,
 * so there is no honest device-local version of one; what this draws is the
 * map as it stands in 878 before anybody has fought, under a banner saying the
 * rolls are not being kept. Drawing a private map with invented movement on it
 * would be the worst thing this screen could do.
 */
function openingView(): WarViewData {
  const counts: Record<string, number> = {};
  for (const t of DRAWN) counts[t.origin] = (counts[t.origin] || 0) + 1;
  return {
    season: {
      index: 1, startedAt: 0, endsAt: 0, state: "unkept", days: 35,
      daysLeft: 0, elapsed: 0,
    },
    territories: DRAWN.map((t) => ({
      id: t.id, holder: t.origin, threshold: t.threshold, epoch: 0,
      contest: {}, remaining: null, challenger: null,
    })),
    standings: Object.keys(FIELD).map((people) => ({
      people, held: counts[people] || 0, points: 0, contesting: 0,
    })),
    recent: [], champions: [], crowns: [],
  };
}

export default function WarMap({ war, mine = null, fought, onPick }: WarMapProps) {
  const [live, setLive] = useState<string | null>(null);
  const data = war ?? openingView();
  const unkept = !war;

  const byId = useMemo(
    () => new Map(data.territories.map((t) => [t.id, t])),
    [data.territories],
  );

  /** His own ground, by id, for the cut layer and the detail panel. */
  const mineById = useMemo(
    () => new Map((fought ?? []).map((g) => [g.territoryId, g])),
    [fought],
  );

  /**
   * HOW HARD THE CUT BITES, per territory.
   *
   * A flat hatch is what this shipped as first, and the phone shot killed it:
   * a man who has been playing a fortnight has banked SOMETHING on twelve of
   * sixteen territories, so a binary mark hatched three quarters of Britain
   * and the eye got nothing back.
   *
   * The reason it got nothing back is structural rather than a property of one
   * fixture, so no fixture's numbers are quoted here. `dealTerritory` draws
   * from the four most contested territories, and a man's attention follows
   * the front: he returns to the same handful of borders again and again and
   * passes through the rest once. So his points across sixteen grounds are
   * always a few heavy ones against a long thin tail, and a mark that cannot
   * tell those apart throws away the only thing the map knew about him.
   *
   * An earlier draft of this comment quoted one seed's figures as observed
   * fact and they did not reproduce — same deterministic fixture, different
   * numbers, because they had been read off a run that predated an edit. The
   * argument never needed them.
   *
   * So the cut is weighted by his points on that ground against his best
   * ground. No threshold is invented and nothing is hidden: every territory
   * carrying a ledger row of his is still cut, still keyed, still in the
   * aria-label. The floor is 0.38 because a mark you cannot see is not a
   * lighter mark, it is an absent one.
   */
  const bite = useMemo(() => {
    const best = Math.max(1, ...(fought ?? []).map((g) => g.points));
    return new Map((fought ?? []).map((g) =>
      [g.territoryId, 0.38 + 0.62 * (g.points / best)]));
  }, [fought]);

  /** The borders actually about to move. Nothing else earns a label. */
  const front = useMemo(() => data.territories
    .filter((t) => t.remaining !== null && t.remaining < t.threshold)
    .sort((a, b) => (a.remaining ?? 1e9) - (b.remaining ?? 1e9))
    .slice(0, 4), [data.territories]);
  const frontIds = useMemo(() => new Set(front.map((t) => t.id)), [front]);

  const liveT = live ? DRAWN_BY_ID[live] : null;
  const liveW = live ? byId.get(live) : null;

  const { daysLeft, elapsed } = data.season;

  return (
    <div className="warmap">
      <style>{CSS}</style>

      {/* ----------------------------------------------------------- map */}
      <div className="warmap-plate">
        {/* THE KEY TO THE CUT, ABOVE the island and not below it.
            A mark nobody can decode is decoration, so it is on the plate
            rather than in the side column — on a phone that column is a screen
            and a half further down. It sat under the map for exactly one
            screenshot: `.action-bar` is `position: sticky; bottom: 0` with an
            opaque gradient, so anything at the foot of the plate is under the
            SWEAR button at the moment the reader scrolls the map into frame.
            Above the island it is covered by nothing. */}
        {mineById.size > 0 && (
          <p className="wm-key">
            <span className="wm-key-mark" aria-hidden="true" />
            {/* ONE text node, not three. As bare children of the flex row the
                mark, the count and the two text runs each became their own
                flex item and the sentence broke into ragged columns —
                "Ground you have / 12 / of 16, cut deepest" — which the phone
                shot caught and no assertion would have. */}
            <span>
              Ground you have fought over — <b>{mineById.size}</b> of {DRAWN.length}.
              Cut deepest where you have bled most.
            </span>
          </p>
        )}
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="warmap-svg"
             role="img" aria-label={mapSummary(data)}>
          <defs>
            <clipPath id="warmap-land"><path d={LAND} /></clipPath>
            {/* THE NIELLO CUT — `docs/DESIGN-SYSTEM.md` §1: ornament is dark
                ON metal, a line cut INTO silver. So the ground a man has bled
                for is not tinted, brightened or given a second colour — it is
                hatched in near-black over whatever field its holder flies.
                That matters for a reason beyond taste: there are already four
                fills in play and a fifth colour would collide with one of
                them, whereas a cut reads on all four and survives the
                territory changing hands mid-season.

                SPACING IS SET FOR THE PHONE. The viewBox is 639 wide and the
                plate is about 370 CSS px on a 390px screen, so map units are
                scaled by 0.58: an 11-unit pitch lands at just over 6px, which
                is a hatch. At the 4 units that looked right on a desktop it
                would have been 2.3px — a grey wash, and unreadable exactly
                where the defect was reported from. */}
            <pattern id="warmap-cut" width="11" height="11"
                     patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="11" height="11" fill="rgba(9,7,6,0.34)" />
              <rect width="3.4" height="11" fill="rgba(6,5,4,0.86)" />
            </pattern>
          </defs>

          {/* Ireland, drawn dead: Britain does not read as Britain alone. */}
          <path d={NEIGHBOUR} className="wm-neighbour" />

          <g clipPath="url(#warmap-land)">
            {/* Table order is paint order — see territories.ts. */}
            {DRAWN.map((t) => {
              const held = byId.get(t.id)?.holder ?? t.origin;
              return (
                <path key={t.id} d={t.d} className="wm-field"
                      data-mine={held === mine ? "yes" : "no"}
                      data-live={live === t.id ? "yes" : "no"}
                      style={{ fill: FIELD[held]?.field ?? "var(--gilt)" }} />
              );
            })}
            {/* YOUR GROUND, cut over the fills and under the borders, so a
                hatched territory is still visibly bounded. */}
            {DRAWN.filter((t) => mineById.has(t.id)).map((t) => (
              <path key={`m-${t.id}`} d={t.d} className="wm-fought" fill="url(#warmap-cut)"
                    style={{ opacity: bite.get(t.id) ?? 1 }} />
            ))}
            {/* Every border, hairlined, so two territories of one people are
                still two territories. */}
            {DRAWN.map((t) => <path key={`e-${t.id}`} d={t.d} className="wm-border" />)}
            {/* And a bone edge on the ground that is his, so the cut has an
                outline rather than fading into the hairline borders. */}
            {DRAWN.filter((t) => mineById.has(t.id)).map((t) => (
              <path key={`me-${t.id}`} d={t.d} className="wm-fought-edge"
                    style={{ opacity: bite.get(t.id) ?? 1 }} />
            ))}
            {/* Dal Riata: outlined, never filled. The fifth people, unbuilt. */}
            <path d={CLIP_DALRIATA.join("")} className="wm-dalriata" />
          </g>

          <path d={LAND} className="wm-coast" />

          {/* The front: the only territories that get a marker, because four
              borders moving is a front and sixteen drifting is wallpaper. */}
          {front.map((t) => {
            const drawn = DRAWN_BY_ID[t.id];
            if (!drawn) return null;
            return (
              <g key={`f-${t.id}`} className="wm-front"
                 style={{ color: FIELD[t.challenger ?? t.holder]?.lit ?? "var(--gilt-lit)" }}>
                <circle cx={drawn.x} cy={drawn.y} r="19" className="wm-front-ring" />
                <circle cx={drawn.x} cy={drawn.y} r="5" className="wm-front-dot" />
              </g>
            );
          })}

          {/* One label at a time. Four names over a coastline on a 390px phone
              is a wall of text; the live one is enough. */}
          {liveT && (
            <g className="wm-label-group">
              <text x={liveT.x} y={liveT.y - 26} className="wm-label">{liveT.name.toUpperCase()}</text>
              <text x={liveT.x} y={liveT.y - 10} className="wm-label-sub">
                {(FIELD[liveW?.holder ?? liveT.origin]?.name ?? "").toUpperCase()}
              </text>
            </g>
          )}

          {/* Hit layer, last and transparent, so it is over every fill. */}
          <g clipPath="url(#warmap-land)">
            {DRAWN.map((t) => {
              const held = byId.get(t.id)?.holder ?? t.origin;
              const w = byId.get(t.id);
              return (
                <path
                  key={`h-${t.id}`} d={t.d} className="wm-hit"
                  role="button" tabIndex={0}
                  aria-label={`${t.name}, held by the ${PEOPLE_NAME(held)}.` +
                    (w?.remaining != null && w.challenger
                      ? ` The ${PEOPLE_NAME(w.challenger)} need ${w.remaining} more points to take it.`
                      : " Uncontested.") +
                    (mineById.has(t.id)
                      ? ` You have banked ${mineById.get(t.id)!.points} points here.`
                      : "")}
                  onPointerEnter={() => setLive(t.id)}
                  onPointerLeave={() => setLive((c) => (c === t.id ? null : c))}
                  onFocus={() => setLive(t.id)}
                  onBlur={() => setLive((c) => (c === t.id ? null : c))}
                  onClick={() => { setLive(t.id); onPick?.(held); }}
                />
              );
            })}
          </g>
        </svg>

        {unkept && (
          <p className="wm-unkept">
            No war rolls are being kept on this deployment. This is Britain as it
            stood in 878 — nobody has taken anything yet.
          </p>
        )}
      </div>

      {/* -------------------------------------------------------- beside */}
      <div className="warmap-side">
        {/* ---- where the season stands ---- */}
        <section className="wm-panel">
          <div className="section-title">Season {data.season.index}</div>
          <div className="wm-season">
            <div className="wm-bar"><span style={{ width: `${(elapsed * 100).toFixed(1)}%` }} /></div>
            <p className="wm-season-note">
              {unkept ? "Not being kept." :
                daysLeft === 0 ? "The moot sits. A Bretwalda is about to be named."
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} until a Bretwalda is crowned.`}
            </p>
          </div>
          <ul className="wm-standings">
            {data.standings.map((row, i) => {
              const champ = data.champions.find((c) => c.people === row.people);
              return (
                <li key={row.people} className={row.people === mine ? "is-mine" : ""}>
                  <span className="wm-rank">{i + 1}</span>
                  <span className="wm-swatch" style={{
                    background: FIELD[row.people]?.field, borderColor: FIELD[row.people]?.lit,
                  }} />
                  <span className="wm-people">
                    <strong>{PEOPLE_NAME(row.people)}</strong>
                    <em>{champ ? `${champ.name} leads, ${champ.points} pts` : "nobody has taken the field"}</em>
                  </span>
                  <span className="wm-held"><b>{row.held}</b><i>held</i></span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- THE FRONT — where the war is hottest, and the way IN. ----
            The map used to be a report; this is the door. Each contested
            territory carries the one action the whole page exists for: raise a
            room that will fight for exactly this ground. The link is a query
            param on the landing route, the same shape an invite code is, and
            the engine re-validates the id — a stale link is a normal deal. */}
        <section className="wm-panel">
          <div className="section-title">The front — fight for this ground</div>
          {(() => {
            const front = data.territories
              .filter((t) => t.challenger && t.remaining !== null)
              .sort((a, b) => (a.remaining ?? 1e9) - (b.remaining ?? 1e9))
              .slice(0, 4);
            if (front.length === 0) {
              return (
                <p className="wm-empty">
                  No ground is close to falling. Any fight still counts — the
                  engine deals its ground from wherever the war is warmest.
                </p>
              );
            }
            return (
              <ul className="wm-flips">
                {front.map((t) => (
                  <li key={t.id}>
                    <span className="cabochon" />
                    <span>
                      <strong>{DRAWN_BY_ID[t.id]?.name ?? t.id}</strong>
                      {" — the "}{PEOPLE_NAME(t.holder)}{" hold it; the "}
                      <b style={{ color: FIELD[t.challenger!]?.lit }}>{PEOPLE_NAME(t.challenger!)}</b>
                      {` need ${t.remaining} more`}
                    </span>
                    <a href={`/?war=${t.id}`} className="badge-garnet !text-[10px]"
                      style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                      FIGHT HERE
                    </a>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>

        {/* ---- what moved ---- */}
        <section className="wm-panel">
          <div className="section-title">What moved</div>
          {data.recent.length === 0 ? (
            <p className="wm-empty">
              No border has moved yet. The first territory to change hands will
              be named here, and everyone will see it.
            </p>
          ) : (
            <ul className="wm-flips">
              {data.recent.map((f, i) => (
                <li key={`${f.territoryId}-${f.at}-${i}`}>
                  <span className="cabochon" />
                  <span>
                    <strong>{DRAWN_BY_ID[f.territoryId]?.name ?? f.territoryId}</strong>
                    {" taken from the "}{PEOPLE_NAME(f.from)}
                    {" by the "}<b style={{ color: FIELD[f.to]?.lit }}>{PEOPLE_NAME(f.to)}</b>
                  </span>
                  <em>{ago(f.agoMinutes)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- the front ---- */}
        <section className="wm-panel">
          <div className="section-title">Closest to falling</div>
          {front.length === 0 ? (
            <p className="wm-empty">Every border is quiet. Fight, and one of them will not be.</p>
          ) : (
            <ul className="wm-front-list">
              {front.map((t) => (
                <li key={t.id}>
                  {/* BOTH swatches, holder then challenger. One swatch beside a
                      sentence naming the other people is the defect the first
                      screenshot of this panel showed: a blue square next to
                      "the Anglo-Saxons need 2 more". */}
                  <span className="wm-pair">
                    <span className="wm-swatch" style={{
                      background: FIELD[t.holder]?.field, borderColor: FIELD[t.holder]?.lit,
                    }} />
                    <span className="wm-arrow" aria-hidden="true">→</span>
                    <span className="wm-swatch" style={{
                      background: FIELD[t.challenger ?? t.holder]?.field,
                      borderColor: FIELD[t.challenger ?? t.holder]?.lit,
                    }} />
                  </span>
                  <span className="wm-people">
                    <strong>{DRAWN_BY_ID[t.id]?.name ?? t.id}</strong>
                    <em>
                      {t.remaining === 0
                        ? `held by the ${PEOPLE_NAME(t.holder)} — it falls on the next point the ${PEOPLE_NAME(t.challenger ?? t.holder)} bank`
                        : `${PEOPLE_NAME(t.holder)} hold it; the ${PEOPLE_NAME(t.challenger ?? t.holder)} need ${t.remaining} more`}
                    </em>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {liveT && (
          <section className="wm-panel wm-detail">
            <div className="section-title">{liveT.name}</div>
            <p className="wm-native">{liveT.native}{liveT.seat ? ` — seat at ${liveT.seat}` : ""}</p>
            <p className="wm-blurb">{liveT.blurb}</p>
            <p className="wm-holder">
              Held by the <b style={{ color: FIELD[liveW?.holder ?? liveT.origin]?.lit }}>
                {PEOPLE_NAME(liveW?.holder ?? liveT.origin)}
              </b>
              {liveW && liveW.epoch > 0 ? ` — changed hands ${liveW.epoch} time${liveW.epoch === 1 ? "" : "s"} this season.` : "."}
            </p>
            {/* WHAT HE DID HERE. The ledger already knows; nothing asked it. */}
            {mineById.has(liveT.id) && (
              <p className="wm-yours">
                <span className="wm-key-mark" aria-hidden="true" />
                You have banked <b>{mineById.get(liveT.id)!.points}</b> points here
                over {mineById.get(liveT.id)!.matches} match
                {mineById.get(liveT.id)!.matches === 1 ? "" : "es"}.
              </p>
            )}
            {/* AND WHAT IT WOULD TAKE. The number was already computed and
                already spoken to a screen reader on the hit layer; it has
                never once been shown. */}
            {liveW?.remaining != null && liveW.challenger && (
              <p className="wm-needs">
                {liveW.remaining === 0
                  ? `It falls on the next point the ${PEOPLE_NAME(liveW.challenger)} bank.`
                  : `The ${PEOPLE_NAME(liveW.challenger)} need ${liveW.remaining} more points to take it.`}
              </p>
            )}
          </section>
        )}

        {data.crowns.length > 0 && (
          <section className="wm-panel">
            <div className="section-title">Bretwaldas</div>
            <ul className="wm-crowns">
              {data.crowns.map((c) => (
                <li key={c.seasonIndex}>
                  <span className="cabochon" />
                  <span><strong>{c.name || "unclaimed"}</strong> of the {PEOPLE_NAME(c.people)}</span>
                  <em>season {c.seasonIndex}</em>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="wm-credit">
          Coastline: Natural Earth 1:10m, public domain. Frontiers are approximate,
          as they were.
        </p>
      </div>
    </div>
  );
}

/** One sentence for a screen reader, and it is the whole map. */
function mapSummary(data: WarViewData): string {
  const top = [...data.standings].sort((a, b) => b.held - a.held)[0];
  return `Britain, season ${data.season.index}. ` +
    data.standings.map((s) => `${PEOPLE_NAME(s.people)} hold ${s.held}`).join(", ") +
    `. The ${PEOPLE_NAME(top.people)} lead.`;
}

/* --------------------------------------------------------------------------
   The screen's own rules. Every colour is a token globals.css already defines.
   -------------------------------------------------------------------------- */
const CSS = `
.warmap { display: grid; gap: 1rem; grid-template-columns: 1fr; }
/* Britain is 1.56 times as tall as it is wide, so a map column sized by the
   viewport's WIDTH on a desktop is two thirds empty plate. Above 60rem the
   column is sized to the island instead — height first, width follows — and
   the pair is centred in whatever room is left. The first render of this
   screen wasted 280px either side of the coast and it was obvious in the PNG
   and invisible everywhere else. */
@media (min-width: 60rem) {
  .warmap { grid-template-columns: auto 22rem; align-items: start; justify-content: center; }
  .warmap-svg { width: auto; height: 74vh; max-width: 100%; }
}

.warmap-plate {
  position: relative; border-radius: 0.75rem; padding: 0.5rem;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(217,164,65,0.10), transparent 62%),
    linear-gradient(180deg, #171310 0%, #0d0b09 100%);
  border: 1px solid rgba(217,164,65,0.28);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.10), 0 10px 30px rgba(0,0,0,0.45);
}
.warmap-svg { display: block; width: 100%; height: auto; max-height: 74vh; margin: 0 auto; }

.wm-neighbour { fill: #14120f; stroke: rgba(217,164,65,0.18); stroke-width: 1; }
.wm-field { opacity: 0.78; transition: opacity 140ms ease; }
.wm-field[data-mine="yes"] { opacity: 0.95; }
.wm-field[data-live="yes"] { opacity: 1; }
.wm-border { fill: none; stroke: rgba(12,10,8,0.55); stroke-width: 1.4; }

/* YOUR GROUND. The cut itself is the <pattern> in defs; these two rules only
   say how hard it bites and where its edge is. Deliberately NOT done with
   opacity on the field above, which is what data-mine uses: 0.78 against 0.95
   is a difference no phone screenshot has ever shown, and that pair was the
   whole of the old answer to "which of this is mine". */
.wm-fought { pointer-events: none; }
.wm-fought-edge {
  fill: none; pointer-events: none;
  stroke: rgba(244,230,200,0.62); stroke-width: 2.2; stroke-linejoin: round;
}
.wm-dalriata { fill: none; stroke: rgba(230,214,180,0.34); stroke-width: 1.6; stroke-dasharray: 7 6; }
.wm-coast { fill: none; stroke: rgba(240,224,190,0.55); stroke-width: 1.5; stroke-linejoin: round; }

.wm-front { pointer-events: none; }
.wm-front-ring { fill: none; stroke: currentColor; stroke-width: 2.2; opacity: 0.9; }
.wm-front-dot { fill: currentColor; }
@media (prefers-reduced-motion: no-preference) {
  .wm-front-ring { animation: wm-pulse 2.4s ease-in-out infinite; transform-origin: center; }
}
@keyframes wm-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

.wm-label-group { pointer-events: none; }
.wm-label, .wm-label-sub {
  text-anchor: middle; font-family: var(--font-display, inherit);
  paint-order: stroke; stroke: #0b0907; stroke-width: 5px; stroke-linejoin: round;
}
.wm-label { fill: #f4e6c8; font-size: 26px; letter-spacing: 0.10em; font-weight: 700; }
.wm-label-sub { fill: rgba(240,226,196,0.72); font-size: 15px; letter-spacing: 0.16em; }

.wm-hit { fill: transparent; cursor: pointer; outline: none; }
.wm-hit:focus-visible { stroke: var(--gilt-lit); stroke-width: 3; }

.warmap-side { display: grid; gap: 0.75rem; align-content: start; }
.wm-panel {
  border-radius: 0.6rem; padding: 0.75rem 0.85rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.92), rgba(17,14,11,0.92));
  border: 1px solid rgba(217,164,65,0.22);
}
.wm-panel .section-title { margin-bottom: 0.5rem; }

.wm-season { margin-bottom: 0.6rem; }
.wm-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
.wm-bar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--garnet), var(--gilt)); }
.wm-season-note { margin: 0.4rem 0 0; font-size: 0.78rem; color: rgba(238,226,204,0.72); }

.wm-standings, .wm-flips, .wm-front-list, .wm-crowns { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.wm-standings > li, .wm-front-list > li { display: flex; align-items: center; gap: 0.55rem; }
.wm-standings > li.is-mine { outline: 1px solid rgba(217,164,65,0.45); border-radius: 0.4rem; padding: 0.15rem 0.25rem; }
.wm-rank { width: 1rem; text-align: right; font-size: 0.72rem; color: rgba(238,226,204,0.45); }
.wm-swatch { width: 0.85rem; height: 0.85rem; border-radius: 0.2rem; border: 1px solid; flex: none; }
.wm-pair { display: flex; align-items: center; gap: 0.2rem; flex: none; }
.wm-arrow { font-size: 0.62rem; color: rgba(238,226,204,0.45); }
.wm-people { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.wm-people strong { font-size: 0.86rem; color: #f2e5cb; }
.wm-people em { font-style: normal; font-size: 0.72rem; color: rgba(238,226,204,0.6); }
.wm-held { display: flex; flex-direction: column; align-items: center; flex: none; }
.wm-held b { font-size: 1.05rem; color: var(--gilt-lit); line-height: 1; }
.wm-held i { font-style: normal; font-size: 0.6rem; letter-spacing: 0.08em; color: rgba(238,226,204,0.45); }

.wm-flips > li, .wm-crowns > li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.78rem; color: rgba(238,226,204,0.82); }
.wm-flips > li em, .wm-crowns > li em { margin-left: auto; font-style: normal; font-size: 0.68rem; color: rgba(238,226,204,0.45); white-space: nowrap; }
.wm-flips strong, .wm-crowns strong { color: #f2e5cb; }

.wm-empty, .wm-blurb, .wm-native, .wm-holder, .wm-unkept {
  margin: 0; font-size: 0.78rem; color: rgba(238,226,204,0.66); line-height: 1.45;
}
.wm-native { color: var(--gilt); font-size: 0.72rem; letter-spacing: 0.06em; margin-bottom: 0.3rem; }
.wm-blurb { margin-bottom: 0.35rem; }
.wm-unkept {
  margin: 0.5rem 0.25rem 0.15rem; text-align: center; font-size: 0.72rem;
  color: rgba(238,226,204,0.55);
}

/* THE KEY. Compartmented — a nicked field with cut ends, never a rule running
   the plate's full width. See docs/DESIGN-SYSTEM.md section 1. */
.wm-key {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  margin: 0.15rem auto 0.5rem; width: fit-content; max-width: 100%;
  text-align: left; text-wrap: pretty; line-height: 1.4;
  padding: 0.3rem 0.7rem; border-radius: 0.25rem;
  font-size: 0.7rem; letter-spacing: 0.04em; color: rgba(238,226,204,0.72);
  background: rgba(12,10,8,0.55);
  border: 1px solid rgba(217,164,65,0.22);
}
/* The same cut, at swatch size, so the key is the mark and not a description
   of it. 3px pitch here against 11 map units there because this square is
   14 CSS px and the map is 370. */
.wm-key b { color: var(--gilt-lit); font-weight: 700; }
.wm-key-mark {
  width: 0.9rem; height: 0.9rem; border-radius: 0.15rem; flex: none;
  border: 1px solid rgba(244,230,200,0.62);
  background:
    repeating-linear-gradient(45deg,
      rgba(6,5,4,0.92) 0 2px, rgba(217,164,65,0.85) 2px 5px);
}
.wm-yours, .wm-needs {
  margin: 0.35rem 0 0; font-size: 0.76rem; line-height: 1.45;
  color: rgba(238,226,204,0.8);
}
.wm-yours { display: flex; align-items: center; gap: 0.4rem; }
.wm-yours b { color: var(--gilt-lit); }
.wm-needs { color: var(--gilt); }
.wm-credit { margin: 0; font-size: 0.66rem; color: rgba(238,226,204,0.38); }
`;
