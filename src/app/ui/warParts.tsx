"use client";

// ============================================================
// warParts.tsx — the two lines that say where a match was fought and what it did to the war.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: ARENA_NAME, GroundLine, WarLine.
// Owner: UNIT W. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
// ============================================================

import { territory } from "@/game/war.mjs";
import type { WarOutcomeMsg } from "./shared";

/** The four grounds by wire id, for the one line that names a friendly's pick. */
const ARENA_NAME: Record<string, string> = {
  saxon_village: "The Village", pict_moor: "The Moor",
  roman_fort: "The Old Fort", danelaw_camp: "The Winter Camp",
  offa_dyke: "The Dyke",
};

/**
 * WHERE THIS FIGHT IS. One line, and it is the front half of the loop the
 * `WarLine` below closes: named ground before the blow, banked points after it.
 *
 * `holder` is who holds it as the war front last said — so the line reads as a
 * claim on somebody rather than as a place name, which is the whole difference
 * between a map and a backdrop.
 */
export function GroundLine({ territory, friendly, arena, humans }: {
  territory?: { name: string; native: string; holder: string } | null;
  /** A friendly moot: the war agreed not to watch, and the line says so. */
  friendly?: boolean;
  /** The room's arena id off the snapshot — the friendly moot's chosen ground. */
  arena?: string;
  /** Free men in the room. Below two, the anti-farm gate will refuse to bank. */
  humans?: number;
}) {
  // THE PROMISE MUST BE ONE THE ROOM CAN KEEP. This used to name the ground
  // unconditionally — including in a room of one man and his bots, where the
  // two-human anti-farm gate means nothing will ever bank. A lobby that says
  // "FOUGHT OVER DEIRA" over a fight the war will not watch is the exact
  // silence the war_result work exists to end, arriving one screen earlier.
  if (friendly) {
    return (
      <div className="mt-2 flex flex-col items-center gap-0.5" data-ground="friendly">
        <div className="label-overline !text-[9px] text-[var(--ink-dim)]">A FRIENDLY MOOT{arena && ARENA_NAME[arena] ? ` AT ${ARENA_NAME[arena].toUpperCase()}` : ""}</div>
        <div className="text-[10px] text-[var(--ink-faint)]">nothing at stake but pride — kits worn as bought</div>
      </div>
    );
  }
  if (!territory) return null;
  const PEOPLE: Record<string, string> = {
    saxon: "the Anglo-Saxons", norse: "the Norse",
    briton: "the Britons", pict: "the Picts",
  };
  const held = PEOPLE[territory.holder];
  const practice = (humans ?? 2) < 2;
  return (
    <div className="mt-2 flex flex-col items-center gap-0.5" data-ground={territory.name}>
      <div className="label-overline !text-[9px] text-amber-400/70">FOUGHT OVER</div>
      <div className="font-display text-sm tracking-[0.18em] text-amber-200">{territory.name.toUpperCase()}</div>
      {held && <div className="text-[10px] text-[var(--ink-dim)]">{held} hold it</div>}
      {practice && (
        <div className="text-[10px] text-[var(--ink-faint)]">
          the war watches men, not bots — invite a second warrior to make it count
        </div>
      )}
    </div>
  );
}

/**
 * One line under the verdict, and it is the only place the war layer touches a
 * player who is not looking at the map.
 *
 * It renders NOTHING until the server has spoken, because the banking is a
 * database round trip the match does not wait for — a placeholder would flash
 * and be replaced, and a war line that flickers is worse than one that arrives.
 */
export function WarLine({ war, onSwear }: { war: WarOutcomeMsg | null; onSwear?: () => void }) {
  if (!war) return null;
  const PEOPLE: Record<string, string> = {
    saxon: "THE WEST SAXONS", norse: "THE DANELAW",
    briton: "THE BRITONS", pict: "THE PICTS",
  };
  // The territory's real name, read out of `war.mjs` rather than kept as a
  // second table here: sixteen names in two places is fifteen chances to drift.
  const ground = war.territoryId ? (territory(war.territoryId)?.name ?? war.territoryId) : null;
  if (war.kind === "banked" && war.people) {
    // THE GROUND CHANGED HANDS ON HIS POINTS. A territory flips on somebody's
    // last point and until now that man heard nothing — `war_flips` was
    // written, the map's dispatch list read it days later, and the moment
    // itself belonged to no one. This is the loudest thing this screen says,
    // and it should be: it is the whole promise of the map, arriving.
    if (war.flip) {
      const took = PEOPLE[war.flip.to] ?? war.flip.to.toUpperCase();
      const lost = PEOPLE[war.flip.from] ?? war.flip.from.toUpperCase();
      return (
        <div className="flex flex-col items-center gap-1" data-war="flip">
          <div className="font-display animate-pulse text-[13px] tracking-[0.3em] text-amber-300"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>
            {`${(ground ?? "THE GROUND").toUpperCase()} HAS FALLEN`}
          </div>
          <div className="badge-garnet !text-[10px]">{`${took} TAKE IT FROM ${lost} — YOUR +${war.points} CARRIED IT`}</div>
        </div>
      );
    }
    return (
      <div className="badge-garnet !text-[10px]" data-war="banked">
        {`+${war.points} TO ${PEOPLE[war.people] ?? war.people.toUpperCase()}`}
        {ground ? ` · ${ground.toUpperCase()}` : ""}
      </div>
    );
  }
  // THE ONE REFUSAL WITH A WAY OUT gets a button; the rest get a sentence.
  // Swearing is a choice the player can make from here, and making him go and
  // find the map to discover that is how a war layer stays unplayed.
  if (war.kind === "unsworn") {
    return (
      <button onClick={onSwear} data-war="unsworn"
        className="badge-stone pointer-events-auto !text-[10px] transition hover:!text-amber-200">
        THIS COUNTED FOR NOBODY — SWEAR TO A PEOPLE
      </button>
    );
  }
  if (war.kind === "guest") {
    return <div className="badge-stone !text-[10px]" data-war="guest">FOUGHT AS A STRANGER — NO NAME IN THE LEDGER</div>;
  }
  // The two reasons the SIM itself sends, with no database behind them.
  if (war.kind === "friendly") {
    return <div className="badge-stone !text-[10px]" data-war="friendly">A FRIENDLY MOOT — NOTHING AT STAKE BUT PRIDE</div>;
  }
  if (war.kind === "practice") {
    // The anti-farm gate, said out loud: the war watches men, not bots. This is
    // the line the owner's own sessions were owed — he fought rooms of recruits
    // he added himself, won, and watched nothing move with no explanation.
    return <div className="badge-stone !text-[10px]" data-war="practice">THE WAR WATCHES MEN, NOT BOTS — A SECOND WARRIOR MAKES IT COUNT</div>;
  }
  // `no_points`, `already` and `unavailable` are not the player's doing and
  // there is nothing for him to press, so they say the true thing quietly.
  if (war.kind === "no_points") {
    return <div className="badge-stone !text-[10px]" data-war="no_points">NO DEEDS TO CARRY TO THE WAR</div>;
  }
  return <div className="badge-stone !text-[10px]" data-war={war.kind}>THE LEDGER IS SHUT — THIS FIGHT WILL NOT COUNT</div>;
}
