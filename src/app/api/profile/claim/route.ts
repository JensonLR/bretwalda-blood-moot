import { NextRequest } from "next/server";
import { claimLegacySave } from "@/db/profiles";
import { badRequest, clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/claim  { id, secret, save }  ->  the old gold, once.
 *
 * `save` is the `bretwalda_profile` object out of localStorage, exactly as it
 * was stored. It is folded into a freshly minted profile so nobody loses what
 * they earned before there was a server to earn it on.
 *
 * It is also the one endpoint in this set that takes the client's word for a
 * number, which is why it is fenced on four sides: once per profile, once per
 * saved game (a hash of it is unique-indexed), capped at what the largest
 * honest player could have had, and refused entirely after the migration
 * window closes. A client should call it exactly once, immediately after
 * minting, and never again.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`claim:${clientKey(req)}`, 20, 60 * 60_000)) return tooMany();
  const body = await readBody(req);
  if (!body || !body.save || typeof body.save !== "object") return badRequest("save is required.");
  const result = await claimLegacySave(body.id, body.secret, body.save);
  if (!result.ok) return storeError(result.error);
  return serverOk({ profile: result.value.profile, granted: result.value.granted });
}
