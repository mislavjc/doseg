export const SITE_DOMAIN = "doseg.hr"

/**
 * 1x1 transparent GIF. Used as the `<img>` fallback inside an art-directed
 * `<picture>` so a hidden hero variant (the desktop crop on a phone, or vice
 * versa) loads no real PNG off-viewport — CSS `display:none` alone does not stop
 * the fetch, which made every pSEO page download both the landscape and portrait
 * hero.
 */
export const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
