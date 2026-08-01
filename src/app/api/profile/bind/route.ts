import { NextRequest } from "next/server";
import { loadProfile } from "@/db/profiles";
import { bindPlayer, installMatchLedger } from "@/db/matchLedger";
import { badRequest, clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/bind  { id, secret, playerId }
 *
 * Called once, on the `join` message, to say "the warrior the engine just
 * called `playerId` is me". It reserves that match's pay for this profile
 * before there is any pay to take.
 *
 * Without it the fallback is first-come-first-served on the payout, and every
 * other player in the lobby can read your engine id off a room snapshot. With
 * it, the only person who can bind is the one holding the socket the id was
 * handed to, because it is a random UUID that nobody else has seen yet.
 *
 * Answers `{ bound: false }` rather than an error when the id is already
 * spoken for — there is nothing the client can usefully do about it, and the
 * player still fights.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`bind:${clientKey(req)}`, 240, 60_000)) return tooMany();
  const body = await readBody(req);
  if (!body || typeof body.playerId !== "string") return badRequest("playerId is required.");
  const profile = await loadProfile(body.id, body.secret);
  if (!profile.ok) return storeError(profile.error);
  installMatchLedger();
  return serverOk({ bound: bindPlayer(body.playerId, profile.value.id) });
}
