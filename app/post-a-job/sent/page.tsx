import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = { title: "Check your email" };

export default function SubmissionSentPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span aria-hidden className="text-5xl">📬</span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          Check your email
        </h1>
        <p className="mt-4 max-w-md text-sm text-foreground/70">
          We sent a confirmation link to the address you provided. Click it
          within 24 hours to send your post to moderation.
        </p>
        <p className="mt-2 max-w-md text-xs text-foreground/55">
          Didn&apos;t arrive? Check your spam folder, or{" "}
          <Link href="/post-a-job" className="underline-offset-2 hover:underline">
            submit again
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
