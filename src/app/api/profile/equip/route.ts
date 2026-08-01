import { NextRequest } from "next/server";
import { setPresentation } from "@/db/profiles";
import { clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/equip  { id, secret, appearance?, name?, favoriteClass? }
 *
 * Everything about how a warrior presents that costs nothing: what he is
 * wearing out of the kit he owns, what he is called, and which class he keeps
 * coming back to. No gold moves here — buying is `/api/profile/purchase` — and
 * an appearance naming kit this profile does not own is quietly reduced to the
 * kit it does.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`equip:${clientKey(req)}`, 240, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await setPresentation(body.id, body.secret, {
    name: body.name, appearance: body.appearance, favoriteClass: body.favoriteClass,
  });
  if (!result.ok) return storeError(result.error);
  return serverOk({ profile: result.value });
}
