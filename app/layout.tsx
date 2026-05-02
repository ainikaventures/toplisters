import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Analytics } from "@/components/analytics/Analytics";

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
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
