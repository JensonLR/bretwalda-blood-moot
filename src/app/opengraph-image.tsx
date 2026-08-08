import { ImageResponse } from "next/og";

/**
 * THE LINK CARD, AND WHY IT IS DRAWN RATHER THAN STORED.
 *
 * `layout.tsx` pointed both `openGraph.images` and `twitter.images` at
 * `/images/hero-bg.jpg`. There is no `public/` directory in this repository —
 * `globals.css` says so in its own comments, because the same missing file once
 * made every menu render on flat black. So the OG image was a 404, and had been
 * for as long as the tags existed: every unfurl of this game's link, on every
 * timeline and in every chat, resolved to nothing and the post collapsed to a
 * bare grey rectangle with a URL in it. Nobody reads a 404 in a link preview —
 * they see a link that looks broken, and scroll past.
 *
 * The fix cannot be "add a JPEG". This game opens from a link because it ships
 * no binary assets at all, and a hero photograph in the repository is the first
 * stone in exactly the avalanche that rule exists to prevent.
 *
 * So the card is DRAWN by the same renderer Next uses for `ImageResponse` —
 * flexbox in, PNG out. It costs one route, no bytes in git, and it cannot drift
 * from the game's palette because it is built from the values `globals.css`
 * defines.
 *
 * The size is 1200x630 and not the 1200x675 the old tags claimed. 675 is 16:9;
 * every consumer of this tag — X, Facebook, iMessage, WhatsApp, Slack, Discord
 * — specifies or crops to 1.91:1, so 16:9 loses its top and bottom and the
 * wordmark loses its ascenders. 630 is the number those platforms document.
 */

export const runtime = "nodejs";
export const alt = "BRETWALDA: BLOOD MOOT — multiplayer Anglo-Saxon sword fighting in the browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GILT = "#d9a441";
const GILT_LIT = "#f6dda0";
const GARNET_LIT = "#c8323c";

/**
 * Cinzel, the face the game is actually set in, fetched once and held for the
 * life of the process.
 *
 * `next/og` bundles Geist and will happily render without this. Geist is a
 * modern grotesque — on a card whose entire job is to look like a Dark Age
 * game at thumbnail size in somebody's timeline, it reads as a developer tool.
 * The wordmark IS the identity here, so it is worth one 46 KB request to set
 * it in the same face `globals.css` gives every heading in the product.
 *
 * `layout.tsx` already loads Cinzel from Google Fonts on every page, so this
 * introduces no dependency the app did not have. It is written to survive that
 * dependency failing anyway: a network that refuses — an air-gapped build, a
 * future Tauri/Steam package with no outbound access — falls back to the
 * bundled face and still produces a card. A link preview that is slightly off
 * -brand beats a build that fails, and beats a 404.
 */
let cinzel: ArrayBuffer | null | undefined;
async function loadCinzel(): Promise<ArrayBuffer | null> {
  if (cinzel !== undefined) return cinzel;
  try {
    // The stylesheet is asked for the TTF rather than the woff2 a browser would
    // get, because Satori parses TrueType and OpenType and not woff2. A
    // browser User-Agent here would be answered with woff2 and the parse would
    // fail — so the absence of one is load-bearing, not an oversight.
    const css = await fetch("https://fonts.googleapis.com/css2?family=Cinzel:wght@700", {
      headers: { "User-Agent": "BretwaldaOG/1.0" },
    }).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) throw new Error("no ttf in the Google Fonts stylesheet");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${res.status}`);
    cinzel = await res.arrayBuffer();
  } catch {
    cinzel = null;
  }
  return cinzel;
}

/**
 * Plaitwork with a garnet set in it — `globals.css`'s `.knot-band`, redrawn at
 * the scale a 1200px card needs.
 *
 * The period is three times the height, which is the ratio `--knot` uses (48
 * over 16). Getting that wrong is not subtle: at the 48x34 the first version of
 * this file used, the strands turn back on themselves too fast to read as
 * crossing and the whole band renders as a seismograph trace.
 *
 * The strands are broken either side of the stone rather than running under it
 * — a cabochon sitting on an unbroken plait reads as a sticker, which is the
 * same note `.knot-band` records about its own mask.
 */
const TILE = 96;
const H = 32;
const TILES = 6;
const BAND_W = TILE * TILES;
const MID = BAND_W / 2;
/** Half-width of the gap cut in the plait for the stone to sit in. */
const GAP = 26;

function strand(x: number, up: boolean): string {
  const [a, b] = up ? [6, 26] : [26, 6];
  return (
    `M${x} 16 C${x + 8} 16 ${x + 16} ${a} ${x + 24} ${a} C${x + 32} ${a} ${x + 40} 16 ${x + 48} 16` +
    ` C${x + 56} 16 ${x + 64} ${b} ${x + 72} ${b} C${x + 80} ${b} ${x + 88} 16 ${x + 96} 16`
  );
}

const KNOT =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAND_W}" height="${H}" viewBox="0 0 ${BAND_W} ${H}">` +
      `<defs>` +
      // The ends fade rather than stopping dead, and the middle is punched out
      // for the stone. Both are one mask so the plait needs only one pass.
      `<linearGradient id="f" x1="0" x2="1">` +
      `<stop offset="0" stop-color="#000"/><stop offset="0.13" stop-color="#fff"/>` +
      `<stop offset="0.87" stop-color="#fff"/><stop offset="1" stop-color="#000"/>` +
      `</linearGradient>` +
      `<mask id="m">` +
      `<rect width="${BAND_W}" height="${H}" fill="url(#f)"/>` +
      `<circle cx="${MID}" cy="16" r="${GAP}" fill="#000"/>` +
      `</mask>` +
      `<radialGradient id="stone" cx="0.34" cy="0.30" r="0.75">` +
      `<stop offset="0.14" stop-color="#ffcfc4"/><stop offset="0.44" stop-color="${GARNET_LIT}"/>` +
      `<stop offset="0.78" stop-color="#7c1420"/><stop offset="1" stop-color="#3a070c"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<g mask="url(#m)" fill="none" stroke="${GILT}" stroke-width="3" stroke-linecap="round">` +
      Array.from({ length: TILES }, (_, i) => {
        const x = i * TILE;
        return `<path d="${strand(x, true)}"/><path d="${strand(x, false)}"/>`;
      }).join("") +
      `</g>` +
      // The collet, then the stone: a gilt ring is what makes a red dot read as
      // set into the band instead of painted on top of it.
      `<circle cx="${MID}" cy="16" r="11" fill="none" stroke="${GILT}" stroke-width="2" opacity="0.9"/>` +
      `<circle cx="${MID}" cy="16" r="8.5" fill="url(#stone)"/>` +
      `</svg>`,
  );

