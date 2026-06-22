/**
 * Structured-data helpers shared by every pSEO page.
 *
 * JsonLd is the ONLY place a JSON-LD <script> should be emitted: JSON.stringify
 * doesn't escape "<", so a value containing "</script>" could break out of the
 * tag. Route all structured data through it.
 */

const SITE = "https://doseg.hr"

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  )
}

/**
 * BreadcrumbList from a trail of crumbs (the Doseg root is prepended). `path` is
 * the site-relative path, e.g. "/linije" or `/kvartovi/${slug}`. Mirrors the
 * visual <Breadcrumb> so Google can render the trail instead of the bare URL.
 */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Doseg", path: "" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.path}`,
    })),
  }
}
