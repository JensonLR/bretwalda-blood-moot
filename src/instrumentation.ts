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
  // EDGE ONLY IS WHAT THIS EXCLUDES, and it used to exclude more than that.
  //
  // The test was `NEXT_RUNTIME !== "nodejs"` — a positive match on a variable
  // Next sets for its own runtimes. This game does not run under `next start`;
  // it runs under `custom-server.mjs`, which calls `app.prepare()` itself, and
  // whether that path sets `NEXT_RUNTIME` is not something this file should be
  // betting the entire war layer on. If it is unset, `register` returned
  // immediately, `onMatchEnd` was never subscribed, and every match in
  // production banked nothing while `tools/warflow.mjs` ran 28/28 locally —
  // which is the shape of the owner's report exactly.
  //
  // Excluding "edge" by name says what is actually meant: this needs a Node
  // runtime because it touches Postgres, and everything that is not the edge
  // runtime is one.
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { installMatchLedger } = await import("./db/matchLedger");
  installMatchLedger();
  const { installWarLedger } = await import("./db/war");
  installWarLedger();
}
