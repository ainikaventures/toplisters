import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * Shell for the sports vertical (sports.toplisters.xyz). Reuses the shared
 * header/footer with the sports nav variant — same brand, isolated content.
 */
export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader variant="sports" />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
