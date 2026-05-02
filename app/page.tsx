import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { fetchGlobeData } from "./_data/globe";

// Globe.gl + three.js use browser-only globals (window, document); skip SSR.
const GlobeView = nextDynamic(
  () => import("@/components/globe/GlobeView").then((m) => m.GlobeView),
  { ssr: false, loading: () => <GlobeFallback /> },
);

export const metadata: Metadata = {
  description:
    "A globally-aware job board with an interactive 3D globe at the centre — discover roles by clicking your region.",
};

// Always re-render so freshly-aggregated jobs show up immediately.
export const dynamic = "force-dynamic";

export default async function Landing() {
  const { clusters, jobs } = await fetchGlobeData();
  return <GlobeView clusters={clusters} jobs={jobs} />;
}

function GlobeFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-black text-sm text-white/60">
      Loading globe…
    </div>
  );
}
