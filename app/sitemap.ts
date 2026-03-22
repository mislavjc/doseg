import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://doseg.hr", lastModified: new Date() },
    { url: "https://doseg.hr/o-projektu", lastModified: new Date() },
    { url: "https://doseg.hr/statistika", lastModified: new Date() },
  ]
}
