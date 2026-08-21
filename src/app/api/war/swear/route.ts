import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientKey, localMode, rateLimit, readBody, serverOk, tooMany } from "@/db/api";
import { swear } from "@/db/war";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE: Record<string, string> = {
  auth: "That profile and key do not match.",
  unknown_people: "There are four peoples in Britain, and that is not one of them.",
  sworn: "You have already taken the field for your people this season. The oath holds until the map resets.",
};
const STATUS: Record<string, number> = { auth: 401, unknown_people: 400, sworn: 409 };

/**
 * POST /api/war/swear  { id, secret, people }  ->  the oath.
 *
 * The one decision in this game that is meant to feel heavy, so it is the one
 * route that refuses to be undone casually: see `swear` in `src/db/war.ts` for
 * exactly when the oath locks and why it locks then.
 *
 * Rate limited harder than the map read. Swearing is a once-a-season act; a
 * client sending it in a loop is not a player.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`swear:${clientKey(req)}`, 20, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await swear(body.id, body.secret, body.people);
  if (result.ok) return serverOk({ allegiance: result.allegiance, locked: result.locked });
  if (result.error === "offline") return localMode();
  return NextResponse.json(
    { ok: false, error: result.error, message: MESSAGE[result.error] },
    { status: STATUS[result.error] || 400 },
  );
}
