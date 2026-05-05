import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Toplisters.xyz collects, why, and how to control it. Plain language.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy
        </h1>
        <p className="mt-2 text-sm text-foreground/55">
          Last updated: 2026-05-05
        </p>

        <h2 className="mt-10 text-lg font-semibold">In short</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          We don&apos;t collect anything personal unless you tell us. We use
          analytics cookies to see which pages people read, but only after
          you click Accept on the cookie banner. Decline and we don&apos;t
          set them.
        </p>

        <h2 className="mt-10 text-lg font-semibold">
          What we collect, by section
        </h2>

        <h3 className="mt-6 text-base font-semibold">Browsing the site</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
          <li>
            <strong>Server logs</strong> (IP, user agent, URL): kept ~7
            days, used to diagnose abuse and outages, never sold.
          </li>
          <li>
            <strong>Analytics cookies (opt-in)</strong>: Google Analytics 4
            and PostHog if you click Accept. They set first- and
            third-party cookies to attribute pageviews and sessions.
            Decline → none of this fires.
          </li>
          <li>
            <strong>IP geolocation</strong>: on first visit we look up
            country/coords from your IP via ipapi.co so the globe
            auto-rotates to your region. Result is cached in a cookie on
            your device for 30 days. We don&apos;t store the IP.
          </li>
        </ul>

        <h3 className="mt-6 text-base font-semibold">
          Clicking <em>Apply now</em>
        </h3>
        <p className="mt-2 text-sm text-foreground/80">
          We record the click so we can show employers how their listings
          performed. We hash your IP with a per-deploy salt and keep the
          first 16 hex characters — enough to count unique clicks per day
          without keeping anything that could re-identify you.
        </p>

        <h3 className="mt-6 text-base font-semibold">Posting a job</h3>
        <p className="mt-2 text-sm text-foreground/80">
          The email you provide is used only to send the magic-link
          confirmation and a one-time notification when your post goes
          live (or is rejected). No marketing.
        </p>

        <h2 className="mt-10 text-lg font-semibold">Your controls</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/80">
          <li>
            Change your cookie choice anytime via the <strong>Cookies</strong>
            link in the footer.
          </li>
          <li>
            Want a job posting removed? Email{" "}
            <a
              href="mailto:hello@toplisters.xyz"
              className="underline-offset-2 hover:underline"
            >
              hello@toplisters.xyz
            </a>{" "}
            from the address you submitted with.
          </li>
          <li>
            UK / EU residents: you have GDPR rights to access, correct,
            and delete data. Same email works.
          </li>
        </ul>

        <h2 className="mt-10 text-lg font-semibold">Data processors</h2>
        <p className="mt-3 text-sm text-foreground/80">
          Tools we use that touch user data:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
          <li>
            <strong>Cloudflare</strong> (CDN, DDoS) — sees every request,
            standard log retention.
          </li>
          <li>
            <strong>Google Analytics 4</strong> (opt-in) — pageview,
            session, geographic data.
          </li>
          <li>
            <strong>PostHog</strong> (opt-in, EU-hosted) — pageview,
            session, optional product events.
          </li>
          <li>
            <strong>Resend</strong> — sends the magic-link / approval
            emails.
          </li>
          <li>
            <strong>ipapi.co</strong> — IP→country lookup for the globe.
          </li>
        </ul>

        <p className="mt-10 text-xs text-foreground/55">
          Toplisters.xyz is a product by{" "}
          <a
            href="https://ainika.xyz"
            rel="noopener"
            className="underline-offset-2 hover:underline"
          >
            Ainika
          </a>
          , developed by{" "}
          <a
            href="https://lyrava.com"
            rel="noopener"
            className="underline-offset-2 hover:underline"
          >
            Lyrava
          </a>
          . See{" "}
          <Link href="/about" className="underline-offset-2 hover:underline">
            About
          </Link>{" "}
          for the broader context.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
