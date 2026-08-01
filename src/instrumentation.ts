/**
 * Runs once, when the server starts, before it takes a request.
 *
 * The only thing here is the match ledger, and it is here rather than in a
 * route because of a race that would otherwise cost somebody their gold: the
 * ledger has to be watching a socket from the moment it opens, and a player
 * whose browser opens the game socket in parallel with its first profile call
 * could get there first. Installing at boot means it is always already
 * watching.
 *
 * It is deliberately the only thing here. Startup work is startup latency, and
 * on a free tier that spins down, startup latency is the first thing a player
 * feels after tapping a link.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMatchLedger } = await import("./db/matchLedger");
  installMatchLedger();
}
