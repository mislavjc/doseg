import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    // /?lat= blocks map-share homepage variants (canonicalized to /, never meant
    // to rank) so Googlebot spends its crawl budget on real pages instead
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/?lat="] },
    sitemap: "https://doseg.hr/sitemap.xml",
  }
}
