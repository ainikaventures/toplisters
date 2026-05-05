"use client";

import { useConsent } from "./ConsentProvider";

/**
 * Footer link that returns the user to the cookie banner. Renders the
 * current decision so it's clear what's being changed: "Cookies (on)" /
 * "Cookies (off)" / "Cookies".
 */
export function ManageCookies() {
  const { consent, hydrated, reset } = useConsent();
  const label = !hydrated
    ? "Cookies"
    : consent === "granted"
      ? "Cookies (on)"
      : consent === "denied"
        ? "Cookies (off)"
        : "Cookies";
  return (
    <button
      type="button"
      onClick={reset}
      className="hover:text-foreground"
    >
      {label}
    </button>
  );
}
