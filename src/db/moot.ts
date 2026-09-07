import { sql } from "drizzle-orm";
import { withDb } from "./index";
import { pushSubscriptions } from "./schema";

/**
 * A device asking to be called to the Moot — docs/ONE-CLIENT.md §6.3.
 *
 * Upserted on the endpoint, which IS the identity: a browser that rotates its
 * keys re-subscribes with the same endpoint and must replace its row rather
 * than leave a stale pair behind that the dispatcher would fail on.
 *
 * Returns false with no database, in keeping with every other write here.
 */
export async function subscribeToMoot(sub: {
  endpoint: string; p256dh: string; auth: string;
}): Promise<boolean> {
  return withDb(async (db) => {
    // `profile_id` IS DELIBERATELY LEFT NULL BY THIS ROUTE.
    //
    // The column exists because a later dispatcher may want to say something
    // to a man rather than to a browser. But resolving a profile here would
    // mean trusting an id off the wire without its secret, or asking for the
    // secret to subscribe to a notification — and neither is worth it when the
    // ENDPOINT is already the identity the push service will use. A device is
    // called; who is holding it is the dispatcher's problem when it has one.
    const profileId = null;
    await db.insert(pushSubscriptions)
      .values({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, profileId })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: sub.p256dh, auth: sub.auth, profileId, createdAt: sql`now()` },
      });
    return true;
  }, false);
}
