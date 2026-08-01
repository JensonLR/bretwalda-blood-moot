import { NextRequest } from "next/server";
import { recordMatch } from "@/db/profiles";
import { badRequest, clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/match  { id, secret, playerId }  ->  the pay for one fight.
 *
 * `playerId` is the engine id from the `join` message, not the profile id. It
 * is the only thing the client sends: the gold, xp, kills and win came off the
 * engine's own `match_end` and are already sitting in the ledger. There is
 * deliberately no way to ask for an amount.
 *
 * One call, one write, at the end of the match — a write per kill would put a
 * free-tier database on the floor by the second lobby.
 *
 * Safe to retry. A second call for the same fight answers `granted: false`
 * with the same totals rather than paying twice, so a client that lost the
 * response can simply ask again.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`match:${clientKey(req)}`, 120, 60_000)) return tooMany();
  const body = await readBody(req);
  if (!body || typeof body.playerId !== "string") return badRequest("playerId is required.");
  const result = await recordMatch(body.id, body.secret, body.playerId);
  if (!result.ok) return storeError(result.error);
  return serverOk({
    profile: result.value.profile,
    award: result.value.award,
    granted: result.value.granted,
  });
}
