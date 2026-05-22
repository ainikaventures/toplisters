import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Analytics } from "@/components/analytics/Analytics";
import { TrackPageview } from "@/components/analytics/TrackPageview";
import { AdsLoader } from "@/components/ads/AdsLoader";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { SiteJsonLd } from "@/components/schema/SiteJsonLd";

// Per brand guidelines (brand/assets/tokens.css):
//   Space Grotesk    — display + body
//   Instrument Serif — editorial moments
//   JetBrains Mono   — code / dense numerics
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Toplisters.xyz — Jobs, mapped to the world",
    template: "%s · Toplisters.xyz",
  },
  description:
    "A globally-aware job board. Discover roles on an interactive 3D globe — blue-collar to white-collar, free to post.",
  // Per-page metadata layers on top of these defaults (per-page openGraph
  // merges, twitter inherits unless re-declared). siteName + locale are
  // set once here and inherited everywhere.
  openGraph: {
    type: "website",
    siteName: "Toplisters",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
  },
  other: {
    // AdSense ownership meta intentionally removed — ads are disabled
    // site-wide (info/COMPLIANCE.md) so the site stays non-commercial and
    // within the job APIs' free-tier terms. Re-add the
    // "google-adsense-account" meta here if ads are ever re-enabled.
    // Bing Webmaster Tools site ownership verification. Static meta tag,
    // no cookies / no JS, so it lives here rather than in the consent-gated
    // Analytics component. Pair with the XML sitemap already submitted at
    // https://www.bing.com/webmasters → toplisters.xyz.
    "msvalidate.01": "37732678DBE45B49903B790E524316AC",
  },
};

// Brand-ink address-bar tint on iOS / Android Chrome.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
  ],
};

// Inline no-flash script: must run synchronously before paint so dark-mode
// users don't see a flash of light content during hydration. Keep it tiny
// and `try`-wrapped — broken localStorage shouldn't break first paint.
const NO_FLASH = `(function(){try{var t=localStorage.getItem('tl-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <SiteJsonLd />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ConsentProvider>
          <ThemeProvider>{children}</ThemeProvider>
          <CookieBanner />
          <Analytics />
          <TrackPageview />
          <AdsLoader />
        </ConsentProvider>
      </body>
    </html>
  );
}
