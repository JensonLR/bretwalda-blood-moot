"use client";

// ============================================================
// FACTION SELECT — /factions
//
// The screen the map is for. Nothing in the game routes here yet; it is
// reachable by URL so the map can be looked at on the deployed build and
// screenshotted headlessly, exactly the way /shot is.
//
// It deliberately uses the same chrome as every other screen — shell,
// backdrop, screen-head, knot-band — so the map is judged in the game's
// own frame rather than on a white page where anything looks fine.
// ============================================================

import React, { useState } from "react";
import FactionMap, { FACTIONS, type FactionId } from "@/game/client/factionMap/FactionMap";

export default function FactionsPage() {
  const [faction, setFaction] = useState<FactionId | null>(null);
  const chosen = FACTIONS.find((f) => f.id === faction) ?? null;

  return (
    <div className="shell">
      <div className="backdrop backdrop-hall">
        <div className="embers" />
      </div>
      <div className="shell-inner">
        <div className="wrap wrap-wide screen">
          <header className="screen-head screen-head-center">
            <span className="label-overline">Britain, c. 878</span>
            <h1>Choose your people</h1>
            <p>
              The one year all four coexist: Alfred&apos;s Wessex against the
              Danelaw, the Britons holding the west, and the Picts still Picts
              for another generation.
            </p>
          </header>

          <div className="knot-band" />

          <FactionMap value={faction} onSelect={setFaction} />

          <div className="action-bar">
            <div className="action-bar-row">
              <button type="button" className="btn-primary flex-1 !text-base" disabled={!chosen}>
                {chosen ? `Muster at ${chosen.seat}` : "Choose a people"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
