import { NextRequest } from "next/server";
import { clientKey, localMode, rateLimit, readBody, serverOk, tooMany } from "@/db/api";
import { refreshFront, warSelf, warView } from "@/db/war";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/war  { id?, secret? }  ->  the map, the standings, what moved.
 *
 * A read over POST, for the same reason `/api/profile/me` is: the secret is a
 * bearer token and a query string is the one part of a request that ends up in
 * access logs, proxy caches and the odd screenshot. `id` and `secret` are
 * OPTIONAL — the map is public, a man's own standing in it is not.
 *
 * Answers `mode: "local"` when this deployment has no database. The war is the
 * one feature that genuinely cannot run on device-local state — a private map
 * is not a war — so the screen says so plainly rather than drawing a map that
 * is nobody else's.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`war:${clientKey(req)}`, 240, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};

  const view = await warView();
  if (!view) return localMode();

  // Kept warm off the read the screen was going to do anyway: whoever opens
  // the map has just told the engine where the front is, at no extra cost.
  refreshFront().catch(() => {});

  const self = body.id && body.secret ? await warSelf(body.id, body.secret) : null;
  return serverOk({ war: view, self });
}
