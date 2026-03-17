import { exec } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import Link from "next/link"
import type { Metadata } from "next"
import DistrictMap from "@/components/district-map-lazy"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Statistika — Doseg",
  description:
    "Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom u 30 minuta.",
}

interface DistrictScore {
  name: string
  osmId: number
  population?: number
  sampleCount: number
  avgReachableCells: number
  rank: number
  score: number
  bestPoint: { lat: number; lon: number }
  tramLines: string[]
  busLines: string[]
  stops: number
  avgHeadwayMin: number
}

interface ScoreData {
  generatedAt: string
  departureTime: string
  gridSpacingM: number
  maxMinutes: number
  totalSamplePoints: number
  totalGridCells: number
  districts: DistrictScore[]
}

let runningPromise: Promise<void> | null = null

function getDataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), "data")
}

async function ensureScores(): Promise<ScoreData | null> {
  const scorePath = join(getDataDir(), "district-scores.json")

  if (existsSync(scorePath)) {
    try {
      return JSON.parse(readFileSync(scorePath, "utf-8"))
    } catch {
      return null
    }
  }

  // Run scoring script if data doesn't exist (prevent concurrent runs)
  if (!runningPromise) {
    runningPromise = new Promise<void>((resolve, reject) => {
      const child = exec(
        "bun scripts/score-districts.ts",
        { cwd: process.cwd(), timeout: 300_000, env: { ...process.env, DATA_DIR: getDataDir() } },
        (err) => {
          runningPromise = null
          if (err) reject(err)
          else resolve()
        }
      )
      child.stderr?.pipe(process.stderr)
    })
  }

  try {
    await runningPromise
    return JSON.parse(readFileSync(scorePath, "utf-8"))
  } catch {
    runningPromise = null
    return null
  }
}

function loadDistrictGeoJSON(): GeoJSON.FeatureCollection | null {
  try {
    return JSON.parse(
      readFileSync(join(getDataDir(), "districts.geojson"), "utf-8")
    )
  } catch {
    return null
  }
}

function pct(cells: number, total: number): string {
  const p = (cells / total) * 100
  if (p < 0.1) return "<0,1"
  if (p < 1) return p.toFixed(1).replace(".", ",")
  return Math.round(p).toString()
}

/** Merge score data into GeoJSON feature properties. */
function enrichGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  data: ScoreData
): GeoJSON.FeatureCollection {
  const scoreMap = new Map(data.districts.map((d) => [d.osmId, d]))
  for (const f of geojson.features) {
    const s = scoreMap.get(f.properties!.osmId)
    if (s) {
      f.properties!.score = s.score
      f.properties!.rank = s.rank
      f.properties!.reachPct = pct(s.avgReachableCells, data.totalGridCells)
      f.properties!.maxMinutes = data.maxMinutes
    }
  }
  return geojson
}

