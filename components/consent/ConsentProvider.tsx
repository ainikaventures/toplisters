"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ConsentState = "granted" | "denied" | "pending";

interface ConsentContextValue {
  consent: ConsentState;
  /** True after the first client-side hydration tick — gate any UI that depends on real consent state. */
  hydrated: boolean;
  grant: () => void;
  deny: () => void;
  /** Revoke a prior decision; returns the user to the banner. */
  reset: () => void;
}

const STORAGE_KEY = "tl-consent";
const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Persists the user's analytics-cookie decision in localStorage. Default
 * state is "pending" so analytics scripts (PostHog, GA4) stay dormant
 * until the user clicks Accept. EU/UK requires this opt-in posture before
 * any non-essential cookies are set.
 *
 * The `hydrated` flag avoids SSR flicker on the banner — server renders
 * always with consent="pending" but we only show the banner once the
 * client has read the actual stored value.
 */
export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>("pending");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "granted" || stored === "denied") {
        setConsent(stored);
      }
    } catch {
      /* localStorage may be blocked — leave as pending */
    }
    setHydrated(true);
  }, []);

  const grant = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "granted");
    } catch {
      /* ignore */
    }
    setConsent("granted");
  }, []);

  const deny = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "denied");
    } catch {
      /* ignore */
    }
    setConsent("denied");
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConsent("pending");
  }, []);

  const value = useMemo(
    () => ({ consent, hydrated, grant, deny, reset }),
    [consent, hydrated, grant, deny, reset],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be called inside <ConsentProvider>");
  return ctx;
}
