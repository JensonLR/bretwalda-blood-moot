import { NextRequest } from "next/server";
import { clientKey, localMode, rateLimit, readBody, serverOk, tooMany } from "@/db/api";
import { subscribeToMoot } from "@/db/moot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/moot/subscribe  { endpoint, keys: { p256dh, auth } }
 *
 * A device asking to be called when the Moot convenes — docs/ONE-CLIENT.md
 * §6.3. The endpoint IS the identity; the row is upserted on it, so a device
 * that re-subscribes after a browser rotates its keys replaces its own row
 * rather than accumulating.
 *
 * WITHOUT A DATABASE THIS ANSWERS `localMode()`, not an error. `src/db/index.ts`
 * returns null rather than throwing and the whole app degrades instead of
 * breaking; no route may be the first thing here to break that promise, least
 * of all one whose entire feature is optional.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`moot:${clientKey(req)}`, 30, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const keys = (body.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";

  // All three or nothing. A half-formed subscription is one the dispatcher
  // would fail on silently, weeks later, for a player who thought he had asked.
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ ok: false, error: "incomplete" }, { status: 400 });
  }
  // An endpoint is a URL the push service gave the browser. Anything else is
  // either a bug or somebody probing, and neither belongs in the table.
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) {
    return Response.json({ ok: false, error: "bad_endpoint" }, { status: 400 });
  }

  const saved = await subscribeToMoot({ endpoint, p256dh, auth });
  if (!saved) return localMode();
  return serverOk({ subscribed: true });
}
