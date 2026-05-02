import { InitialsAvatar, hashHue } from "@/app/jobs/_components/InitialsAvatar";

/**
 * Detail-page hero. 1000 × 350 max per the user's listing-vs-detail sizing
 * brief. Renders the source-supplied logo when available (RemoteOK ships
 * logo URLs in the API response); falls back to the deterministic initials
 * avatar otherwise. The gradient hue is hashed off the company name so the
 * background always feels matched to *something* — once node-vibrant is
 * wired we'll replace this with the logo's real dominant colour.
 */
export function HeroBanner({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  const hue = hashHue(companyName);
  const bgFrom = `hsl(${hue} 32% 88%)`;
  const bgTo = `hsl(${hue} 28% 96%)`;

  return (
    <div
      className="relative w-full max-w-[1000px] overflow-hidden rounded-2xl"
      style={{
        aspectRatio: "1000 / 350",
        maxHeight: "350px",
        background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-8">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${companyName} logo`}
            className="max-h-[180px] max-w-[280px] object-contain"
          />
        ) : (
          <InitialsAvatar
            name={companyName}
            className="size-full max-h-[180px] max-w-[180px]"
          />
        )}
      </div>
    </div>
  );
}