export default async function StatistikaPage() {
  const data = await ensureScores()
  const rawGeoJSON = loadDistrictGeoJSON()

  if (!data) {
    return (
      <Shell>
        <BackLink />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
          Povezanost četvrti
        </h1>
        <div className="mt-10 rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
          <p className="text-[14px] text-slate-400">
            Nije moguće generirati podatke. Provjeri je li OTP pokrenut.
          </p>
          <p className="mt-1 text-[13px] text-slate-600">
            Pokreni{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-slate-400">
              docker compose up otp
            </code>{" "}
            pa osvježi stranicu.
          </p>
        </div>
      </Shell>
    )
  }

  const geojson = rawGeoJSON ? enrichGeoJSON(rawGeoJSON, data) : null

  // Derived insights
  const totalPop = data.districts.reduce(
    (s, d) => s + (d.population ?? 0),
    0
  )
  const poorDistricts = data.districts.filter((d) => d.score < 25)
  const goodDistricts = data.districts.filter((d) => d.score >= 50)
  const poorPop = poorDistricts.reduce(
    (s, d) => s + (d.population ?? 0),
    0
  )
  const goodPop = goodDistricts.reduce(
    (s, d) => s + (d.population ?? 0),
    0
  )
  const best = data.districts[0]
  const worst = data.districts[data.districts.length - 1]
  const bestPct = pct(best.avgReachableCells, data.totalGridCells)
  const worstPct = pct(worst.avgReachableCells, data.totalGridCells)
  const ratio = Math.round(best.avgReachableCells / worst.avgReachableCells)

  // Weighted city average
  const weightedSum = data.districts.reduce(
    (s, d) => s + d.avgReachableCells * d.sampleCount,
    0
  )
  const cityAvg = weightedSum / data.totalSamplePoints

  // Group by quality band
  const bands = [
    {
      label: "Odlična povezanost",
      color: "#16a34a",
      districts: data.districts.filter((d) => d.score >= 70),
    },
    {
      label: "Dobra povezanost",
      color: "#0891b2",
      districts: data.districts.filter(
        (d) => d.score >= 50 && d.score < 70
      ),
    },
    {
      label: "Slaba povezanost",
      color: "#2563eb",
      districts: data.districts.filter(
        (d) => d.score >= 25 && d.score < 50
      ),
    },
    {
      label: "Loša povezanost",
      color: "#9333ea",
      districts: data.districts.filter((d) => d.score < 25),
    },
  ].filter((b) => b.districts.length > 0)

  return (
    <Shell>
      <BackLink />

      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
        Povezanost četvrti
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
        Koliki dio grada prosječni stanovnik svake četvrti može doseći za{" "}
        {data.maxMinutes} minuta javnim prijevozom i hodanjem.
      </p>
      <p className="mt-1.5 text-[12px] text-slate-600">
        Jutarnji vršni sat (radni dan, polazak u {data.departureTime}).
        Rezultati se mogu značajno razlikovati za večernje sate i vikende.
      </p>

      {/* Choropleth map */}
      {geojson && (
        <div className="mt-8">
          <DistrictMap geojson={geojson} />
          <p className="mt-2 text-[11px] text-slate-700">
            Zeleno = bolja povezanost, ljubičasto = lošija. Pomakni miš
            preko četvrti za detalje.
          </p>
        </div>
      )}

      {/* Headline insights */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InsightCard
          value={`${goodDistricts.length}`}
          unit={`od ${data.districts.length}`}
          label="četvrti s dobrom povezanošću (≥50)"
        />
        <InsightCard
          value={`${Math.round((poorPop / totalPop) * 100)}%`}
          label="Zagrepčana živi u slabo povezanim četvrtima (<25)"
        />
        <InsightCard
          value={`${bestPct}%`}
          label={`grada dostupno iz ${best.name.split(" ")[0]}og grada`}
        />
        <InsightCard
          value={`${ratio}×`}
          label="razlika između najbolje i najgore četvrti"
        />
      </div>

      {/* Transit network summary */}
      <section className="mt-6 rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
        <h2 className="text-[13px] font-medium tracking-wide text-slate-500">
          ZET mreža u brojkama
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <span className="text-[18px] font-semibold text-white">
              {(() => {
                const allTram = new Set(
                  data.districts.flatMap((d) => d.tramLines)
                )
                return allTram.size
              })()}
            </span>
            <p className="text-slate-500">tramvajskih linija</p>
          </div>
          <div>
            <span className="text-[18px] font-semibold text-white">
              {(() => {
                const allBus = new Set(
                  data.districts.flatMap((d) => d.busLines)
                )
                return allBus.size
              })()}
            </span>
            <p className="text-slate-500">bus linija</p>
          </div>
          <div>
            <span className="text-[18px] font-semibold text-white">
              {data.districts.reduce((s, d) => s + d.stops, 0).toLocaleString("hr-HR")}
            </span>
            <p className="text-slate-500">stajališta</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
          {(() => {
            const noTram = data.districts.filter(
              (d) => d.tramLines.length === 0
            )
            const noTramPop = noTram.reduce(
              (s, d) => s + (d.population ?? 0),
              0
            )
            return `${noTram.length} od ${data.districts.length} četvrti nema tramvajsku liniju (${noTram.map((d) => d.name).join(", ")}). U njima živi ${noTramPop.toLocaleString("hr-HR")} stanovnika — ${Math.round((noTramPop / totalPop) * 100)}% grada.`
          })()}
        </p>
      </section>

      {/* What the score means */}
      <section className="mt-8 rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
        <h2 className="text-[13px] font-medium tracking-wide text-slate-500">
          Što znači rezultat
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-300">
          Grad je podijeljen u ćelije od ~200m. Rezultat mjeri koliki udio
          tih ćelija ({data.totalGridCells.toLocaleString("hr-HR")} ukupno)
          možeš doseći za {data.maxMinutes} minuta koristeći tramvaj, bus i
          hodanje. Uzorkovane su samo naseljene točke (blizu zgrada u
          OpenStreetMapu).
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
          <strong className="text-white">{best.name}</strong> ima rezultat
          100 — njeni stanovnici prosječno mogu doseći {bestPct}% grada.{" "}
          <strong className="text-white">{worst.name}</strong> ima rezultat{" "}
          {worst.score} — samo {worstPct}%.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          {[
            { color: "#16a34a", label: "70–100 odlično" },
            { color: "#0891b2", label: "50–69 dobro" },
            { color: "#2563eb", label: "25–49 slabo" },
            { color: "#9333ea", label: "0–24 loše" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Accessibility gap */}
      <section className="mt-4 rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
        <h2 className="text-[13px] font-medium tracking-wide text-slate-500">
          Jaz u dostupnosti
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-300">
          Samo{" "}
          <strong className="text-white">
            {Math.round((goodPop / totalPop) * 100)}%
          </strong>{" "}
          Zagrepčana ({goodPop.toLocaleString("hr-HR")} stan.) živi u
          četvrtima s rezultatom ≥50. Istovremeno,{" "}
          <strong className="text-white">
            {Math.round((poorPop / totalPop) * 100)}%
          </strong>{" "}
          ({poorPop.toLocaleString("hr-HR")} stan.) živi u četvrtima gdje je
          rezultat ispod 25 — to uključuje{" "}
          {poorDistricts.map((d) => d.name).join(", ")}.
        </p>
      </section>

      {/* District ranking by band */}
      <div className="mt-10 space-y-8">
        {bands.map((band) => (
          <section key={band.label}>
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: band.color }}
              />
              <h3 className="text-[14px] font-medium text-slate-300">
                {band.label}
              </h3>
              <span className="text-[12px] text-slate-600">
                {band.districts.length}{" "}
                {band.districts.length === 1 ? "četvrt" : "četvrti"}
              </span>
            </div>
            <div className="space-y-1">
              {band.districts.map((d, i) => (
                <DistrictRow
                  key={d.osmId}
                  district={d}
                  feature={rawGeoJSON?.features.find((f) => f.properties?.osmId === d.osmId)}
                  totalGridCells={data.totalGridCells}
                  bandColor={band.color}
                  cityAvg={cityAvg}
                  mapLink={`/?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=${data.departureTime}`}
                  index={d.rank - 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Methodology */}
      <section className="mt-10 rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
        <h2 className="text-[13px] font-medium tracking-wide text-slate-500">
          Metodologija
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <span className="text-slate-200">Algoritam</span>
            <p className="text-slate-500">
              Dijkstrina pretraga nad ZET GTFS + pješačkom mrežom
            </p>
          </div>
          <div>
            <span className="text-slate-200">Raster</span>
            <p className="text-slate-500">
              {data.gridSpacingM}m ·{" "}
              {data.totalSamplePoints.toLocaleString("hr-HR")} uzoraka u
              naseljenim područjima
            </p>
          </div>
          <div>
            <span className="text-slate-200">Metrika</span>
            <p className="text-slate-500">
              Udio dosežnih ćelija (~200m) od{" "}
              {data.totalGridCells.toLocaleString("hr-HR")} ukupno
            </p>
          </div>
          <div>
            <span className="text-slate-200">Vozni red</span>
            <p className="text-slate-500">
              Jutarnji vršni sat (radni dan, {data.departureTime}), bez
              kašnjenja u stvarnom vremenu
            </p>
          </div>
        </div>
      </section>

      <p className="mt-8 text-[12px] text-slate-700">
        Zadnji izračun:{" "}
        {new Date(data.generatedAt).toLocaleDateString("hr-HR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </Shell>
  )
}

// --- Components ---

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <main
        id="main-content"
        className="mx-auto max-w-xl px-5 py-12 sm:py-20"
      >
        {children}
      </main>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-slate-200 active:scale-[0.97]"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8l4-4" />
      </svg>
      Natrag na kartu
    </Link>
  )
}

function InsightCard({
  value,
  unit,
  label,
}: {
  value: string
  unit?: string
  label: string
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06]">
      <div className="text-[20px] font-semibold tabular-nums text-white">
        {value}
        {unit && (
          <span className="ml-1 text-[13px] font-normal text-slate-500">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
        {label}
      </div>
    </div>
  )
}

function getSvgPath(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, size: number = 32): string {
  if (!feature.geometry) return ""
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const rings: [number, number][][] = []

  const processPolygon = (polygon: GeoJSON.Position[][]) => {
    polygon.forEach(ring => {
      const pts = ring.map(coord => [coord[0], coord[1]] as [number, number])
      pts.forEach(([x, y]) => {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      })
      rings.push(pts)
    })
  }

  if (feature.geometry.type === "Polygon") {
    processPolygon(feature.geometry.coordinates)
  } else if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach(processPolygon)
  }

  if (rings.length === 0) return ""

  const padding = 2
  const innerSize = size - padding * 2

  const w = maxX - minX
  const h = maxY - minY
  const scale = Math.min(innerSize / (w || 1), innerSize / (h || 1))
  
  const cx = minX + w / 2
  const cy = minY + h / 2

  let path = ""
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const px = padding + innerSize / 2 + (ring[i][0] - cx) * scale
      const py = padding + innerSize / 2 - (ring[i][1] - cy) * scale
      if (i === 0) {
        path += `M ${px} ${py} `
      } else {
        path += `L ${px} ${py} `
      }
    }
    path += "Z "
  }

  return path
}

function DistrictEmblem({ feature, rank, color }: { feature?: GeoJSON.Feature, rank: number, color: string }) {
  if (!feature || !feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
    return (
      <div className="relative flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center">
        <span className="text-[18px] font-semibold tabular-nums text-slate-400">{rank}</span>
      </div>
    )
  }

  const pathData = getSvgPath(feature as any, 80)
  return (
    <div className="relative flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 opacity-50">
        <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        <path d={pathData} fill={color} opacity="0.15" />
      </svg>
      <span className="relative z-10 text-[20px] font-bold tabular-nums text-white drop-shadow-md">
        {rank}
      </span>
    </div>
  )
}

function DistrictRow({
  district: d,
  feature,
  totalGridCells,
  bandColor,
  cityAvg,
  mapLink,
  index,
}: {
  district: DistrictScore
  feature?: GeoJSON.Feature
  totalGridCells: number
  bandColor: string
  cityAvg: number
  mapLink: string
  index: number
}) {
  const reachPct = pct(d.avgReachableCells, totalGridCells)
  const vsAvg = Math.round(
    ((d.avgReachableCells - cityAvg) / cityAvg) * 100
  )
  const vsAvgStr =
    vsAvg > 0 ? `+${vsAvg}%` : vsAvg === 0 ? "prosjek" : `${vsAvg}%`
  const hasTram = d.tramLines.length > 0

  return (
    <div
      className="district-row group relative overflow-hidden rounded-xl px-4 py-5 hover:bg-white/[0.03] ring-1 ring-transparent hover:ring-white/[0.06] transition-colors"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex gap-5">
        {/* Big Emblem Column */}
        <DistrictEmblem feature={feature} rank={d.rank} color={bandColor} />

        {/* Content Column */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[17px] font-medium text-slate-100">
              {d.name}
            </span>
            <span className="text-[18px] font-semibold tabular-nums text-white">
              {d.score}
            </span>
          </div>

          {/* Score bar */}
          <div className="mt-2.5 h-2 rounded-full bg-white/[0.06] shadow-inner">
            <div
              className="score-bar h-full rounded-full"
              style={{
                width: `${Math.max(d.score, 1)}%`,
                backgroundColor: bandColor,
                opacity: 0.9,
                animationDelay: `${index * 40 + 150}ms`,
              }}
            />
          </div>

          {/* Transit line pills */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {hasTram ? (
              <>
                {d.tramLines.map((line) => (
                  <span
                    key={`t${line}`}
                    className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[6px] bg-white/[0.08] px-1.5 text-[11px] font-semibold tabular-nums text-white ring-1 ring-white/[0.05]"
                  >
                    {line}
                  </span>
                ))}
                {d.busLines.length > 0 && (
                  <span className="ml-1 text-[12px] text-slate-500">
                    + {d.busLines.length} bus
                  </span>
                )}
              </>
            ) : (
              <span className="rounded-[6px] bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-white/[0.05]">
                Samo bus · {d.busLines.length}{" "}
                {d.busLines.length === 1 ? "linija" : "linija"}
              </span>
            )}
            <span className="ml-auto text-[12px] text-slate-600 font-medium">
              {d.stops} stajališta
            </span>
          </div>

          {/* Stats row */}
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
            <span className="text-slate-400 font-medium">{reachPct}% grada dostupno</span>
            <span
              className={`tabular-nums font-medium ${vsAvg > 0 ? "text-emerald-500" : vsAvg < 0 ? "text-rose-400" : "text-slate-500"}`}
            >
              {vsAvgStr} od prosjeka
            </span>
            {d.population && (
              <span className="text-slate-600">
                {d.population.toLocaleString("hr-HR")} stan.
              </span>
            )}
          </div>
          
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <Link
              href={mapLink}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-300 group-hover:text-slate-400"
            >
              Pogledaj na karti
              <span aria-hidden="true" className="inline-block transition-transform duration-150 group-hover:translate-x-1">
                &rarr;
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
