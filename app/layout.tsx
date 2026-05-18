import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Analytics } from "@/components/analytics/Analytics";
import { TrackPageview } from "@/components/analytics/TrackPageview";
import { AdsLoader } from "@/components/ads/AdsLoader";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { SiteJsonLd } from "@/components/schema/SiteJsonLd";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Toplisters.xyz — Jobs, mapped to the world",
    template: "%s · Toplisters.xyz",
  },
  description:
    "A globally-aware job board. Discover roles on an interactive 3D globe — blue-collar to white-collar, free to post.",
  other: {
    // Google AdSense ownership verification. Renders as
    // <meta name="google-adsense-account" content="ca-pub-..." />.
    // Does NOT load adsbygoogle.js — that's done by AdsLoader after consent
    // (preserves the consent-gated design from commit 3a191aa).
    "google-adsense-account": "ca-pub-2028217968551720",
    // Bing Webmaster Tools site ownership verification. Static meta tag,
    // no cookies / no JS, so it lives here rather than in the consent-gated
    // Analytics component. Pair with the XML sitemap already submitted at
    // https://www.bing.com/webmasters → toplisters.xyz.
    "msvalidate.01": "37732678DBE45B49903B790E524316AC",
  },
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
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
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
