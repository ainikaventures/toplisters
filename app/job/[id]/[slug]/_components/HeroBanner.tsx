import { InitialsAvatar, hashHue } from "@/app/jobs/_components/InitialsAvatar";
import { bannerExists, bannerPath, generateBanner } from "@/lib/banners/generate";

/**
 * Detail-page hero. 1000 × 350 max.
 *
 * When the job has a resolved logo URL: serves a pre-rendered JPG from
 * /public/banners/<hash>.jpg with the brand's dominant colour extracted
 * via node-vibrant + the logo composited via sharp. First visit to a
 * never-seen brand triggers a fire-and-forget generation in the
 * background — the user sees the gradient fallback that round-trip,
 * subsequent visits hit the cached image. The banner is keyed on the
 * company name (lowercased) so all jobs from the same brand share one
 * file.
 *
 * When the job has no logo: falls back to the deterministic hue gradient
 * + InitialsAvatar. Same UX as before this commit.
 *
 * Async server component — fs.access runs on the server only.
 */
export async function HeroBanner({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  let cachedBanner: string | null = null;
  if (logoUrl && (await bannerExists(companyName))) {
    cachedBanner = bannerPath(companyName).publicPath;
  } else if (logoUrl) {
    // Fire-and-forget. Errors are swallowed inside generateBanner so this
    // can't crash the request; the user just sees the fallback this time.
    void generateBanner(companyName, logoUrl).catch(() => null);
  }

  if (cachedBanner) {
    return (
      <div className="relative w-full max-w-[1000px] overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cachedBanner}
          alt={`${companyName} brand banner`}
          className="w-full"
          width={1000}
          height={350}
        />
      </div>
    );
  }

  // Fallback: hue gradient + logo (real or initials).
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
