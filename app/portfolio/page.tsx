import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const GITHUB = "https://github.com/ainikaventures";
const LINKEDIN = "https://linkedin.com/in/josenjoy";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Josen — AI Product Owner. Building AI and data products end to end, including TopListers: job-market intelligence mapped to the world.",
  alternates: { canonical: `${SITE_URL}/portfolio` },
};

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Josen",
  jobTitle: "AI Product Owner",
  url: `${SITE_URL}/portfolio`,
  sameAs: [GITHUB, LINKEDIN],
  worksFor: { "@type": "Organization", name: "Ainika", url: "https://ainika.xyz" },
};

const STATS: { value: string; label: string }[] = [
  { value: "100k+", label: "live roles, verified daily" },
  { value: "Dozens", label: "of countries covered" },
  { value: "Direct", label: "from-employer ATS sourcing" },
  { value: "0", label: "ads — free to post" },
];

const DECISIONS: { title: string; body: string }[] = [
  {
    title: "Source direct from employers, not aggregators",
    body: "Pull straight from employer ATS feeds (Greenhouse, Lever, Ashby) instead of paid aggregator APIs — fresher listings, de-duplicated, each one linking back to the original posting.",
  },
  {
    title: "Location-first discovery",
    body: "A 3D globe is the front door, so you can see where the opportunity actually is before you start filtering — not a wall of listings with a search box bolted on.",
  },
  {
    title: "Answer “can I work there?”, not just “does the job exist?”",
    body: "Visa-pathway intelligence and a live sponsor register sit alongside every listing, so the product answers the question that actually decides whether a role is real for you.",
  },
  {
    title: "Free, ad-free, terms-respecting",
    body: "No ads, every listing free to view, and if a source’s terms change we pull it. Trust is the product; the sourcing pipeline is built to keep it.",
  },
];

const PROJECTS: { name: string; tag: string; body: string; href?: string }[] = [
  {
    name: "TopListers",
    tag: "Flagship · live",
    body: "The product you are on. Globally-aware job-market intelligence with a 3D-globe discovery interface, direct-from-employer sourcing, and work-authorisation intelligence.",
    href: SITE_URL,
  },
  {
    name: "ZimpleTasks",
    tag: "AI · home services",
    body: "An AI WhatsApp assistant that turns an inbound message into an instant, deterministic quote and a booked job — replacing manual phone-and-diary handling for home-services businesses.",
  },
  {
    name: "AI Agent Desk",
    tag: "AI agents · in development",
    body: "An AI-agent platform that automates customer service, scheduling and back-office operations for UK service businesses. Deployed first inside a live operation, productising toward a SaaS launch.",
  },
  {
    name: "ML models",
    tag: "Data science · research",
    body: "An F1 Pit-Stop Optimiser and a Climate × Stock-Market intelligence model — predictive models built from MSc dissertation research.",
  },
];

function IconLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      {label}
      <span aria-hidden className="text-foreground/40">
        &#8599;
      </span>
    </a>
  );
}

export default function PortfolioPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_LD) }}
        />

        {/* Hero */}
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/50">
          AI Product Owner
        </p>
        <h1 className="mt-3 font-serif text-5xl leading-none tracking-tight sm:text-6xl">
          Josen
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground/80">
          I build AI and data products end to end &mdash; from the messy problem
          to the shipped, running thing. TopListers, the product you are on, is
          the clearest example.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <IconLink href={GITHUB} label="GitHub" />
          <IconLink href={LINKEDIN} label="LinkedIn" />
        </div>

        <p className="mt-10 text-sm leading-relaxed text-foreground/70">
          Ten years as a Senior Product Owner and Business Analyst, now building
          AI and data products hands-on. I own the whole loop &mdash; framing the
          problem, making the product calls, and staying close enough to the
          engineering to ship and keep things running.
        </p>

        {/* Flagship: TopListers */}
        <section className="mt-16 border-t border-foreground/10 pt-12">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/50">
            Flagship case study
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            TopListers &mdash; job-market intelligence, mapped to the world
          </h2>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="font-mono text-2xl font-semibold tracking-tight">
                  {s.value}
                </dt>
                <dd className="mt-1 text-xs leading-snug text-foreground/60">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-12 text-lg font-semibold">The problem</h3>
          <p className="mt-3 text-sm leading-relaxed text-foreground/75">
            Job data is fragmented and region-blind, and aggregators bury
            direct-from-employer roles behind ads and duplicates. Worse, most
            boards answer the wrong question &mdash; &ldquo;does this job
            exist?&rdquo; &mdash; when the one that decides whether a role is
            real for you is &ldquo;can I actually work there?&rdquo;
          </p>

          <h3 className="mt-10 text-lg font-semibold">
            The product decisions
          </h3>
          <ul className="mt-4 space-y-5">
            {DECISIONS.map((d) => (
              <li key={d.title}>
                <p className="text-sm font-medium text-foreground">{d.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                  {d.body}
                </p>
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-lg font-semibold">Under the hood</h3>
          <p className="mt-3 text-sm leading-relaxed text-foreground/75">
            Next.js (App Router) &middot; PostgreSQL + Prisma &middot; BullMQ /
            Redis worker queues &middot; a scheduled fetch &rarr; normalise
            &rarr; geocode &rarr; dedupe &rarr; upsert sourcing pipeline across
            direct employer ATS feeds and open providers &middot; a d3-geo /
            TopoJSON globe &middot; a public JSON API with keys &middot; email
            digests &middot; first-party analytics.
          </p>

          <h3 className="mt-10 text-lg font-semibold">
            Why it matters as an AI-PO artifact
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-foreground/75">
            It is a real product with real users and a real data pipeline
            behind it &mdash; not a slide deck. It shows product strategy and
            prioritisation, and enough technical depth to make the architecture
            calls and keep the thing running in production.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <IconLink href={SITE_URL} label="Visit toplisters.xyz" />
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              Live numbers
            </Link>
            <IconLink href={`${GITHUB}/toplisters`} label="Source" />
          </div>
        </section>

        {/* Other projects */}
        <section className="mt-16 border-t border-foreground/10 pt-12">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/50">
            What I build
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PROJECTS.map((p) => {
              const inner = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold">{p.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                      {p.tag}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                    {p.body}
                  </p>
                </>
              );
              return p.href ? (
                <a
                  key={p.name}
                  href={p.href}
                  target="_blank"
                  rel="noopener"
                  className="block rounded-lg border border-foreground/10 p-5 transition-colors hover:border-foreground/25"
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={p.name}
                  className="rounded-lg border border-foreground/10 p-5"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        {/* How I work */}
        <section className="mt-16 border-t border-foreground/10 pt-12">
          <h2 className="text-lg font-semibold">How I work</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/75">
            Product ownership with business-analysis rigour, plus hands-on
            fluency with LLMs, data pipelines and the systems around them. MSc
            in Data Science &amp; Computational Intelligence (Coventry, merit);
            SAFe-certified Product Owner / Product Manager.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <IconLink href={GITHUB} label="GitHub" />
            <IconLink href={LINKEDIN} label="LinkedIn" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
