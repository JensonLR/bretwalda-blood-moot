import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";

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
    description: "Multiplayer sword fighting in Dark Age Britain. Send your friends a link, choose a warrior, fight. No downloads.",
    // NO `images` ON EITHER OF THESE, DELIBERATELY.
    //
    // They used to name `/images/hero-bg.jpg`, which has never existed — this
    // repository has no `public/` directory at all — so every unfurl of this
    // link resolved a 404 and collapsed to a bare grey card. `opengraph-image.tsx`
    // now DRAWS the card per request, and Next wires it into both tag sets
    // automatically at the correct absolute URL. Naming an image here would
    // override that with the same broken path again.
    openGraph: {
      title: "BRETWALDA: BLOOD MOOT",
      siteName: "Bretwalda",
      description: "Real-time multiplayer sword fighting in Dark Age Britain. Open the link, choose a warrior, fight — no downloads.",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "BRETWALDA: BLOOD MOOT",
      description: "Real-time multiplayer sword fighting in your browser. Open the link and fight — works on any phone.",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Alegreya+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
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
