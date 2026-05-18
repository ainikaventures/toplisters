/**
 * Root-layout schema. Combines WebSite + Organization in one @graph so
 * Google can attribute both to the same canonical entity. Rendered once
 * in app/layout.tsx so every page carries the site-level entity data.
 *
 * - WebSite.potentialAction declares the sitelinks search box (Google
 *   may render a search input directly under the toplisters.xyz result
 *   in SERPs that points at our /jobs?q= search).
 * - Organization is the publisher entity that JobPosting.hiringOrganization
 *   would have NOT referenced — that's the employer, this is us.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function SiteJsonLd() {
  const json = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "Toplisters",
        description:
          "Globally-aware job board with an interactive 3D globe — blue-collar to white-collar.",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/jobs?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        url: SITE_URL,
        name: "Toplisters",
        description:
          "Globally-aware job board with an interactive 3D globe.",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
