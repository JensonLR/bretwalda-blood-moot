import { NextRequest } from "next/server";
import { clientKey, localMode, rateLimit, readBody, serverOk, tooMany } from "@/db/api";
import { hearthFound, hearthJoin, hearthLeave, hearthStandard } from "@/db/hearths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/war/hearth  { id, secret, act: "found" | "join" | "leave", name? }
 *
 * The Hearth's three verbs, each authenticated the way `/api/war/swear` is:
 * the secret is a bearer token and rides the body, never the query string.
 * Every refusal comes back as a sentence the screen can show — the same
 * discipline the swear route set, because a button that fails silently is
 * the defect the whole war layer exists to end.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`hearth:${clientKey(req)}`, 30, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const act = String(body.act ?? "");
  const out = act === "found" ? await hearthFound(body.id, body.secret, body.name)
    : act === "join" ? await hearthJoin(body.id, body.secret, body.name)
    : act === "leave" ? await hearthLeave(body.id, body.secret)
    : act === "standard" ? await hearthStandard(body.id, body.secret, body.standard)
    : { ok: false as const, message: "Unknown act." };
  if (out === null) return localMode();
  return serverOk(out);
}
