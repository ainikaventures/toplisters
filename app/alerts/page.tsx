import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { makeCaptcha } from "@/lib/captcha";
import { countryName } from "@/lib/format";
import { SubscribeForm } from "./_components/SubscribeForm";
import { fetchCountryOptions } from "./_data/options";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Email alerts",
  description:
    "Get a weekly digest of new roles matching your country and work-mode preferences. Free, opt-in, one-click unsubscribe.",
};

export default async function AlertsPage() {
  const captcha = makeCaptcha();
  const countryCodes = await fetchCountryOptions();
  const countryOptions = countryCodes
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <header className="mb-8 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Email alerts
          </h1>
          <p className="text-sm text-foreground/70">
            We send a weekly digest of new roles that match your filters.
            Confirm by email, unsubscribe in one click, never sold.
          </p>
        </header>

        <SubscribeForm
          countryOptions={countryOptions}
          captchaQuestion={captcha.question}
          captchaToken={captcha.token}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
