import { describe, expect, it } from "vitest"

import { buildLlmsTxt, ORIGIN, type LlmsTxtData } from "./llms-txt"

const DATA: LlmsTxtData = {
  lineCount: 154,
  stopCount: 1220,
  kvartCount: 17,
  generatedAt: "2026-07-13T00:00:00.000Z",
}

const txt = buildLlmsTxt(DATA)
const lines = txt.split("\n")

/** The body of every `## Section`, keyed by heading text. */
function sections(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let current: string | null = null
  for (const line of md.split("\n")) {
    const h2 = /^## (.+)$/.exec(line)
    if (h2) {
      current = h2[1]
      out.set(current, [])
    } else if (current) {
      out.get(current)!.push(line)
    }
  }
  return out
}

describe("buildLlmsTxt — llmstxt.org structure", () => {
  it("opens with a single H1 title", () => {
    expect(lines[0]).toBe("# Doseg")
    expect(lines.filter((l) => l.startsWith("# "))).toHaveLength(1)
  })

  it("follows the title with a blockquote summary", () => {
    const summary = lines.slice(1).find((l) => l.trim() !== "")
    expect(summary?.startsWith("> ")).toBe(true)
  })

  it("keeps the prose block free of headings, as the spec requires", () => {
    const firstH2 = lines.findIndex((l) => l.startsWith("## "))
    expect(firstH2).toBeGreaterThan(0)
    const prose = lines.slice(1, firstH2)
    expect(prose.filter((l) => /^#{1,6} /.test(l))).toEqual([])
  })

  it("fills every H2 section with markdown link list items only", () => {
    const bodies = sections(txt)
    expect(bodies.size).toBeGreaterThan(0)
    for (const [heading, body] of bodies) {
      const content = body.filter((l) => l.trim() !== "")
      expect(content.length, `${heading} is empty`).toBeGreaterThan(0)
      for (const line of content) {
        expect(line, `${heading}: "${line}"`).toMatch(/^- \[[^\]]+\]\([^)]+\)/)
      }
    }
  })

  it("reserves ## Optional for skippable links and puts it last", () => {
    const headings = [...sections(txt).keys()]
    expect(headings).toContain("Optional")
    expect(headings.at(-1)).toBe("Optional")
  })

  it("makes every link absolute on the canonical origin", () => {
    const urls = [...txt.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(5)
    for (const url of urls) expect(url.startsWith(`${ORIGIN}`)).toBe(true)
  })
})

describe("buildLlmsTxt — content", () => {
  it("carries when-to-use guidance before the link sections", () => {
    const firstH2 = lines.findIndex((l) => l.startsWith("## "))
    const prose = lines.slice(0, firstH2).join("\n")
    expect(prose).toMatch(/Reach for doseg\.hr when/)
    expect(prose).toMatch(/not the right source for/)
  })

  it("names the route patterns an agent needs to construct a URL", () => {
    expect(txt).toContain("/linije/{broj}")
    expect(txt).toContain("/stanice/{slug}")
    expect(txt).toContain("/kvartovi/{slug}")
  })

  it("reports the published counts with thousands separators", () => {
    expect(txt).toContain("154 lines, 1,220 stops, 17 kvartovi")
  })

  it("derives the neighbour count from kvartCount", () => {
    expect(txt).toContain("ranks against the other 16")
    expect(buildLlmsTxt({ ...DATA, kvartCount: 5 })).toContain(
      "ranks against the other 4"
    )
  })

  it("states the feed date as an ISO calendar date", () => {
    expect(txt).toContain("GTFS feed dated 2026-07-13")
  })

  it("degrades to 'unknown' rather than 'Invalid Date' on a bad timestamp", () => {
    expect(buildLlmsTxt({ ...DATA, generatedAt: "not-a-date" })).toContain(
      "GTFS feed dated unknown"
    )
  })

  it("attributes the upstream data licences", () => {
    expect(txt).toContain("Otvorena dozvola")
    expect(txt).toContain("ODbL")
  })

  it("uses kvart, never cetvrt, for a city district", () => {
    expect(txt).toMatch(/kvart/)
    expect(txt.toLowerCase()).not.toMatch(/[cč]etvrt/)
  })

  it("contains no em-dashes", () => {
    expect(txt).not.toContain("—")
  })
})
