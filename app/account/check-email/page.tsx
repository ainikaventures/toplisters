import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false },
};

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span aria-hidden className="text-5xl">
          📬
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          Check your inbox
        </h1>
        <p className="mt-4 max-w-md text-sm text-foreground/70">
          If that email is valid, we just sent a one-time sign-in link. It works
          once and expires in 15 minutes. You can close this tab — the link opens
          your account.
        </p>
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
