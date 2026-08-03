/**
 * "Get jobs on Telegram" link.
 *
 * The channel URL is configured, not hard-coded: set
 * NEXT_PUBLIC_TELEGRAM_URL (e.g. https://t.me/toplisters) and the link
 * appears everywhere this renders. Unset — the current state, the channel
 * doesn't exist yet — it renders nothing, so shipping this ahead of the
 * channel is safe.
 *
 * NEXT_PUBLIC_* is inlined at build time, so this works in server and
 * client components alike. Changing it needs a rebuild, not just a
 * restart.
 */
const RAW = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim();

/** Only ever link to Telegram — a mistyped env shouldn't point users elsewhere. */
const TELEGRAM_URL =
  RAW && /^https:\/\/(t\.me|telegram\.me)\//i.test(RAW) ? RAW : null;

export function TelegramLink({ className }: { className?: string }) {
  if (!TELEGRAM_URL) return null;

  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener"
      className={className ?? "hover:text-foreground hover:underline"}
    >
      Get jobs on Telegram →
    </a>
  );
}
