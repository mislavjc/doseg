import { buildLlmsTxt } from "@/lib/llms-txt"
import { loadKvartIndex } from "@/lib/kvart-data"
import { loadLineIndex } from "@/lib/line-data"
import { loadStopIndex } from "@/lib/stop-data"

/**
 * /llms.txt (https://llmstxt.org/). Counts and the feed date come from the same
 * committed indexes the sitemap and the pages themselves read, so the file
 * cannot drift from what the site actually publishes on a feed roll.
 *
 * Served as text/plain so it renders in a browser instead of downloading;
 * the body is markdown either way, which is what the spec asks for.
 *
 * Left dynamic rather than force-static: docker-compose mounts ./data over the
 * image's baked copy, so a build-time snapshot could disagree with the counts
 * /api/open-data is serving from the same directory. One render an hour is
 * cheaper than that inconsistency.
 */
export async function GET() {
  const lines = loadLineIndex()
  const stops = loadStopIndex()
  const kvartovi = loadKvartIndex()

  const body = buildLlmsTxt({
    lineCount: lines.lines.length,
    stopCount: stops.stops.length,
    kvartCount: kvartovi.length,
    generatedAt: lines.generatedAt,
  })

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
