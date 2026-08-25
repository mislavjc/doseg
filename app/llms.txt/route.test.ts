import { describe, expect, it } from "vitest"

import { GET } from "./route"

/**
 * Integration cover: the route reads the committed data indexes, so this also
 * catches the counts in /llms.txt drifting away from what the site publishes.
 */
describe("GET /llms.txt", () => {
  it("serves markdown as browser-readable text/plain", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600")
  })

  it("reports the counts the committed indexes actually hold", async () => {
    const [{ loadLineIndex }, { loadStopIndex }, { loadKvartIndex }] =
      await Promise.all([
        import("@/lib/line-data"),
        import("@/lib/stop-data"),
        import("@/lib/kvart-data"),
      ])
    const lines = loadLineIndex().lines.length
    const stops = loadStopIndex().stops.length
    const kvartovi = loadKvartIndex().length

    const body = await (await GET()).text()
    expect(body).toContain(
      `${lines.toLocaleString("en-US")} lines, ${stops.toLocaleString("en-US")} stops, ${kvartovi} kvartovi`
    )
  })

  it("starts with the H1 the spec requires", async () => {
    const body = await (await GET()).text()
    expect(body.startsWith("# Doseg\n")).toBe(true)
  })
})
