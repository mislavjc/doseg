"use client"

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { IconCircleBanSign } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import {
  INK, MUTE, FAINT, OLD, BLUE, HAIR, DOT, HEROS, MONO,
  type Stat, type Geom, type Source, type Successor,
  type FeaturedItem, type LineRowItem, type StopRowItem,
  type LineItem, type TimelineModel,
  num, dateLabel, monthLabel, expandStop, TAG, TALLY, norm,
} from "./lib"

// Code-split maplibre-gl out of the initial /promjene bundle; the diff map sits
// below the fold and LazyDiffMap still defers WebGL init until it scrolls in.
const LazyDiffMap = dynamic(
  () => import("./diff-map").then((m) => m.LazyDiffMap),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: "100%", height: "clamp(360px, 44vw, 580px)" }} />
    ),
  }
)

/** Top-right "open in new tab" glyph, reused by every external link. */
const ARROW = (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Tells screen readers the link opens a new tab (the arrow glyph is aria-hidden). */
const NewTab = () => <span className="sr-only"> (otvara se u novoj kartici)</span>

/** "·" group separator, dark enough to actually be perceivable (DOT is ~1.4:1). */
const Sep = () => <span style={{ fontFamily: MONO, fontSize: 12, color: "#9AA1A9" }}>·</span>

// Shared scaffolding for the compact NoticeRow / ObituaryRow (StopRow differs).
const ROW_BASE: CSSProperties = { width: "100%", maxWidth: 556, boxSizing: "border-box", display: "flex", gap: 16, alignItems: "baseline", paddingBlock: 14, borderTop: `1px solid ${HAIR}` }
const ROW_META: CSSProperties = { flexShrink: 0, display: "flex", gap: 16, alignItems: "baseline" }

function SourceLink({ source }: { source: Source }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, width: "fit-content", fontFamily: MONO, fontSize: 12, color: BLUE, textDecoration: "none" }}>
      {source.label}
      {ARROW}
      <NewTab />
    </a>
  )
}

/** "funkciju preuzela linija 143 ↗" — points at the line that absorbed a retired
 * route (internal /linije page unless a source url is given). */
function SuccessorNote({ successor }: { successor: Successor }) {
  const href = successor.url ?? `/linije/${successor.line}`
  const inner = (
    <>
      linija {successor.line}
      <span style={{ display: "inline-flex" }}>{ARROW}</span>
    </>
  )
  const linkStyle = { display: "inline-flex", alignItems: "center", gap: 5, color: BLUE, textDecoration: "none", fontWeight: 500 } as const
  return (
    <span style={{ fontFamily: HEROS, fontSize: 16, lineHeight: "22px", color: MUTE }}>
      funkciju preuzela{" "}
      {successor.url
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{inner}<NewTab /></a>
        : <Link href={href} style={linkStyle}>{inner}</Link>}
    </span>
  )
}

function LineChips({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  const shown = lines.slice(0, 6)
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, verticalAlign: "middle" }}>
      {shown.map((l) => (
        <span key={l} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: INK, border: `1px solid ${HAIR}`, padding: "0 5px" }}>{l}</span>
      ))}
      {lines.length > shown.length && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: FAINT }}>+{lines.length - shown.length}</span>}
    </span>
  )
}

/** "Borongaj – Borongaj" (loop) reads as a no-op; collapse it to "kružna · X". */
function relacijaLabel(r: string): string {
  const parts = r.split(" – ")
  return parts[0] && parts[0] === parts[1] ? `kružna · ${expandStop(parts[0])}` : parts.map(expandStop).join(" – ")
}

