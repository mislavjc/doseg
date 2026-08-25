/**
 * Builds /llms.txt — the llmstxt.org file that tells an agent what doseg.hr
 * covers and which page answers which kind of question.
 *
 * The format is fixed by https://llmstxt.org/: an H1 title, an optional
 * blockquote summary, then free-form markdown "of any type except headings",
 * then H2 sections whose bodies are lists of links. The when-to-use guidance
 * therefore lives in that heading-free prose block rather than under an H2 of
 * its own — an `## When to use` heading would read as a (malformed) link
 * section to a strict parser.
 *
 * `## Optional` is reserved by the spec for links a short-context reader may
 * skip, so nothing load-bearing goes in it.
 */

export const ORIGIN = "https://doseg.hr"

export interface LlmsTxtData {
  lineCount: number
  stopCount: number
  kvartCount: number
  /** ISO timestamp of the GTFS feed the line and stop pages were built from. */
  generatedAt: string
}

/** Thousands separators, so "1220" reads as 1,220 to the model. */
function count(n: number): string {
  return n.toLocaleString("en-US")
}

/** ISO calendar date (YYYY-MM-DD) — unambiguous regardless of the reader's locale. */
function isoDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 10)
}

export function buildLlmsTxt(data: LlmsTxtData): string {
  const { lineCount, stopCount, kvartCount } = data
  const feed = isoDate(data.generatedAt)

  return `# Doseg

> Doseg measures how far you can actually get by public transport in Zagreb, Croatia. It turns the ZET timetable (GTFS), real-time delays and a pedestrian network into travel-time isochrones, and publishes the result as reference pages for every tram and bus line, every stop, and every kvart (city district).

Doseg is a Croatian-language site: page content, headings and place names are in Croatian. This file is in English so an agent can route to the right page. A Zagreb city district is called a kvart throughout, in both URLs and copy.

Reach for doseg.hr when a question is about public transport in Zagreb and wants a specific, sourced answer:

- Which lines serve a given stop, its departure window and peak headway: \`/stanice/{slug}\`, e.g. \`${ORIGIN}/stanice/kvaternikov-trg\`
- Where a tram or bus line runs, its terminals and full stop sequence: \`/linije/{broj}\`, e.g. \`${ORIGIN}/linije/6\`
- How well connected a Zagreb neighbourhood is and how it ranks against the other ${kvartCount - 1}: \`/kvartovi/{slug}\`, e.g. \`${ORIGIN}/kvartovi/tresnjevka-sjever\`
- How far someone can travel from a point within a time budget, as a map: \`/karta\`
- City-wide accessibility statistics, the gap between central and peripheral districts, punctuality: \`/statistika\`
- Current and upcoming ZET service changes, diversions and closures: \`/promjene\`
- Public bike-share (Bajs) station occupancy and ride volumes: \`/bajs\`

Doseg is not the right source for: live vehicle positions or turn-by-turn trip planning, ticket prices and fares, intercity or regional travel beyond the Zagreb network, or any city other than Zagreb.

Coverage as published: ${count(lineCount)} lines, ${count(stopCount)} stops, ${kvartCount} kvartovi. Line and stop pages are built from the ZET GTFS feed dated ${feed}; district statistics are rebuilt on a slower cycle and each page states its own date. Sources are ZET GTFS (Otvorena dozvola / Open Licence, Republic of Croatia), OpenStreetMap (ODbL) and DZS census data; the analysis on top of them is Doseg's.

## Start here

- [Doseg](${ORIGIN}): homepage. A search box over every stop, line, kvart and Zagreb street address, the fastest way to turn a name into the right page.
- [Karta dosega](${ORIGIN}/karta): interactive isochrone map. Pick an origin and a time budget, see the reachable area drawn on the map.
- [O projektu](${ORIGIN}/o-projektu): how the isochrones are computed, which data feeds them, and who maintains the site.

## Lines

- [Linije](${ORIGIN}/linije): index of all ${count(lineCount)} ZET tram and bus lines, day and night. Per-line pages live at \`/linije/{broj}\` and carry terminals, the stop sequence in both directions, service window and peak headway.

## Stops

- [Stanice](${ORIGIN}/stanice): A-Z directory of all ${count(stopCount)} stops. Per-stop pages live at \`/stanice/{slug}\` and list every line serving the stop, first and last departure, and nearby stops.

## Districts

- [Kvartovi](${ORIGIN}/kvartovi): all ${kvartCount} Zagreb districts ranked by transport access. Per-district scorecards live at \`/kvartovi/{slug}\` and compare reachable area, stop density and walking distance against the city average.

## Statistics and open data

- [Statistika](${ORIGIN}/statistika): the city-wide analysis. How much of Zagreb each district can reach, how that changes in the evening, and how unequally access is distributed.
- [Podaci](${ORIGIN}/statistika/podaci): the per-district numbers behind the analysis, with methodology and sources.
- [District scores (JSON)](${ORIGIN}/api/open-data): machine-readable download of the per-district accessibility scores.

## Service changes

- [Promjene](${ORIGIN}/promjene): dated timeline of ZET announcements. Diversions, closures and timetable changes, each illustrated against the network.

## Optional

- [Karta tramvajske mreze](${ORIGIN}/karta-tramvaja): schematic map of the tram network.
- [Bajs](${ORIGIN}/bajs): public bike-share station occupancy and measured ride volumes.
- [Sitemap](${ORIGIN}/sitemap.xml): every indexable URL on the site.
`
}
