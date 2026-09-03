import { NextRequest } from "next/server";
import { clientKey, localMode, rateLimit, readBody, serverOk, tooMany } from "@/db/api";
import { refreshFront, warRoll, statRoll, warSelf, warView, warRoster, installWarLedger, type StatRollAxis } from "@/db/war";
import { hearthOf, hearthRoll } from "@/db/hearths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/war  { id?, secret? }  ->  the map, the standings, what moved.
 *
 * A read over POST, for the same reason `/api/profile/me` is: the secret is a
 * bearer token and a query string is the one part of a request that ends up in
 * access logs, proxy caches and the odd screenshot. `id` and `secret` are
 * OPTIONAL — the map is public, a man's own standing in it is not.
 *
 * Answers `mode: "local"` when this deployment has no database. The war is the
 * one feature that genuinely cannot run on device-local state — a private map
 * is not a war — so the screen says so plainly rather than drawing a map that
 * is nobody else's.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`war:${clientKey(req)}`, 240, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};

  // BELT AND BRACES ON THE SUBSCRIPTION, and it is idempotent.
  //
  // `installWarLedger` is meant to run once from `src/instrumentation.ts`. If
  // that hook does not fire — and under a custom server it is not this file's
  // place to assume it did — then nothing is subscribed to `onMatchEnd` and
  // every match banks nothing, silently, forever. Calling it here costs a
  // boolean check on the warm path and means the war layer switches itself on
  // the first time anybody so much as looks at the map.
  installWarLedger();

  const view = await warView();
  if (!view) return localMode();

  // Kept warm off the read the screen was going to do anyway: whoever opens
  // the map has just told the engine where the front is, at no extra cost.
  refreshFront().catch(() => {});

  const self = body.id && body.secret ? await warSelf(body.id, body.secret) : null;
  // The roll rides the same read, opt-in, so the landing's dispatch fetch —
  // which wants only the headline — never pays for fifty rows it will not draw.
  //
  // 7.6's axes ride the same opt-in: `rollAxis` picks deeds (the season's
  // crown order — the default this screen has always shown), or the lifetime
  // wins/kills/honour boards; `rollPeople` narrows deeds to one banner and
  // `rollWeek` to the last seven days. Junk values fall back to the deeds
  // roll rather than erroring — a leaderboard request is never worth a 400.
  const axis = typeof body.rollAxis === "string" ? body.rollAxis : "deeds";
  const roll = body.roll !== true ? null
    : axis === "wins" || axis === "kills" || axis === "honour"
      ? await statRoll(axis as StatRollAxis)
      : await warRoll(50, {
        people: typeof body.rollPeople === "string" ? body.rollPeople : undefined,
        windowMs: body.rollWeek === true ? 7 * 86_400_000 : undefined,
      });
  const hearth = self?.hearthId ? await hearthOf(self.hearthId) : null;
  const hearthsOfSeason = body.roll === true ? await hearthRoll() : null;
  const roster = body.roster === true ? await warRoster() : null;
  return serverOk({ war: view, self, roll, hearth, hearths: hearthsOfSeason, roster });
}
