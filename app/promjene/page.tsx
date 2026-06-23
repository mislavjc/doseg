import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { IconFlag1, IconCircleBanSign } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import { Breadcrumb } from "@/app/statistika/editorial/blocks"
import { Hero } from "@/app/statistika/editorial/hero"
import { Footer } from "@/app/statistika/editorial/footer"
import { Timeline } from "./timeline"
import {
  INK, MUTE, FAINT, OLD, BLUE, HAIR, KEPT, HEROS, MONO,
  type Stat, type Geom, type Data, type Candidates, type Cand,
  type MapEntryData, type FeaturedItem, type LineRowItem, type StopRowItem, type LineItem,
  type YearGroup, type TimelineModel,
  num, hrWord, entryId, isTram, autoHeadline, normCategory,
} from "./lib"

/**
 * /promjene — announcement-driven changelog of ZET network changes. ZET's
 * official notice is the source of truth (title, summary, source link, effective
 * date); GTFS only draws the before/after map. Entries are curated/verified in
 * data/promjene/entries.json; geometry comes from data/promjene/geom/. The page
 * is one reverse-chronological register: line changes (with a map when GTFS
 * supports one) read in full, stop relocations fold into a per-year ledger, and
 * a client Timeline adds search + line/stop filtering.
 */

const read = <T,>(p: string): T => JSON.parse(readFileSync(join(process.cwd(), "data", "promjene", p), "utf8"))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// ~ marker: the date is an approximate Wayback timestamp, not a body-read effective date.
const approx = (c: Cand) => !c.datePrecise && c.source === "wayback"

export const metadata: Metadata = {
  title: "Promjene i izmjene ZET-ovih linija: nove i preusmjerene | Doseg",
  description: "Kronologija promjena u mreži zagrebačkog ZET-a od 2017.: produljene i preusmjerene linije, nove i ukinute linije, izmještena stajališta, uz službene obavijesti i karte prije/poslije.",
  alternates: { canonical: "/promjene" },
}

/** Reads geometry + candidates + curated entries into one serializable model the
 * client Timeline can search and filter. Counts are derived from the rendered
 * set so the funnel sentence and year tallies always match the list. */
