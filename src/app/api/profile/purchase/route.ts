import { NextRequest } from "next/server";
import { purchase } from "@/db/profiles";
import { badRequest, clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/purchase  { id, secret, itemIds: string[] }
 *
 * The whole EQUIP button in one call: everything staged on the mannequin,
 * bought if it is not owned and equipped either way. The client sends armoury
 * ids and nothing else — no prices and no balance — because a price that
 * arrives from a browser is not a price.
 *
 * Items already owned cost nothing, so re-equipping is free and the client
 * does not have to work out which of the eight slots it is being charged for.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`buy:${clientKey(req)}`, 120, 60_000)) return tooMany();
  const body = await readBody(req);
  if (!body || !Array.isArray(body.itemIds)) return badRequest("itemIds must be an array of armoury ids.");
  const result = await purchase(body.id, body.secret, body.itemIds);
  if (!result.ok) return storeError(result.error);
  return serverOk({
    profile: result.value.profile,
    spent: result.value.spent,
    bought: result.value.bought,
  });
}
