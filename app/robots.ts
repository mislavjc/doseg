import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    // /karta?lat= blocks map-share variants (canonicalized to /karta, never
    // meant to rank) so Googlebot spends its crawl budget on real pages
    // instead; /?lat= covers legacy shares until the 301 propagates.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/?lat=", "/karta?lat="],
    },
    sitemap: "https://doseg.hr/sitemap.xml",
  }
}
