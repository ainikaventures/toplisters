import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = { title: "Posting confirmed" };

const COPY = {
  ok: {
    icon: "✅",
    title: "Email confirmed",
    body: "Your post is in the moderation queue and will go live within 24 hours. You'll get an email once it's published.",
  },
  expired: {
    icon: "⌛",
    title: "Link expired",
    body: "Confirmation links are valid for 24 hours. Please submit again — it only takes a minute.",
  },
  invalid: {
    icon: "🚫",
    title: "Invalid link",
    body: "We couldn't find a submission for that link. It may have already been confirmed or the URL was mistyped.",
  },
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status ?? "ok") as keyof typeof COPY;
  const copy = COPY[status] ?? COPY.invalid;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span aria-hidden className="text-5xl">{copy.icon}</span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-md text-sm text-foreground/70">{copy.body}</p>
        <Link
          href="/jobs"
          className="mt-8 rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Browse jobs →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
