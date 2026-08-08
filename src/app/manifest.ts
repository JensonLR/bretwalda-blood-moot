import type { MetadataRoute } from "next";

/**
 * THE PWA MANIFEST — "add to home screen", without a store.
 *
 * `docs/PLATFORM-PATH.md` §6 has had this as the first mobile step for weeks:
 * installable straight from the link, no store, no review queue, no 30% cut,
 * and it is the only mobile option that costs nothing. This is that step.
 *
 * WHAT IT ACTUALLY BUYS, beyond an icon on a home screen:
 *
 *   `display: "standalone"` takes the browser chrome away. On a phone that is
 *   roughly 120px of vertical — the address bar and the toolbar — handed back
 *   to a game whose fight HUD is laid out against a 390x844 viewport. It also
 *   stops the address bar appearing and disappearing mid-fight as the page
 *   scrolls, which resizes the WebGL canvas while a man is swinging.
 *
 *   `orientation: "portrait"` because the touch controls are laid out for a
 *   thumb either side of a portrait screen; a landscape rotation mid-match puts
 *   the attack buttons under the player's palms.
 *
 * NO SERVICE WORKER, deliberately. Installability does not require one, and a
 * worker that cached this app would be a liability rather than a feature: the
 * whole thing is a live WebSocket against an authoritative server, so there is
 * nothing useful to serve offline, and a stale cached bundle talking a newer
 * wire protocol is a class of bug this project does not need. If offline ever
 * matters it will be for the armoury, and that is a decision with its own
 * reasons rather than a box to tick.
 *
 * The colours come from `globals.css`: `#14100b` is the ground the whole game
 * is painted on, and using it for `background_color` means the splash screen a
 * phone shows while the app boots is the same near-black the first frame lands
 * on, rather than a white flash before it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bretwalda: Blood Moot",
    // Eleven characters is about what a home screen will show before it
    // truncates, and "Bretwalda" alone is the word players use.
    short_name: "Bretwalda",
    description:
      "Multiplayer sword fighting in Dark Age Britain. Choose a warrior, take the field, fight.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14100b",
    theme_color: "#14100b",
    categories: ["games"],
    icons: [
      {
        // `/icon` is the route `app/icon.tsx` serves — drawn per request, so
        // there is no PNG in the tree. `purpose: "any"` and a separate
        // "maskable" entry point at the same art on purpose: the icon already
        // keeps its helm well inside the frame, so a mask crop takes nothing
        // off it, and declaring both stops Android drawing a white rounded
        // square behind it.
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