function buildModel(data: Data, cand: Candidates): TimelineModel {
  const index = read<Record<string, Record<string, Stat>>>("geom/index.json") // id → { line: stat }
  const geoms: Record<string, Geom> = {}
  for (const id in index) for (const line in index[id]) geoms[`${id}-${line}`] = read<Geom>(`geom/${id}-${line}.json`)
  const mapsFor = (id: string): MapEntryData[] =>
    Object.keys(index[id] ?? {}).map((line) => ({ line, geom: geoms[`${id}-${line}`], stat: index[id][line] })).filter((m) => m.geom)

  const entryById = new Map(data.entries.map((e) => [entryId(e), e]))
  const curated: FeaturedItem[] = data.entries.map((e) => {
    // geom is keyed by the ZET notice id; take it explicitly when given (some
    // source URLs point at an archived listing that doesn't carry the id).
    const id = entryId(e)
    const category = normCategory(e.kind)
    return { kind: "featured", id, date: e.date, approxDate: false, category, mode: e.mode, lines: e.lines, title: e.title, summary: e.summary, source: e.source, removed: category === "ukinuta", successor: e.successor, maps: mapsFor(id) }
  })
  const autoFeatured: FeaturedItem[] = cand.candidates
    .filter((c) => c.listWorthy && c.date && index[c.id] && !entryById.has(c.id))
    .map((c) => {
      // Eyebrow shows the line(s) we actually mapped (not every line in a multi-line
      // announcement). Title uses the body-grounded displayTitle (honest about partial /
      // re-established changes), falling back to the terse autoHeadline.
      const maps = mapsFor(c.id)
      const lines = maps.length ? maps.map((m) => m.line) : c.lines
      return {
        kind: "featured", id: c.id, date: c.date!, approxDate: approx(c), category: c.category,
        mode: lines.length === 1 ? (isTram(lines[0]) ? "Tramvaj" : "Autobus") : "Linije",
        lines, title: c.displayTitle ?? autoHeadline(lines, c.category),
        source: { publisher: "ZET", label: "Službena obavijest ZET-a", title: c.title, url: c.url },
        removed: c.category === "ukinuta", maps,
      }
    })
  const featured = [...curated, ...autoFeatured]
  const featuredIds = new Set(featured.map((f) => f.id))

  const rows = cand.candidates.filter((c) => c.listWorthy && c.date && !featuredIds.has(c.id))
  const lineRows: LineRowItem[] = rows.filter((c) => c.category !== "stajalište").map((c) => ({
    kind: "linerow", id: c.id, date: c.date!, approxDate: approx(c), category: c.category, lines: c.lines, title: c.displayTitle ?? c.title, url: c.url, removed: c.category === "ukinuta",
  }))
  const stopRows: StopRowItem[] = rows.filter((c) => c.category === "stajalište").map((c) => ({
    kind: "stoprow", id: c.id, date: c.date!, approxDate: approx(c), lines: c.lines, title: c.displayTitle ?? c.title, url: c.url,
  }))

  // Group line changes + stop relocations by year, newest first.
  const lineItems: LineItem[] = [...featured, ...lineRows]
  const byYear = new Map<string, { line: LineItem[]; stop: StopRowItem[] }>()
  const ensure = (y: string) => byYear.get(y) ?? byYear.set(y, { line: [], stop: [] }).get(y)!
  for (const it of lineItems) ensure(it.date.slice(0, 4)).line.push(it)
  for (const it of stopRows) ensure(it.date.slice(0, 4)).stop.push(it)

  const years: YearGroup[] = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, g]) => {
      g.line.sort((a, b) => b.date.localeCompare(a.date))
      g.stop.sort((a, b) => b.date.localeCompare(a.date))
      return { year, lineItems: g.line, stopItems: g.stop }
    })

  const total = featured.length + lineRows.length + stopRows.length
  const stop = stopRows.length
  // count CHANGES that have a map, not map files: 145/147 is one change with two maps.
  const maps = featured.filter((f) => f.maps.length).length
  return { years, counts: { total, line: total - stop, stop, maps } }
}

const lineSw = (color: string, dash?: string) => <svg width={30} height={10} aria-hidden><line x1={3} y1={5} x2={27} y2={5} stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={dash} /></svg>

const Strong = ({ children }: { children: React.ReactNode }) => <span style={{ color: INK, fontWeight: 500 }}>{children}</span>

