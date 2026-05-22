import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { fetchGlobeData } from "./_data/globe";
import { pageOpenGraph } from "@/lib/seo/og";
import { SiteHeader } from "@/components/site/SiteHeader";

// Globe.gl + three.js use browser-only globals (window, document); skip SSR.
const GlobeView = nextDynamic(
  () => import("@/components/globe/GlobeView").then((m) => m.GlobeView),
  { ssr: false, loading: () => <GlobeFallback /> },
);

export const metadata: Metadata = {
  description:
    "A globally-aware job board with an interactive 3D globe at the centre — discover roles by clicking your region.",
  alternates: { canonical: "/" },
  openGraph: pageOpenGraph({
    title: "Toplisters.xyz — Jobs, mapped to the world",
    description:
      "Interactive 3D globe job board — pick a region, see open roles.",
    url: "/",
  }),
};

// Always re-render so freshly-aggregated jobs show up immediately.
export const dynamic = "force-dynamic";

export default async function Landing() {
  const { clusters, totalJobs } = await fetchGlobeData();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <GlobeView clusters={clusters} totalJobs={totalJobs} />
    </div>
  );
}

function GlobeFallback() {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center bg-black text-sm text-white/60">
      Loading globe…
    </div>
  );
}
