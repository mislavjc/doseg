import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://doseg.mislavjc.com", lastModified: new Date() },
    { url: "https://doseg.mislavjc.com/o-projektu", lastModified: new Date() },
    { url: "https://doseg.mislavjc.com/statistika", lastModified: new Date() },
  ]
}
