import type { Metadata } from "next";
import { JobChat } from "../_components/JobChat";
import { pageOpenGraph } from "@/lib/seo/og";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "AI job search",
  description:
    "Chat to find jobs. Describe the role, location, remote preference and salary — the assistant searches Toplisters' live listings and recommends matches.",
  alternates: { canonical: `${SITE_URL}/jobs/chat` },
  openGraph: pageOpenGraph({
    title: "AI job search · Toplisters.xyz",
    description: "Chat to find real, current jobs from across the world.",
    url: `${SITE_URL}/jobs/chat`,
  }),
};

export default function JobChatPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">AI job search</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Describe what you&apos;re after — the assistant searches our live listings and recommends
          real roles. It never invents jobs.
        </p>
      </header>
      <JobChat />
    </div>
  );
}
