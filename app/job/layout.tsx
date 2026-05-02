import { SiteHeader } from "@/components/site/SiteHeader";

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      {children}
    </div>
  );
}
