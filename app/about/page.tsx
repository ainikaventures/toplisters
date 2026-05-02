import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "About",
  description:
    "Toplisters.xyz is a product by Ainika, developed and maintained by Lyrava — a globally-aware job board with a 3D globe at the centre.",
  alternates: { canonical: `${SITE_URL}/about` },
};

const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Toplisters",
  url: SITE_URL,
  description:
    "Globally-aware job board with a 3D globe discovery interface — covering blue-collar and white-collar roles, free for employers to post.",
  parentOrganization: {
    "@type": "Organization",
    name: "Ainika",
    url: "https://ainika.xyz",
  },
  founder: {
    "@type": "Organization",
    name: "Lyrava",
    url: "https://lyrava.com",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_LD) }}
        />

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          About Toplisters
        </h1>

        <p className="mt-6 text-base leading-relaxed text-foreground/80">
          Toplisters.xyz is a product by{" "}
          <a
            href="https://ainika.xyz"
            rel="noopener"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Ainika
          </a>
          , developed and maintained by{" "}
          <a
            href="https://lyrava.com"
            rel="noopener"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Lyrava
          </a>
          . We aggregate roles from public job boards into a single
          location-aware view, anchored by a 3D globe so you can see where
          the opportunities are before you start filtering.
        </p>

        <h2 className="mt-10 text-lg font-semibold">What this is</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          A globally-aware job board covering blue-collar and white-collar
          roles. Employers post free; we pull from public APIs and respect
          each source&apos;s terms. The globe is the front door, but the{" "}
          <Link href="/jobs" className="underline-offset-2 hover:underline">
            full listing
          </Link>{" "}
          and per-city pages are designed for serious search.
        </p>

        <h2 className="mt-10 text-lg font-semibold">Honest about the early days</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          We&apos;re building in public. Two job sources are wired up so
          far (RemoteOK and Arbeitnow); more land as we work through their
          terms of service. If you spot something missing or wrong, the
          repo is at{" "}
          <a
            href="https://github.com/ainikaventures/toplisters"
            rel="noopener"
            className="underline-offset-2 hover:underline"
          >
            github.com/ainikaventures/toplisters
          </a>
          .
        </p>

        <h2 className="mt-10 text-lg font-semibold">Posting a role</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          Free job posting (with magic-link confirmation, no account
          needed) is on the immediate roadmap. Until that lands, reach out
          to{" "}
          <a
            href="https://lyrava.com"
            rel="noopener"
            className="underline-offset-2 hover:underline"
          >
            Lyrava
          </a>{" "}
          if you want to discuss a custom careers page or a sponsored
          listing.
        </p>
      </main>
    </div>
  );
}
