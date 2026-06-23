import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { makeCaptcha } from "@/lib/captcha";
import { ContactForm } from "./_components/ContactForm";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with Toplisters — questions, feedback, partnerships, or to list your roles. We read every message.",
  alternates: { canonical: "/contact" },
};

// Captcha is generated per render so it's always fresh.
export const dynamic = "force-dynamic";

export default function ContactPage() {
  const captcha = makeCaptcha();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <header className="mb-8 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact us</h1>
          <p className="max-w-2xl text-sm text-foreground/70">
            Questions, feedback, partnerships, or want your roles featured? Send us a message —
            we read every one and usually reply within a day. Recruiters: tell us what you&apos;re
            hiring for.
          </p>
        </header>

        <ContactForm captchaQuestion={captcha.question} captchaToken={captcha.token} />
      </main>
      <SiteFooter />
    </div>
  );
}
