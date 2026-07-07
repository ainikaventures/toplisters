import Link from "next/link";

const TABS: { href: string; label: string }[] = [
  { href: "/admin/queue", label: "Moderation queue" },
  { href: "/admin/featured", label: "Featured" },
  { href: "/admin/inbox", label: "Recruiter inbox" },
  { href: "/admin/coverage", label: "Direct coverage" },
  { href: "/admin/bullmq", label: "Queues" },
];

/**
 * Small horizontal nav at the top of every /admin/* page. Server
 * component — Next 14 doesn't give us the active path here without a
 * client wrapper, so we render every tab as a plain link and let the
 * page itself style its own current state if needed.
 */
export function AdminNav() {
  return (
    <nav className="mb-8 flex items-center gap-4 border-b border-foreground/10 pb-3 text-sm">
      <span className="font-semibold tracking-tight">Admin</span>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="text-foreground/60 hover:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