function StatRows({ stat, approx }: { stat: Stat; approx?: boolean }) {
  const rows: [string, string, string][] =
    stat.mode === "diff"
      ? [["duljina trase", `${num(stat.len_old_km)} →`, `${num(stat.len_new_km)} km`], ["stajališta (dodano / ukinuto)", "", `+${stat.added} / ${stat.removed}`],
        stat.change === "midroute" ? ["relacija", "", relacijaLabel(stat.relacija)] : ["promijenjeni kraj", `${expandStop(stat.oldTipName)} →`, expandStop(stat.newTipName)]]
      : stat.mode === "removed"
        ? [["bila duljina", "", `${num(stat.len_km)} km`], ["broj stajališta", "", `${stat.stops_count}`], ["posljednje stajalište", "", expandStop(stat.terminusName)]]
        : [["duljina trase", "", `${num(stat.len_km)} km`], ["broj stajališta", "", `${stat.stops_count}`], ["kraj linije", "", expandStop(stat.terminusName)]]
  // straight-line lengths from a stop-connected route under-read the real road
  // distance, so mark the length as an estimate rather than stating it as fact.
  if (approx) rows[0][0] += " (procjena)"
  return (
    <div style={{ width: "100%", maxWidth: 556, display: "flex", flexDirection: "column", paddingTop: 24 }}>
      {rows.map(([label, a, b], i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBlock: 9 }}>
          <span style={{ flexShrink: 0, fontFamily: HEROS, fontSize: 16, lineHeight: "22px", color: MUTE }}>{label}</span>
          <div style={{ flexGrow: 1, height: 13, borderBottom: `1px dotted ${DOT}` }} />
          <span style={{ flexShrink: 1, minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere", fontFamily: MONO, fontSize: 16, lineHeight: "22px", color: INK, textAlign: "right" }}><span style={{ color: FAINT }}>{a}</span> {b}</span>
        </div>
      ))}
    </div>
  )
}