export default async function OpengraphImage() {
  const face = await loadCinzel();
  // One family name either way, so the styles below never have to know which
  // face they got.
  const display = face ? "Cinzel" : "Geist";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0806",
          // The landing screen's own fire, in the order `.backdrop-hero` lays it
          // down — a bloom from beneath the wordmark, a cooler wash from above,
          // near-black under both — but pushed harder than the live backdrop.
          // On a screen those gradients sit behind a 3D scene and menu chrome;
          // alone on a flat card at timeline scale the same values read as an
          // evenly brown rectangle, and the card has one job, which is to not
          // look like a rectangle.
          backgroundImage:
            "radial-gradient(120% 78% at 50% 132%, rgba(226,116,26,0.62), rgba(226,116,26,0) 62%)," +
            "radial-gradient(80% 46% at 50% 108%, rgba(255,178,66,0.42), rgba(255,178,66,0) 60%)," +
            "radial-gradient(96% 56% at 50% -20%, rgba(255,178,66,0.16), rgba(255,178,66,0) 64%)," +
            "radial-gradient(120% 96% at 50% 46%, rgba(6,4,3,0) 34%, rgba(6,4,3,0.86) 100%)," +
            "linear-gradient(180deg, #241b11 0%, #16110c 46%, #0a0806 100%)",
          fontFamily: display,
        }}
      >
        <div
          style={{
            fontSize: 21,
            letterSpacing: 14,
            // Tracking pushes the last glyph past the box; without the matching
            // indent a centred line sits visibly left. Same correction as
            // `.label-overline`.
            textIndent: 14,
            color: GILT,
            marginBottom: 30,
          }}
        >
          ANGLO-SAXON ARENA
        </div>

        {/* Satori has no `background-clip: text`, so the wordmark cannot take
            the landing screen's gilt gradient. It gets the gradient's own
            mid-tone plus a warm bloom instead — one colour that is
            unmistakably struck gold beats a gradient that silently renders as
            transparent, and therefore as nothing at all. */}
        <div
          style={{
            fontSize: 122,
            lineHeight: 1,
            color: GILT_LIT,
            letterSpacing: 7,
            textIndent: 7,
            textShadow: `0 0 60px rgba(255,200,70,0.42), 0 3px 6px rgba(0,0,0,0.9)`,
          }}
        >
          BRETWALDA
        </div>

        <div
          style={{
            fontSize: 52,
            lineHeight: 1,
            marginTop: 20,
            color: "#d4453c",
            letterSpacing: 22,
            textIndent: 22,
            textShadow: "0 0 34px rgba(160,20,24,0.75), 0 2px 5px rgba(0,0,0,0.9)",
          }}
        >
          BLOOD MOOT
        </div>

        {/* A real <img>, not next/image: this tree is never mounted in a
            browser — Satori reads it and rasterises it — so a component that
            emits a srcset and a lazy loader has nothing to optimise here. */}
        <img src={KNOT} width={BAND_W} height={H} alt="" style={{ marginTop: 34 }} />

        <div style={{ fontSize: 26, marginTop: 30, color: "#c3baa8", letterSpacing: 1 }}>
          Multiplayer sword fighting in Dark Age Britain
        </div>
        <div style={{ fontSize: 19, marginTop: 16, color: "#8b8172", letterSpacing: 6, textIndent: 6 }}>
          PLAYS IN THE BROWSER · NO DOWNLOAD
        </div>
      </div>
    ),
    {
      ...size,
      fonts: face ? [{ name: "Cinzel", data: face, weight: 700, style: "normal" }] : undefined,
    },
  );
}
