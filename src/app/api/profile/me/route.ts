import { NextRequest } from "next/server";
import { loadProfile } from "@/db/profiles";
import { clientKey, rateLimit, readBody, serverOk, storeError, tooMany } from "@/db/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/me  { id, secret }  ->  the profile.
 *
 * A read, over POST, because the secret is a bearer token and a query string
 * is the one part of a request that ends up in access logs, proxy caches and
 * the odd screenshot.
 *
 * This is also the boot check: a client that gets `mode: "local"` here knows
 * the deployment has no database today and should run on device-local gold.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`me:${clientKey(req)}`, 600, 60_000)) return tooMany();
  const body = await readBody(req) ?? {};
  const result = await loadProfile(body.id, body.secret);
  if (!result.ok) return storeError(result.error);
  return serverOk({ profile: result.value });
}
