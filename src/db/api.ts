import { NextResponse } from "next/server";
import type { StoreError } from "./profiles";

/**
 * The shape every profile route answers in, and the reason it has three cases
 * rather than two.
 *
 * `mode: "local"` is not an error. It is the answer when this deployment has
 * no database — unconfigured, expired, or down — and it means "keep your gold
 * on the device, the way the game worked before this existed". A client that
 * only knows success and failure would show a red banner on a perfectly
 * playable game, so degradation gets its own success case and the client
 * branches on `mode` exactly once.
 */

export type ApiMode = "server" | "local";

export function serverOk(payload: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, mode: "server" as ApiMode, ...payload });
}

export function localMode(): NextResponse {
  return NextResponse.json({ ok: true, mode: "local" as ApiMode });
}

const STATUS: Record<StoreError, number> = {
  offline: 200,
  auth: 401,
  unknown_item: 400,
  insufficient_gold: 409,
  no_award: 404,
  not_yours: 403,
  not_bound: 409,
  already_claimed: 409,
  replayed: 409,
  expired: 410,
  not_found: 404,
};

const MESSAGE: Record<StoreError, string> = {
  offline: "Playing locally — the war rolls are not being kept.",
  auth: "That profile and key do not match.",
  unknown_item: "No such thing in the armoury.",
  insufficient_gold: "Not enough gold.",
  no_award: "No pay is owed for that fight.",
  not_yours: "That pay belongs to another warrior.",
  not_bound: "Nobody claimed that warrior when the fight began.",
  already_claimed: "This profile has already taken in an old save.",
  replayed: "That save has already been taken in.",
  expired: "The window for bringing old saves across has closed.",
  not_found: "No warrior answers to that.",
};

export function storeError(error: StoreError): NextResponse {
  if (error === "offline") return localMode();
  return NextResponse.json(
    { ok: false, error, message: MESSAGE[error] },
    { status: STATUS[error] },
  );
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: "bad_request", message }, { status: 400 });
}

export function tooMany(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "rate_limited", message: "Too many attempts. Wait a moment." },
    { status: 429 },
  );
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Who to count a request against. Behind Render's proxy the socket address is
 * the proxy, so the forwarded header is the only thing with any resolution —
 * and it is spoofable, which is why nothing here is a security boundary. It
 * slows a phrase-guessing script down; it does not stop a determined one.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 45);
  return req.headers.get("x-real-ip")?.slice(0, 45) || "unknown";
}

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

/**
 * A fixed-window counter, in memory, per process. It is enough for what it
 * guards: a stranger typing four-word phrases at the recovery box. Anything
 * stronger wants a shared store, and this game does not have one.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) {
    buckets.forEach((b, k) => { if (b.resetAt < now) buckets.delete(k); });
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
