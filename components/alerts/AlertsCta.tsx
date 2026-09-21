import Link from "next/link";
import { makeCaptcha } from "@/lib/captcha";
import { TelegramLink } from "@/components/site/TelegramLink";
import { InlineSubscribeForm } from "./InlineSubscribeForm";

interface Props {
  /** Pre-selects the digest's country filter (ISO-2), when we know one. */
  defaultCountry?: string;
  /** Region name for the headline, e.g. "Germany". Omit for worldwide. */
  regionLabel?: string | null;
  className?: string;
}

/**
 * Visible subscribe CTA for the owned-audience channels: the weekly email
 * digest, plus the Telegram channel when it's configured.
 *
 * The alerts backend has existed since the digest pipeline landed but was
 * only reachable from /alerts, so it converted almost nobody. This puts it
 * on the two pages with actual traffic (homepage, job detail).
 *
 * Server component: mints a fresh math captcha per render. Only mount it
 * on `force-dynamic` routes — on a statically rendered page the captoken
 * would be baked in at build time and expire 10 minutes later.
 */
export function AlertsCta({ defaultCountry, regionLabel, className }: Props) {
  const captcha = makeCaptcha();

  return (
    <section
      aria-labelledby="alerts-cta-heading"
      className={`rounded-xl border border-foreground/15 bg-muted/40 px-6 py-6 ${className ?? ""}`}
    >
      <h2 id="alerts-cta-heading" className="text-lg font-semibold">
        {regionLabel
          ? `Get new ${regionLabel} roles by email`
          : "Get new roles by email"}
      </h2>
      <p className="mt-1.5 text-sm text-foreground/65">
        A weekly digest of fresh listings. Free, one-click unsubscribe, never
        sold.
      </p>

      <div className="mt-5">
        <InlineSubscribeForm
          captchaQuestion={captcha.question}
          captchaToken={captcha.token}
          defaultCountry={defaultCountry}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/55">
        <Link href="/alerts" className="hover:text-foreground hover:underline">
          Pick countries &amp; work modes →
        </Link>
        <TelegramLink />
      </div>
    </section>
  );
}
