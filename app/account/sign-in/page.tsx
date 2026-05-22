import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { makeCaptcha } from "@/lib/captcha";
import { getSessionUser } from "@/lib/auth/session";
import { SignInForm } from "./_components/SignInForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Toplisters with a magic link — no password. Save jobs and manage your account.",
  robots: { index: false },
};

const ERROR_COPY: Record<string, string> = {
  invalid: "That sign-in link was missing or malformed. Request a fresh one below.",
  expired: "That sign-in link has expired or was already used. Request a fresh one below.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/account");

  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : undefined;
  const errorMessage = params.error ? ERROR_COPY[params.error] : undefined;
  const captcha = makeCaptcha();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <header className="mb-8 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-foreground/70">
            Enter your email and we&apos;ll send you a one-time sign-in link.
          </p>
        </header>

        {errorMessage ? (
          <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            {errorMessage}
          </p>
        ) : null}

        <SignInForm
          captchaQuestion={captcha.question}
          captchaToken={captcha.token}
          next={next}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
