import type { GamePlayer } from "../types";

/**
 * WHO THE SOFT LOCK IS ALLOWED TO SEIZE.
 *
 * Lifted out of `input.ts` so it can be tested, and it is worth testing: the
 * bug it fixes is that "enemies" meant "everyone who is not me and not dead",
 * so in a WAR BAND the lock happily took your own shield-brother and — on a
 * phone, where the lock owns the yaw outright — turned you away from the side
 * you were fighting.
 *
 * `input.ts` imports React and the key-binding layer, neither of which loads in
 * a bare Node process, so a rule living in there is a rule no fast harness can
 * reach. This file imports one TYPE and nothing else, which is what lets
 * `tools/locktest.mjs` enumerate the cases in milliseconds.
 */

/**
 * True when two men are on the same side, so never a target for each other.
 *
 * A team is read off the men themselves rather than off a mode flag, because
 * the flag is the server's and the client only ever sees a snapshot. In a
 * free-for-all every man carries `none`, and two men who are both `none` are
 * NOT team-mates — that is the whole of a free-for-all — which is why the
 * `!== "none"` clause is load-bearing rather than defensive.
 */
export function sameSide(a: GamePlayer | null | undefined, b: GamePlayer | null | undefined): boolean {
  return !!a && !!b && !!a.team && a.team !== "none" && a.team === b.team;
}

/** Every man the local player may lock: alive, not himself, not his own side. */
export function liveEnemies(
  players: Record<string, GamePlayer>,
  localId: string,
  local?: GamePlayer | null,
): string[] {
  const out: string[] = [];
  for (const id of Object.keys(players)) {
    if (id === localId) continue;
    if (players[id].state === "dead") continue;
    if (sameSide(local, players[id])) continue;
    out.push(id);
  }
  return out;
}
