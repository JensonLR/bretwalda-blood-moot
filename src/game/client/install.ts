// ============================================================
// THE INSTALL INVITATION — the earned half of the PWA shell (backlog 8.9/F).
//
// The shell landed on 27 Aug: `app/manifest.ts`, `public/sw.js`, forged icons.
// What did not land is the rule the row was written around, in its own words:
// *"an **earned** install prompt: never at first load, after a won match."*
// Without it the browser's own banner is all there is, and a browser fires that
// on its own schedule — Chrome's heuristic is roughly "engaged with the origin",
// which in practice means it can interrupt a man in the middle of a fight.
//
// WHY EARNED, AND IT IS NOT POLITENESS. An install prompt is a one-shot: a
// dismissal is remembered by the browser and `beforeinstallprompt` may never
// fire again for that origin. Spending it on a first-load visitor who has not
// yet seen why the game is worth a home-screen slot is spending the only ask
// there is at the moment it is least likely to be taken. A man who has just won
// a match has the answer in front of him. `docs/BACKLOG.md` Wave F calls this
// "the retention floor" and that is the whole argument for the sequencing.
//
// WHAT THIS FILE IS. A STORAGE SEAM — `tools/platformcheck.mjs` law 2, which is
// why it is named in that file's list rather than reaching for `localStorage`
// from a component. A Steam wrapper swaps the store; the desktop build has no
// install prompt at all and this module answers "no" there by construction,
// because a wrapped client is already installed.
//
// AND IT NEVER NAGS. One ask, ever. Taken or refused, the answer is written
// down and the invitation does not come back — a prompt a player has already
// said no to, asked again, is the pattern that makes people uninstall.
// ============================================================

/** The one key this seam owns. */
const ASKED_KEY = "bbm.install.asked";

/**
 * The event Chromium fires when a site becomes installable. Not in lib.dom yet
 * in any version this project pins, so it is declared here rather than widened
 * globally — nothing else in the tree has any business with it.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let captured: InstallPromptEvent | null = null;
let listening = false;

// ---------------------------------------------------------------------------
// The snapshot, and why this is a STORE rather than a value a component reads.
//
// Everything this module knows is client-only — a captured event, a media
// query, a localStorage key — and none of it exists on the server. A component
// that read it during render would hydrate a different tree than it
// server-rendered, which this repo has already paid for once ("a server-
// rendered binding cap is a hydration mismatch waiting to happen"), and one
// that read it in an effect and called setState is what the react gate forbids
// outright. `useSyncExternalStore` is the shape React provides for exactly this
// question, so the snapshot is a plain string and the server's answer is always
// "none".
//
// The snapshot MUST be referentially stable between notifications or the store
// tears — hence a cached string recomputed only when something actually moves.
// ---------------------------------------------------------------------------

/** What the game may offer this device, if anything. */
export type InstallOffer = "none" | "prompt" | "ios";

const watchers = new Set<() => void>();
let snapshot: InstallOffer = "none";

function recompute(): void {
  const next: InstallOffer = alreadyInstalled() || asked()
    ? "none"
    : captured ? "prompt" : isIosSafari() ? "ios" : "none";
  if (next === snapshot) return;
  snapshot = next;
  for (const w of watchers) w();
}

/** Subscribe to changes in what may be offered. */
export function subscribeInstall(cb: () => void): () => void {
  watchers.add(cb);
  return () => { watchers.delete(cb); };
}

/** What may be offered right now, ignoring whether it has been EARNED. */
export const installSnapshot = (): InstallOffer => snapshot;

/** The server knows nothing about this device, and must say so. */
export const installServerSnapshot = (): InstallOffer => "none";

// Storage can throw — Safari private mode, an embedded webview with cookies
// off — and an install prompt is never worth a crash, so a failure degrades to
// "not asked yet", which costs at most one extra offer on one device.
function asked(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(ASKED_KEY) !== null;
  } catch { return false; }
}
function markAsked(outcome: string): void {
  try { localStorage?.setItem(ASKED_KEY, outcome); } catch { /* nothing to do */ }
  recompute();
}

/** Already a home-screen app, or a desktop wrapper: there is nothing to offer. */
export function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch { /* matchMedia is not universal in webviews */ }
  // iOS Safari's own flag, which predates the display-mode media query.
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * iOS has no `beforeinstallprompt` AND IS NOT GOING TO GET ONE. Safari installs
 * only through Share -> Add to Home Screen, by hand, so the honest offer there
 * is a sentence and not a button. Worth carrying because the owner's stated
 * destination includes the iOS store and the PWA is the step before it.
 */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac; a Mac with touch points is an iPad.
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  // Every iOS browser is WebKit, and only Safari's own share sheet installs.
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Start listening. Called once at boot — the event fires early and is NOT
 * replayed, so a listener attached when the summary screen mounts would miss
 * it entirely. `preventDefault` is what suppresses the browser's own banner and
 * hands the timing to this game.
 */
export function watchForInstall(): () => void {
  if (typeof window === "undefined" || listening) return () => {};
  listening = true;
  const onPrompt = (e: Event) => { e.preventDefault(); captured = e as InstallPromptEvent; recompute(); };
  // Once installed, drop the handle: the event is spent and the offer is over.
  const onInstalled = () => { captured = null; markAsked("installed"); };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  // An iOS device never fires either event, and an already-installed one never
  // fires the first, so the snapshot is settled once here rather than waiting
  // on a listener that will not speak.
  recompute();
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    listening = false;
  };
}

/**
 * THE EARNING, and it is the whole rule: a lost match offers nothing, however
 * installable this device is. The row's words — "never at first load, after a
 * won match" — stated as code rather than as a comment.
 *
 * Pure, and takes the snapshot rather than reading the world, so the caller can
 * hold the store's value through `useSyncExternalStore` and this stays a
 * function of its arguments.
 */
export const offerFor = (won: boolean, available: InstallOffer): InstallOffer =>
  (won ? available : "none");

/**
 * Take the offer. Resolves once the browser's own dialog is answered; either
 * answer is written down, because a refusal is an answer and asking twice is
 * the behaviour this file exists to prevent.
 */
export async function askToInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = captured;
  if (!e) return "unavailable";
  captured = null;
  try {
    // The BROWSER'S OWN install dialog, not `window.prompt` — see
    // `tools/platformcheck.mjs` law 4, which forbids the three global dialogs
    // and says why this one is not among them.
    await e.prompt();
    const { outcome } = await e.userChoice;
    markAsked(outcome);
    return outcome;
  } catch {
    // A prompt that throws was already consumed or is out of its user gesture.
    markAsked("failed");
    return "unavailable";
  }
}

/** The iOS arm has no dialog to answer, so taking it is just closing it. */
export function dismissOffer(): void { markAsked("dismissed"); }
