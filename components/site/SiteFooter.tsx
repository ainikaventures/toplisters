import Link from "next/link";

/**
 * Shared footer for /jobs/* and /job/* routes. Single line of attribution
 * to the owned-network sites — brand-name anchors only, rel=noopener but
 * NOT nofollow (these are legitimate parent/developer attributions per
 * the spec's network-link rules).
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-foreground/10 px-6 py-6 text-center text-xs text-foreground/60">
      Built by{" "}
      <a
        href="https://ainika.xyz"
        rel="noopener"
        className="font-medium text-foreground hover:underline"
      >
        Ainika
      </a>
      {" · "}Developed by{" "}
      <a
        href="https://lyrava.com"
        rel="noopener"
        className="font-medium text-foreground hover:underline"
      >
        Lyrava
      </a>
      {" · "}
      <Link
        href="/about"
        className="hover:text-foreground"
      >
        About
      </Link>
    </footer>
  );
}
