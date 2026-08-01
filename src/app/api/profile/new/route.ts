import { NextRequest } from "next/server";
import { mintProfile } from "@/db/profiles";
import { clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/new  ->  a profile, out of nothing.
 *
 * Called on first load, before the landing screen has asked the player
 * anything, and it is the entire signup. Body may carry a `name` if the
 * browser already had one; nothing is required.
 *
 * The `secret` in the response is returned here and nowhere else — the server
 * keeps only its hash — so a client that loses it has to use the recovery
 * code like anybody else.
 */
export async function POST(req: NextRequest) {
  // High enough that a whole group chat behind one school wifi can each get a
  // profile, low enough that a script cannot fill the table overnight.
  if (!rateLimit(`mint:${clientKey(req)}`, 40, 60 * 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await mintProfile(body.name);
  if (!result.ok) return storeError(result.error);
  return serverOk({ id: result.value.profile.id, secret: result.value.secret, profile: result.value.profile });
}
