import type { MetadataRoute } from "next"

import { loadLineIndex } from "@/lib/line-data"

export default function sitemap(): MetadataRoute.Sitemap {
  const lines = loadLineIndex()
  const updated = new Date(lines.generatedAt)
  return [
    { url: "https://doseg.hr", lastModified: new Date() },
    { url: "https://doseg.hr/o-projektu", lastModified: new Date() },
    { url: "https://doseg.hr/statistika", lastModified: new Date() },
    { url: "https://doseg.hr/statistika/podaci", lastModified: new Date() },
    { url: "https://doseg.hr/promjene", lastModified: new Date() },
    { url: "https://doseg.hr/linije", lastModified: updated },
    ...lines.lines.map((l) => ({
      url: `https://doseg.hr/linije/${l.broj}`,
      lastModified: updated,
    })),
  ]
}
