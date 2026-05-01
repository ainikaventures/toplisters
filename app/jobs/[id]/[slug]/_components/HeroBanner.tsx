import { InitialsAvatar, hashHue } from "@/app/jobs/_components/InitialsAvatar";

/**
 * Detail-page hero. 1000 × 350 max per the user's listing-vs-detail sizing
 * brief. Uses an aspect-ratio'd container so it scales cleanly on narrow
 * screens but never exceeds 350 px tall on desktop.
 *
 * Per the spec, the banner background should derive from the dominant
 * colour of the company logo (via node-vibrant). We don't have real logos
 * yet — Logo.dev will be wired in a later step — so for now we reuse the
 * deterministic hue picked by InitialsAvatar. Same input → same hue, so
 * the avatar inside the banner always feels matched to its background.
 */
export function HeroBanner({ companyName }: { companyName: string }) {
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
        <InitialsAvatar
          name={companyName}
          className="size-full max-h-[180px] max-w-[180px]"
        />
      </div>
    </div>
  );
}
