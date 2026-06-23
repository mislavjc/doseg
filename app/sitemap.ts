import type { MetadataRoute } from "next"

import { loadKvartIndex } from "@/lib/kvart-data"
import { loadLineIndex } from "@/lib/line-data"
import { loadStopIndex } from "@/lib/stop-data"

/**
 * Stops are pSEO at scale (~1230 pages); the long tail of single-line stops is
 * thin. Gate the sitemap to real interchanges (≥ this many lines) while the line
 * pages are still indexing, then widen once they do.
 */
const STOP_MIN_LINES = 3

export default function sitemap(): MetadataRoute.Sitemap {
  const lines = loadLineIndex()
  const kvartovi = loadKvartIndex()
  const stops = loadStopIndex()
  const linesUpdated = new Date(lines.generatedAt)
  const stopsUpdated = new Date(stops.generatedAt)
  return [
    // Honest, stable lastModified (the GTFS feed roll) instead of new Date() on
    // every build — blanket "modified today" reads as freshness spam on a
    // low-trust domain and wastes crawl budget on unchanged pages.
    { url: "https://doseg.hr", lastModified: linesUpdated },
    { url: "https://doseg.hr/o-projektu", lastModified: linesUpdated },
    { url: "https://doseg.hr/statistika", lastModified: linesUpdated },
    { url: "https://doseg.hr/statistika/podaci", lastModified: linesUpdated },
    { url: "https://doseg.hr/promjene", lastModified: linesUpdated },
    { url: "https://doseg.hr/linije", lastModified: linesUpdated },
    { url: "https://doseg.hr/kvartovi", lastModified: linesUpdated },
    { url: "https://doseg.hr/stanice", lastModified: stopsUpdated },
    ...lines.lines.map((l) => ({
      url: `https://doseg.hr/linije/${l.broj}`,
      lastModified: linesUpdated,
    })),
    ...kvartovi.map((k) => ({
      url: `https://doseg.hr/kvartovi/${k.slug}`,
      lastModified: linesUpdated,
    })),
    ...stops.stops
      .filter((s) => s.lineCount >= STOP_MIN_LINES)
      .map((s) => ({
        url: `https://doseg.hr/stanice/${s.slug}`,
        lastModified: stopsUpdated,
      })),
  ]
}
