import { NextRequest } from "next/server";
import { setPresentation } from "@/db/profiles";
import { clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/equip  { id, secret, appearance?, name?, favoriteClass?, bindings?, muted? }
 *
 * Everything about how a warrior presents that costs nothing, and how he is
 * driven: what he is wearing out of the kit he owns, what he is called, which
 * class he keeps coming back to, and which physical keys move him. No gold
 * moves here — buying is `/api/profile/purchase` — and an appearance naming kit
 * this profile does not own is quietly reduced to the kit it does.
 *
 * `bindings` is the one field here that is refused rather than reduced. It is
 * the input layer: a table this server would not have written is a device that
 * cannot walk once it hydrates, so it comes back `bad_bindings` and the row
 * keeps the bindings it had.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`equip:${clientKey(req)}`, 240, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await setPresentation(body.id, body.secret, {
    name: body.name, appearance: body.appearance, favoriteClass: body.favoriteClass,
    bindings: body.bindings, muted: body.muted,
  });
  if (!result.ok) return storeError(result.error);
  return serverOk({ profile: result.value });
}
