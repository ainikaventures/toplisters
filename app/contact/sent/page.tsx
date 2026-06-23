import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = { title: "Message sent", robots: { index: false } };

export default function ContactSentPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span aria-hidden className="text-5xl">✅</span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">Message sent</h1>
        <p className="mt-4 max-w-md text-sm text-foreground/70">
          Thanks for reaching out — we&apos;ve got your message and will reply to the email you
          gave us, usually within a day.
        </p>
        <p className="mt-2 max-w-md text-xs text-foreground/55">
          Need to add something?{" "}
          <Link href="/contact" className="underline-offset-2 hover:underline">
            Send another message
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
