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
    openGraph: {
      title: "BRETWALDA: BLOOD MOOT",
      siteName: "Bretwalda",
      description: "Real-time multiplayer sword fighting in Dark Age Britain. Tap to join the battle — works on any phone, no downloads.",
      images: [{ url: "/images/hero-bg.jpg", width: 1200, height: 675, alt: "Anglo-Saxon warriors gathered around a war camp bonfire" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "BRETWALDA: BLOOD MOOT",
      description: "Real-time multiplayer sword fighting in your browser. Tap to join — works on any phone.",
      images: ["/images/hero-bg.jpg"],
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
      <body className="bg-stone-950 text-white antialiased">{children}</body>
    </html>
  );
}
