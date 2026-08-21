import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";

import { Cinzel, Alegreya_Sans } from "next/font/google";

/**
 * THE TWO FACES, SELF-HOSTED, and it is not a style change.
 *
 * These came off `fonts.googleapis.com` through a stylesheet `<link>` in the
 * document head — which is a render-blocking request to a third party before
 * the landing screen can paint, plus two `preconnect`s to warm it up, plus the
 * flash of fallback text while it lands. `react-doctor/nextjs-no-font-link`.
 *
 * `next/font` fetches both families at BUILD time, serves them from this
 * origin, and emits the `@font-face` rules itself with `size-adjust` metrics
 * computed against the fallback — so the swap no longer moves the layout. The
 * weights are exactly the ones the old query string asked for and no more:
 * unlisted weights would be synthesised by the browser, which is what made
 * `Cinzel` look thin on Android.
 *
 * They are exposed as CSS VARIABLES rather than as class names because
 * `globals.css` names the families in five places, and a variable is one
 * definition those five can read. The literal family names stay in the stacks
 * as the fallback they always were.
 */
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const alegreyaSans = Alegreya_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});


// metadataBase is resolved per-request from the real Host header so
// Open Graph links/images are ALWAYS absolute to wherever this is served —
// group-chat unfurls work on any deployment automatically.
export async function generateMetadata(): Promise<Metadata> {
  let origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!origin) {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") || h.get("host");
      const proto = h.get("x-forwarded-proto") || "https";
      if (host) origin = `${proto}://${host}`;
    } catch { /* build time */ }
  }
  return {
    metadataBase: origin ? new URL(origin) : undefined,
    title: "BRETWALDA: BLOOD MOOT — Anglo-Saxon Arena Combat",
    description: "Multiplayer sword fighting in Dark Age Britain. Raise a blood moot, call your friends to the field, and fight for your kingdom.",
    // NO `images` ON EITHER OF THESE, DELIBERATELY.
    //
    // They used to name `/images/hero-bg.jpg`, which never existed, so every
    // unfurl of this link resolved a 404 and collapsed to a bare grey card.
    // `opengraph-image.tsx` now DRAWS the card per request (with the owner's
    // helm mark set into it), and Next wires it into both tag sets
    // automatically at the correct absolute URL. Naming an image here would
    // override that with the same broken path again.
    openGraph: {
      title: "BRETWALDA: BLOOD MOOT",
      siteName: "Bretwalda",
      description: "Real-time multiplayer sword fighting in Dark Age Britain. Open the link, choose your warrior, and fight for your kingdom.",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "BRETWALDA: BLOOD MOOT",
      description: "Real-time multiplayer sword fighting in Dark Age Britain. Open the link and take the field for your kingdom.",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${alegreyaSans.variable}`}>
      {/* NO COLOUR UTILITIES ON THIS ELEMENT.
          `bg-stone-950 text-white` used to sit here, and it beat the palette:
          Tailwind emits utilities into @layer utilities, which outranks the
          @layer base rule in globals.css that sets the game's real ground
          (#14100b) and its real ink (#f0e9da, warm vellum). So every screen was
          painted on a cool near-black with pure white text — the two colours
          the Sutton Hoo palette specifically does not use — and the palette
          only ever applied where a component happened to restate it. This is
          the same layering trap the top of globals.css documents, arriving
          from the one element nobody thought to check. Anything this element
          needs belongs in globals.css with the rest of the system. */}
      <body className="antialiased">{children}</body>
    </html>
  );
}
