/**
 * Runs once, when the server starts, before it takes a request.
 *
 * Two subscriptions, both here rather than in a route because of the same
 * race: a hook that arrives after the first match is a hook that missed one.
 *
 * THE MATCH LEDGER has to be watching a socket from the moment it opens, and a
 * player whose browser opens the game socket in parallel with its first profile
 * call could get there first — which would cost him his gold.
 *
 * THE WAR LEDGER subscribes to `endMatch` and banks contested points. Its race
 * is worse than the ledger's rather than better: a missed match is a border
 * that did not move and a contribution nobody can reconstruct, because the
 * engine keeps nothing after the summary rolls back.
 *
 * Both are cheap and neither touches the database at boot — `installWarLedger`
 * registers a callback and nothing else. Startup work is startup latency, and
 * on a free tier that spins down, startup latency is the first thing a player
 * feels after tapping a link.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMatchLedger } = await import("./db/matchLedger");
  installMatchLedger();
  const { installWarLedger } = await import("./db/war");
  installWarLedger();
}
