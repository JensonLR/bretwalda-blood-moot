import { NextRequest } from "next/server";
import { recoverProfile } from "@/db/profiles";
import { clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/recover  { recoveryCode }  ->  { id, secret, profile }
 *
 * Four words, typed on a new phone, and the gold comes back. Case, spacing and
 * punctuation are all forgiven; a word whose first four letters name exactly
 * one entry in the list is forgiven its tail.
 *
 * The rate limit is the real guard here and it is why it is tight. Four words
 * from 256 is about four billion phrases — no one is guessing a *particular*
 * player's, but a script firing random phrases at a table of ten thousand
 * profiles is playing a different game, and ten tries per ten minutes makes
 * that take longer than the universe rather than longer than lunch.
 *
 * Recovering rotates the bearer token, so the old device is logged out. That
 * is the correct behaviour for the case this exists for — a lost phone.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`recover:${clientKey(req)}`, 10, 10 * 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await recoverProfile(body.recoveryCode);
  if (!result.ok) return storeError(result.error);
  return serverOk({ id: result.value.profile.id, secret: result.value.secret, profile: result.value.profile });
}