export default function Page() {
  const data = read<Data>("entries.json")
  const cand = read<Candidates>("candidates.json")
  const model = buildModel(data, cand)
  const { total, line, stop, maps } = model.counts
  const updated = data.entries.reduce((m, e) => (e.date > m ? e.date : m), "")

  const dotSw = (fill: string, stroke: string) => <svg width={14} height={14} aria-hidden><circle cx={7} cy={7} r={fill === "#fff" ? 4 : 4.5} fill={fill} stroke={stroke} strokeWidth={fill === "#fff" ? 2 : 1.5} /></svg>
  const legendItems: [React.ReactNode, string][] = [
    [lineSw(BLUE), "trasa danas"], [lineSw(OLD, "0.1 5.2"), "prijašnja trasa"],
    [dotSw(BLUE, "#fff"), "novo stajalište"], [dotSw("#fff", OLD), "ukinuto stajalište"], [dotSw("#fff", KEPT), "stajalište na trasi"],
    [<IconFlag1 key="f" size={19} color={BLUE} />, "novi kraj linije"], [<IconCircleBanSign key="x" size={19} color={OLD} />, "ukinuti kraj linije"],
  ]

  // Rendered by <Timeline> right above the first before/after map (not parked at
  // the top, screens away from any map).
  const legend = (
    <div style={{ width: "100%", maxWidth: 556, marginTop: 4, border: `1px solid ${HAIR}`, boxSizing: "border-box", padding: "15px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>kako čitati kartu</span>
      <div className="pr-legend-grid" style={{ display: "grid", gridTemplateColumns: "max-content max-content", justifyContent: "start", columnGap: 40, rowGap: 11 }}>
        {legendItems.map(([icon, label], i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", width: 26, justifyContent: "center", alignItems: "center" }}>{icon}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: INK }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        html,body{overflow-x:clip;max-width:100%}
        .diffmap .maplibregl-ctrl-group{border-radius:0;box-shadow:0 1px 3px rgba(15,23,42,.16)}
        .diffmap .maplibregl-ctrl-group button{border-radius:0;width:30px;height:30px}
        .diffmap .maplibregl-ctrl-group button+button{border-top:1px solid #E5E8EC}
        .diffmap .maplibregl-ctrl-attrib{font-family:'Geist Mono',ui-monospace,monospace;font-size:10px;background:rgba(255,255,255,.66)}
        .diffmap .maplibregl-ctrl-attrib.maplibregl-compact,.diffmap .maplibregl-ctrl-attrib-button{border-radius:0}
        .diffmap .maplibregl-cooperative-gesture-screen{font-family:'Geist Mono',ui-monospace,monospace}
        .pr-search:focus-within{border-color:#0E51C9;box-shadow:inset 0 0 0 1px #0E51C9}
        @media (max-width:640px){.pr-intro{padding-top:30px !important}}
        @media (max-width:520px){
          .pr-row{flex-direction:column !important;gap:5px !important}
          .pr-meta{gap:12px !important}
          .pr-finder-row{flex-direction:column !important;align-items:flex-start !important;gap:9px !important}
          .pr-seg{padding-top:11px !important;padding-bottom:9px !important}
          .pr-legend-grid{grid-template-columns:1fr !important;row-gap:10px !important}
        }
      ` }} />

      <Hero active="promjene" mapPosition="center 40%" />

      <main id="main-content" tabIndex={-1} style={{ background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 88, paddingInline: 16, boxSizing: "border-box", overflowX: "hidden", maxWidth: "100vw" }}>
        <div className="pr-intro" style={{ width: "100%", maxWidth: 556, display: "flex", flexDirection: "column", gap: 16, paddingTop: 64 }}>
          <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "promjene" }]} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE }}>promjene u mreži</span>
          <h1 style={{ margin: 0, fontFamily: HEROS, fontWeight: 700, fontSize: 16, lineHeight: "22px", color: INK }}>Što se promijenilo u ZET-u.</h1>
          <p style={{ margin: 0, fontFamily: HEROS, fontSize: 16, lineHeight: "24px", color: MUTE, maxWidth: 560 }}>
            Od 2017. bilježimo trajne promjene u ZET-ovoj mreži, njih <Strong>{num(total)}</Strong>: <Strong>{num(line)}</Strong> na linijama, <Strong>{num(stop)}</Strong> na stajalištima. <Strong>{cap(hrWord(maps))}</Strong> ih ima kartu prije i poslije, a svaki opis vodi na službenu obavijest ZET-a.
          </p>
        </div>

        <Timeline model={model} legend={legend} />

        <div style={{ width: "100%", maxWidth: 556, paddingTop: 72 }}>
          <div style={{ height: 1, background: HAIR }} />
          <span style={{ display: "block", paddingTop: 16, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: FAINT }}>
            Popis čine trajne izmjene mreže iz ZET-ovih službenih obavijesti (privremene obilaznice zbog radova i događanja izostavljene). Datumi označeni s ~ približni su, prema prvom arhiviranom zapisu obavijesti, i ne moraju biti točan dan stupanja na snagu. Istaknute promjene imaju kartu prije i poslije iscrtanu iz arhiviranih ZET-ovih GTFS voznih redova oko datuma svake promjene.
          </span>
        </div>
      </main>

      <Footer updated={updated} />
    </>
  )
}
