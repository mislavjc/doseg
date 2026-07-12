import type { Metadata } from "next"

/**
 * Shared OpenGraph/canonical shape for the pSEO families (linije, stanice,
 * kvartovi). Titles/descriptions stay in each page (keyword strategy is
 * per-family); this owns the structure so site-wide metadata changes are one
 * edit. The og image `v` param (where used) busts X/Telegram per-URL caches
 * when the feed rolls.
 */
export function pseoMetadata(opts: {
  title: string
  description: string
  path: string // e.g. `/linije/1`
  ogType: "article" | "website"
  ogImage: string // full path incl. any `v` cache-buster
}): Metadata {
  const { title, description, path, ogType, ogImage } = opts
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: ogType,
      url: path,
      siteName: "Doseg",
      locale: "hr_HR",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
  }
}