function LineMap({ geom, stat, label, title }: { geom: Geom; stat: Stat; label?: string; title?: string }) {
  const aria = `Karta prije i poslije${title ? `: ${title}` : ""}${geom.stopConnected ? " Shematski prikaz, trasa spojena kroz stajališta." : ""}`
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {label && (
        <div style={{ width: "100%", maxWidth: 556, paddingTop: 30 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: stat.mode === "removed" ? OLD : BLUE }}>{label}</span>
        </div>
      )}
      <div style={{ width: "100%", maxWidth: 1240, marginTop: label ? 12 : 26, overflow: "hidden" }}>
        <LazyDiffMap oldShape={geom.old.shape} newShape={geom.new.shape} shared={geom.shared} newTip={geom.newTip} oldTip={geom.oldTip} allStops={geom.newStops} added={geom.addedStops} removed={geom.removedStops} mode={geom.mode} change={geom.change} stopConnected={geom.stopConnected} label={aria} />
      </div>
      {geom.stopConnected && (
        <div style={{ width: "100%", maxWidth: 556, paddingTop: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>trasa spojena kroz stajališta · približan prikaz, ne i stvarna trasa</span>
        </div>
      )}
      <StatRows stat={stat} approx={geom.stopConnected} />
    </div>
  )
}

/** Featured change with at least one before/after map. Discontinued lines get the
 * obituary recolor (slate eyebrow + ban glyph) and a successor cross-link. */
function FeaturedCard({ f, legend }: { f: FeaturedItem; legend?: ReactNode }) {
  const { removed } = f
  return (
    <section style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", paddingTop: 72 }}>
      <div style={{ width: "100%", maxWidth: 556, display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: removed ? OLD : BLUE }}>{dateLabel(f.date, f.approxDate)} · {f.mode.toLowerCase()} {f.lines.join(", ")}</span>
        <h3 style={{ margin: 0, display: "flex", gap: 8, alignItems: "baseline", fontFamily: HEROS, fontWeight: 700, fontSize: 16, lineHeight: "22px", color: removed ? OLD : INK }}>
          {removed && <IconCircleBanSign size={18} color={OLD} style={{ flexShrink: 0, position: "relative", top: 3 }} />}
          <a href={f.source.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{f.title}<NewTab /></a>
        </h3>
        {f.summary && <span style={{ fontFamily: HEROS, fontSize: 16, lineHeight: "24px", color: MUTE, maxWidth: 560 }}>{f.summary}</span>}
        {f.successor && <SuccessorNote successor={f.successor} />}
        <SourceLink source={f.source} />
      </div>
      {/* legend is a JSX element created in the Page server component and passed in;
          give its render position a key so it doesn't trip React's list key warning. */}
      {legend != null && <Fragment key="legend">{legend}</Fragment>}
      {/* Label each map with its line when the announcement spans multiple lines,
          even if only one has a map (e.g. 284 mapped, 277 gated as unreliable). */}
      {f.maps.map((m) => (
        <LineMap key={m.line} geom={m.geom} stat={m.stat} label={f.lines.length > 1 ? `linija ${m.line}` : undefined} title={f.title} />
      ))}
    </section>
  )
}

/** Compact timeline row for a line change with no map (announcement only). */
function NoticeRow({ it }: { it: LineRowItem }) {
  const [tag, color] = TAG[it.category] ?? TAG.ostalo
  return (
    <a href={it.url} target="_blank" rel="noopener noreferrer" className="pr-row" style={{ ...ROW_BASE, textDecoration: "none" }}>
      <span className="pr-meta" style={ROW_META}>
        <span style={{ flexShrink: 0, width: 96, fontFamily: MONO, fontSize: 12, lineHeight: "20px", color: FAINT }}>{dateLabel(it.date, it.approxDate)}</span>
        <span style={{ flexShrink: 0, width: 104, fontFamily: MONO, fontSize: 12, lineHeight: "20px", color }}>{tag}</span>
      </span>
      <span className="pr-body" style={{ flexGrow: 1, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: HEROS, fontSize: 16, lineHeight: "20px", color: INK }}>{it.title}</span>
        <LineChips lines={it.lines} />
      </span>
      <NewTab />
    </a>
  )
}

/** Obituary row for a discontinued line with no map: slate, ban glyph, and the
 * successor that took over its run. Not a single <a> (it nests a successor link). */
function ObituaryRow({ it }: { it: LineRowItem }) {
  return (
    <div className="pr-row" style={ROW_BASE}>
      <span className="pr-meta" style={ROW_META}>
        <span style={{ flexShrink: 0, width: 96, fontFamily: MONO, fontSize: 12, lineHeight: "20px", color: OLD }}>{dateLabel(it.date, it.approxDate)}</span>
        <span style={{ flexShrink: 0, width: 104, display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 12, lineHeight: "20px", color: OLD }}>
          <IconCircleBanSign size={13} color={OLD} style={{ flexShrink: 0 }} />ukinuta
        </span>
      </span>
      <span className="pr-body" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
          <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: HEROS, fontSize: 16, lineHeight: "20px", color: OLD, textDecoration: "none" }}>{it.title}<NewTab /></a>
          <LineChips lines={it.lines} />
        </span>
      </span>
    </div>
  )
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden style={{ transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", flexShrink: 0 }}>
    <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** A single relocated-stop line inside the expanded ledger. */
function StopRow({ it }: { it: StopRowItem }) {
  return (
    <a href={it.url} target="_blank" rel="noopener noreferrer" className="pr-row" style={{ width: "100%", boxSizing: "border-box", display: "flex", gap: 12, alignItems: "baseline", paddingBlock: 9, borderTop: `1px solid ${HAIR}`, textDecoration: "none" }}>
      <span className="pr-meta" style={{ flexShrink: 0, width: 84, fontFamily: MONO, fontSize: 12, lineHeight: "20px", color: FAINT }}>{dateLabel(it.date, it.approxDate)}</span>
      <span className="pr-body" style={{ flexGrow: 1, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: HEROS, fontSize: 16, lineHeight: "20px", color: INK }}>{it.title}</span>
        <LineChips lines={it.lines} />
      </span>
      <NewTab />
    </a>
  )
}

/** Stop relocations are the bulk of the register (≈109) but the least visual.
 * Collapse a whole year of them into one ledger line that expands into month
 * sub-groups. Forced open when the finder is searching or filtered to stops. */
function StopLedger({ items, forceOpen }: { items: StopRowItem[]; forceOpen: boolean }) {
  const [open, setOpen] = useState(false)
  const show = forceOpen || open
  const months = useMemo(() => {
    const by = new Map<string, StopRowItem[]>()
    for (const it of items) {
      const ym = it.date.slice(0, 7)
      ;(by.get(ym) ?? by.set(ym, []).get(ym)!).push(it)
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])
  const headBase: CSSProperties = { width: "100%", boxSizing: "border-box", display: "flex", gap: 8, alignItems: "center", paddingBlock: 14, borderTop: `1px solid ${HAIR}`, color: MUTE }
  const label = <span style={{ fontFamily: MONO, fontSize: 12, color: MUTE }}>izmještena stajališta ({items.length})</span>
  return (
    <div style={{ width: "100%", maxWidth: 556 }}>
      {forceOpen ? (
        // Force-open (search active or 'stajališta' segment): a static label, not a
        // dead button with a clickable chevron that can't change state.
        <div style={headBase}><Chevron open />{label}</div>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ ...headBase, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <Chevron open={open} />{label}
        </button>
      )}
      {show && (
        <div style={{ display: "flex", flexDirection: "column", paddingLeft: 19 }}>
          {months.map(([ym, rows]) => (
            <div key={ym} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: FAINT, paddingTop: 14, paddingBottom: 2 }}>{monthLabel(ym)}</span>
              {rows.map((it) => <StopRow key={it.id} it={it} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function YearHeader({ year, tally }: { year: string; tally: { category: string; count: number }[] }) {
  const tokens = [...tally].sort((a, b) => (TALLY[a.category]?.order ?? 9) - (TALLY[b.category]?.order ?? 9))
  return (
    <div style={{ width: "100%", maxWidth: 556, paddingTop: 56, paddingBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, fontFamily: MONO, fontWeight: 400, fontSize: 16, color: INK }}>{year}.</h2>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        {tokens.map((t, i) => {
          const m = TALLY[t.category]
          if (!m) return null
          return (
            <Fragment key={t.category}>
              {i > 0 && <Sep />}
              <span style={{ fontFamily: MONO, fontSize: 12, color: m.color }}>{t.count === 1 ? m.one : m.label} {t.count}</span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

const SEGMENTS = [
  { id: "sve", label: "sve" },
  { id: "linije", label: "linije" },
  { id: "stajalište", label: "stajališta" },
] as const
type Seg = (typeof SEGMENTS)[number]["id"]

function Finder({ q, setQ, seg, setSeg, counts, resultLabel }: { q: string; setQ: (v: string) => void; seg: Seg; setSeg: (v: Seg) => void; counts: { total: number; line: number; stop: number }; resultLabel: string }) {
  const n: Record<Seg, number> = { sve: counts.total, linije: counts.line, stajalište: counts.stop }
  return (
    <div style={{ width: "100%", maxWidth: 556, paddingTop: 52, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="pr-search" style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${HAIR}`, padding: "11px 14px", background: "#fff" }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, color: FAINT }}>
          <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={2} />
          <path d="M20 20L16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <input
          type="search"
          enterKeyHint="search"
          aria-label="Traži promjene po liniji ili stajalištu"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="traži po liniji ili stajalištu"
          style={{ flexGrow: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: HEROS, fontSize: 16, lineHeight: "22px", color: INK }}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Očisti" style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", color: FAINT, fontFamily: MONO, fontSize: 12, padding: 0 }}>očisti</button>
        )}
      </div>
      <div className="pr-finder-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div role="group" aria-label="Filtriraj po vrsti promjene" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 16 }}>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={seg === s.id}
              onClick={() => setSeg(s.id)}
              className="pr-seg"
              style={{ border: "none", borderBottom: seg === s.id ? `2px solid ${BLUE}` : "2px solid transparent", background: "none", padding: "7px 0 5px", cursor: "pointer", fontFamily: MONO, fontSize: 12, fontWeight: seg === s.id ? 500 : 400, color: seg === s.id ? INK : FAINT }}
            >
              {s.label} {num(n[s.id])}
            </button>
          ))}
        </div>
        <span aria-live="polite" style={{ flexShrink: 0, fontFamily: MONO, fontSize: 12, color: FAINT }}>{resultLabel}</span>
      </div>
    </div>
  )
}

function renderLineItem(it: LineItem, legend?: ReactNode) {
  if (it.kind === "featured") return <FeaturedCard key={it.id} f={it} legend={legend} />
  if (it.removed) return <ObituaryRow key={it.id} it={it} />
  return <NoticeRow key={it.id} it={it} />
}

/** Year-tally tokens counted from whatever is actually rendered under the header
 * (so filtering/segments never leave the tally claiming hidden content). */
function tallyOf(lineItems: LineItem[], stopItems: StopRowItem[]): { category: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const it of lineItems) counts[it.category] = (counts[it.category] ?? 0) + 1
  if (stopItems.length) counts["stajalište"] = stopItems.length
  return Object.entries(counts).map(([category, count]) => ({ category, count }))
}

export function Timeline({ model, legend }: { model: TimelineModel; legend?: ReactNode }) {
  const [q, setQ] = useState("")
  const [seg, setSeg] = useState<Seg>("sve")
  const nq = norm(q.trim())
  const showLines = seg !== "stajalište"
  const showStops = seg !== "linije"

  // One filter pass over the register per query (segment switches reuse it). Segment
  // counts reflect the query alone; the result label reflects query + active segment.
  const matched = useMemo(() => {
    const hit = (it: { title: string; lines: string[] }) => !nq || norm([it.title, ...it.lines].join(" ")).includes(nq)
    return model.years.map((yg) => ({ year: yg.year, line: yg.lineItems.filter(hit), stop: yg.stopItems.filter(hit) }))
  }, [model, nq])

  const qLine = matched.reduce((a, y) => a + y.line.length, 0)
  const qStop = matched.reduce((a, y) => a + y.stop.length, 0)
  const segCounts = { total: qLine + qStop, line: qLine, stop: qStop }
  const sections = matched
    .map((y) => ({ year: y.year, lineItems: showLines ? y.line : [], stopItems: showStops ? y.stop : [] }))
    .filter((s) => s.lineItems.length || s.stopItems.length)
  const shown = sections.reduce((a, s) => a + s.lineItems.length + s.stopItems.length, 0)
  const resultLabel = nq ? `${num(shown)} ${shown === 1 ? "rezultat" : "rezultata"}` : "najnovije gore"
  const ledgerOpen = nq !== "" || seg === "stajalište"
  // Legend renders above the first VISIBLE before/after map.
  const legendId = sections.flatMap((s) => s.lineItems).find((it) => it.kind === "featured" && it.maps.length > 0)?.id

  return (
    <>
      <Finder q={q} setQ={setQ} seg={seg} setSeg={setSeg} counts={segCounts} resultLabel={resultLabel} />
      {sections.length === 0 ? (
        <div role="status" style={{ width: "100%", maxWidth: 556, paddingTop: 56, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontFamily: HEROS, fontSize: 16, color: MUTE }}>Nema promjena koje odgovaraju pretrazi.</span>
          {seg === "linije" && qStop > 0 && (
            <button type="button" onClick={() => setSeg("stajalište")} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 12, color: BLUE }}>
              {qStop === 1 ? "1 rezultat" : `${num(qStop)} rezultata`} među stajalištima →
            </button>
          )}
          {seg === "stajalište" && qLine > 0 && (
            <button type="button" onClick={() => setSeg("linije")} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 12, color: BLUE }}>
              {qLine === 1 ? "1 rezultat" : `${num(qLine)} rezultata`} među linijama →
            </button>
          )}
        </div>
      ) : (
        sections.map(({ year, lineItems, stopItems }) => (
          <Fragment key={year}>
            <YearHeader year={year} tally={tallyOf(lineItems, stopItems)} />
            {lineItems.map((it) => renderLineItem(it, it.id === legendId ? legend : undefined))}
            {showStops && stopItems.length > 0 && <StopLedger items={stopItems} forceOpen={ledgerOpen} />}
          </Fragment>
        ))
      )}
    </>
  )
}
