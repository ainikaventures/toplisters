import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { makeCaptcha } from "@/lib/captcha";
import { PostJobForm } from "./_components/PostJobForm";

export const metadata: Metadata = {
  title: "Post a job",
  description:
    "Free job posting on Toplisters.xyz. Magic-link email confirmation, no account required.",
};

// Captcha is generated per render so it's always fresh.
export const dynamic = "force-dynamic";

export default function PostAJobPage() {
  const captcha = makeCaptcha();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <header className="mb-8 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Post a job
          </h1>
          <p className="max-w-2xl text-sm text-foreground/70">
            Free for employers. We&apos;ll email you a confirmation link;
            once confirmed, your post enters the moderation queue and goes
            live within 24 hours. No account required.
          </p>
        </header>

        <PostJobForm
          captchaQuestion={captcha.question}
          captchaToken={captcha.token}
        />

        <aside className="mt-12 rounded-xl border border-foreground/10 bg-muted/40 p-5 text-sm text-foreground/75">
          <h2 className="mb-2 font-semibold text-foreground">
            Building your own careers page?
          </h2>
          <p>
            <a
              href="https://lyrava.com"
              rel="noopener"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Lyrava
            </a>{" "}
            builds custom job boards and company websites. Get a quote.
          </p>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
