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

/**
 * ItemList of a line's stops in travel order, so Google can model the ordered
 * stop sequence behind "{mode} {N} stanice / vozni red" queries (the line pages
 * otherwise emit only FAQ + breadcrumb, leaving the route entity undescribed).
 * Each stop links to its /stanice page when the name resolves to one — duplicate
 * names that don't resolve are still listed by name so the sequence stays whole.
 */
export function lineStopsJsonLd(
  broj: string,
  stops: { name: string }[],
  slugs: Record<string, string>
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Stanice linije ${broj}`,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: stops.length,
    itemListElement: stops.map((s, i) => {
      const slug = slugs[s.name]
      return {
        "@type": "ListItem",
        position: i + 1,
        name: s.name,
        ...(slug ? { item: `${SITE}/stanice/${slug}` } : {}),
      }
    }),
  }
}
