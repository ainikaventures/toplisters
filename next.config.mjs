/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output so the Docker production image only ships the
  // server bundle Next traced as needed — much smaller than copying
  // node_modules wholesale. Image dropped from ~1.4 GB to ~250 MB in
  // testing.
  output: "standalone",
  // The Prisma 7 generator emits client artefacts under /lib/generated/
  // — Next's tracer doesn't pick these up automatically, so we tell the
  // standalone build to include them. (In Next 15+ this graduated to a
  // top-level option; on Next 14 it lives under experimental.)
  experimental: {
    outputFileTracingIncludes: {
      "/**/*": ["./lib/generated/**/*"],
    },
  },
  // Type + lint errors now fail the build. The temporary 2026-05-09
  // ignore flags were removed during the Coolify migration once
  // `npx tsc --noEmit` and `npx next lint` both passed clean.
};

export default nextConfig;
