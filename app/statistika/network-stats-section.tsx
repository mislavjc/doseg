import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { scaleLinear } from "@visx/scale"
import type {
  NetworkStatsOutput,
  NetworkRoute,
  Fleet,
  WeekendService,
  DirectionalAsymmetryEntry,
  RouteStatsOutput,
  RouteStatsRoute,
} from "@/lib/generated"

function loadNetworkStats(): NetworkStatsOutput | null {
  const statsPath = join(getDataDir(), "network-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function loadRouteStatsForInsights(): RouteStatsOutput | null {
  const statsPath = join(getDataDir(), "route-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function fmtDots(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function fmtDec(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(".", ",")
}

function tramSort(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}

/** Insight callout box */
function Insight({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-emerald-200/50 bg-emerald-50/50 px-5 py-4 dark:border-emerald-800/30 dark:bg-emerald-950/20">
      <p className="text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-200">
        {children}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compute insights from combined data
// ---------------------------------------------------------------------------
function computeInsights(data: NetworkStatsOutput, routeStats: RouteStatsOutput | null) {
  const trams = data.routes.filter((r) => r.mode === "TRAM")
  const dayTrams = trams.filter((r) => !["31", "32", "33", "34"].includes(r.name))
  const nightTrams = trams.filter((r) => ["31", "32", "33", "34"].includes(r.name))

  // Heatmap insights
  const hourlySystem = Array(24).fill(0)
  for (const r of trams) {
    r.hourlyDepartures.forEach((d, h) => { hourlySystem[h] += d })
  }
  const peakHour = hourlySystem.indexOf(Math.max(...hourlySystem))
  const peakDeps = hourlySystem[peakHour]
  const busiestTram = [...dayTrams].sort(
    (a, b) => b.hourlyDepartures.reduce((s, v) => s + v, 0) - a.hourlyDepartures.reduce((s, v) => s + v, 0)
  )[0]
  const busiestPeakDep = busiestTram?.hourlyDepartures[peakHour] ?? 0
  const busiestInterval = busiestPeakDep > 0 ? Math.round(60 / busiestPeakDep * 10) / 10 : 0
  const dayTotal = dayTrams.reduce((s, r) => s + r.hourlyDepartures.reduce((a, b) => a + b, 0), 0)
  const nightTotal = nightTrams.reduce((s, r) => s + r.hourlyDepartures.reduce((a, b) => a + b, 0), 0)

  // Quality insights — find extremes
  const withTort = dayTrams.filter((r) => r.tortuosity !== null && r.tortuosity < 4)
  const mostDirect = withTort.length > 0 ? [...withTort].sort((a, b) => (a.tortuosity ?? 99) - (b.tortuosity ?? 99))[0] : null
  const mostWinding = withTort.length > 0 ? [...withTort].sort((a, b) => (b.tortuosity ?? 0) - (a.tortuosity ?? 0))[0] : null
  const mostRegular = dayTrams.filter((r) => r.headwayCv !== null && r.headwayCv > 0)
    .sort((a, b) => (a.headwayCv ?? 99) - (b.headwayCv ?? 99))[0] ?? null

  // Speed vs spacing correlation
  const speedData: { name: string; spacing: number; speed: number }[] = []
  if (routeStats) {
    for (const t of dayTrams) {
      const rm = routeStats.routes.find((r) => r.name === t.name && r.mode === "TRAM")
      if (rm && t.stopSpacing) {
        speedData.push({ name: t.name, spacing: t.stopSpacing.avgM, speed: rm.commercialSpeedKmh })
      }
    }
  }
  const slowest = speedData.length > 0 ? [...speedData].sort((a, b) => a.speed - b.speed)[0] : null
  const fastest = speedData.length > 0 ? [...speedData].sort((a, b) => b.speed - a.speed)[0] : null

  // Fleet insights
  const fleet = data.fleet
  const interlinePct = fleet ? Math.round((fleet.interlinedBlocks / fleet.totalBlocks) * 100) : 0
  const busInterlinePct = fleet && fleet.busBlocks > 0 ? Math.round((fleet.interlinedBlocks / fleet.busBlocks) * 100) : 0
  const biggestBlock = fleet?.interlinedExamples
    .sort((a, b) => b.routes.length - a.routes.length)[0] ?? null

  return {
    peakHour, peakDeps, busiestTram, busiestPeakDep, busiestInterval,
    dayTotal, nightTotal,
    mostDirect, mostWinding, mostRegular,
    slowest, fastest, speedData,
    interlinePct, busInterlinePct, biggestBlock,
  }
}

// ---------------------------------------------------------------------------
// 1. Network Overview
// ---------------------------------------------------------------------------
function NetworkOverview({ data }: { data: NetworkStatsOutput }) {
  const { vehicleKm, deadEndStops, fleet } = data
  const tramPct = Math.round((vehicleKm.tram / vehicleKm.total) * 100)
  const deadEndBusPct = Math.round(((deadEndStops.byMode["BUS"] ?? 0) / deadEndStops.total) * 100)

  return (
    <section className="mt-24">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
        <h2 className="font-serif text-2xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
          Mrežna statistika
        </h2>
      </div>
      <p className="mb-10 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
        Dnevni pregled ZET mreže: prijeđeni kilometri, potrebna vozila i slijepe stanice.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="font-serif text-[32px] font-medium leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
            {fmtDots(vehicleKm.total)}
          </div>
          <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">vozilo-km/dan</div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Tramvaj {fmtDots(vehicleKm.tram)} · Autobus {fmtDots(vehicleKm.bus)}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="font-serif text-[32px] font-medium leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
            {fleet ? fmtDots(fleet.totalBlocks) : "-"}
          </div>
          <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">vozila</div>
          {fleet && (
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Tramvaj {fleet.tramBlocks} · Autobus {fleet.busBlocks}
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="font-serif text-[32px] font-medium leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
            {fmtDots(deadEndStops.total)}
          </div>
          <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">slijepih stanica</div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Autobus {fmtDots(deadEndStops.byMode["BUS"] ?? 0)} · Tramvaj{" "}
            {deadEndStops.byMode["TRAM"] ?? 0} · Vlak {deadEndStops.byMode["RAIL"] ?? 0}
          </div>
        </div>
      </div>
      <Insight>
        Tramvaji čine samo {tramPct}% prijeđenih kilometara, ali su srce mreže - četvrti s tramvajskim
        linijama postižu u prosjeku <strong>18 bodova više</strong> od onih bez. Od slijepih stanica,{" "}
        {deadEndBusPct}% su autobusne - poremećaj na jednoj liniji ostavlja te putnike bez alternative.
      </Insight>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2. Hourly Frequency Heatmap
// ---------------------------------------------------------------------------
function HourlyHeatmap({ routes, insights }: { routes: NetworkRoute[]; insights: ReturnType<typeof computeInsights> }) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .sort((a, b) => {
      const totalA = a.hourlyDepartures.reduce((s, v) => s + v, 0)
      const totalB = b.hourlyDepartures.reduce((s, v) => s + v, 0)
      return totalB - totalA
    })

  if (tramRoutes.length === 0) return null

  const allDeps = tramRoutes.flatMap((r) => r.hourlyDepartures)
  const maxDep = Math.max(...allDeps, 1)

  const colorScale = scaleLinear<string>({
    domain: [0, maxDep * 0.25, maxDep * 0.6, maxDep],
    range: ["#0f172a", "#065f46", "#10b981", "#6ee7b7"],
  })

  const cellW = 28, cellH = 28, gap = 2, labelW = 48, bottomLabelH = 24
  const cols = 24, rows = tramRoutes.length
  const svgW = labelW + cols * (cellW + gap)
  const svgH = rows * (cellH + gap) + bottomLabelH
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21]

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Satni polasci tramvaja
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Broj polazaka po satu za svaku tramvajsku liniju. Svjetlija boja znači više polazaka.
      </p>

      <div className="flex justify-center overflow-x-auto rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="block" role="img" aria-label="Heatmap satnih polazaka tramvaja">
          {tramRoutes.map((r, ri) => (
            <text key={`lbl-${r.name}`} x={labelW - 8} y={ri * (cellH + gap) + cellH / 2 + 1} textAnchor="end" dominantBaseline="central" className="fill-slate-600 font-sans text-[11px] dark:fill-slate-400">{r.name}</text>
          ))}
          {tramRoutes.map((r, ri) =>
            r.hourlyDepartures.map((dep, ci) => (
              <rect key={`cell-${r.name}-${ci}`} x={labelW + ci * (cellW + gap)} y={ri * (cellH + gap)} width={cellW} height={cellH} rx={4}
                fill={dep === 0 ? "transparent" : colorScale(dep)} stroke={dep === 0 ? "currentColor" : "none"} strokeWidth={dep === 0 ? 0.5 : 0}
                className={dep === 0 ? "text-slate-200 dark:text-slate-700" : ""} />
            ))
          )}
          {tramRoutes.map((r, ri) =>
            r.hourlyDepartures.map((dep, ci) =>
              dep > 0 ? (
                <text key={`txt-${r.name}-${ci}`} x={labelW + ci * (cellW + gap) + cellW / 2} y={ri * (cellH + gap) + cellH / 2 + 1}
                  textAnchor="middle" dominantBaseline="central" className="fill-white/80 font-sans text-[10px] font-medium">{dep}</text>
              ) : null
            )
          )}
          {hourLabels.map((h) => (
            <text key={`hr-${h}`} x={labelW + h * (cellW + gap) + cellW / 2} y={rows * (cellH + gap) + 16} textAnchor="middle" className="fill-slate-500 font-sans text-[10px] dark:fill-slate-400">{h}h</text>
          ))}
        </svg>
      </div>

      <Insight>
        Vršni sat je <strong>{insights.peakHour}:00</strong> s {insights.peakDeps} tramvajskih polazaka.
        {insights.busiestTram && (<>
          {" "}Najfrekventnija linija {insights.busiestTram.name} ima {insights.busiestPeakDep} polazaka u vršnom satu -
          tramvaj svakih <strong>{fmtDec(insights.busiestInterval, 1)} minuta</strong>.
        </>)}
        {" "}Noćna mreža (linije 31-34) pruža samo {insights.nightTotal} polazaka - tek{" "}
        {fmtDec(insights.nightTotal / insights.dayTotal * 100, 1)}% dnevnog kapaciteta.
      </Insight>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3. Route Quality Cards
// ---------------------------------------------------------------------------
function RouteQualityCards({ routes, insights }: { routes: NetworkRoute[]; insights: ReturnType<typeof computeInsights> }) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .sort((a, b) => tramSort(a.name, b.name))

  if (tramRoutes.length === 0) return null

  function cvColor(cv: number | null): string {
    if (cv === null) return "text-slate-400 dark:text-slate-500"
    if (cv < 0.2) return "text-emerald-600 dark:text-emerald-400"
    if (cv <= 0.4) return "text-amber-600 dark:text-amber-400"
    return "text-red-600 dark:text-red-400"
  }

  function cvLabel(cv: number | null): string {
    if (cv === null) return "-"
    if (cv < 0.15) return "odlično"
    if (cv < 0.25) return "dobro"
    if (cv <= 0.4) return "umjereno"
    return "kaotičan"
  }

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Kvaliteta tramvajskih linija
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Tortuoznost mjeri koliko je ruta neizravna (1,0 = savršeno ravna).
        CV takta označava ujednačenost razmaka polazaka (manje = bolje).
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tramRoutes.map((r) => {
          const totalDeps = r.hourlyDepartures.reduce((s, v) => s + v, 0)
          const isNight = totalDeps < 30
          return (
            <div key={r.name} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg bg-rose-500 text-[13px] font-bold text-white">{r.name}</span>
                {isNight && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">noćna</span>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Tortuoznost</span>
                  <span className="font-serif text-[13px] tabular-nums text-slate-800 dark:text-slate-200">{r.tortuosity !== null ? fmtDec(r.tortuosity) : "-"}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Razmak</span>
                  <span className="font-serif text-[13px] tabular-nums text-slate-800 dark:text-slate-200">{r.stopSpacing ? `${Math.round(r.stopSpacing.avgM)} m` : "-"}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">CV takta</span>
                  <span className={`font-serif text-[13px] font-medium tabular-nums ${cvColor(r.headwayCv)}`}>{r.headwayCv !== null ? fmtDec(r.headwayCv) : "-"}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Vrh:baza</span>
                  <span className="font-serif text-[13px] tabular-nums text-slate-800 dark:text-slate-200">{r.peakToBaseRatio !== null ? fmtDec(r.peakToBaseRatio) : "-"}</span>
                </div>
              </div>
              {r.headwayCv !== null && (
                <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <span className={`text-[10px] font-medium ${cvColor(r.headwayCv)}`}>Takt: {cvLabel(r.headwayCv)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Insight>
        {insights.mostDirect && insights.mostWinding && (
          <>
            Najizravnija linija je <strong>tramvaj {insights.mostDirect.name}</strong> (tortuoznost{" "}
            {fmtDec(insights.mostDirect.tortuosity!, 2)}), a najkrivudavija{" "}
            <strong>tramvaj {insights.mostWinding.name}</strong> ({fmtDec(insights.mostWinding.tortuosity!, 2)} -{" "}
            {Math.round(((insights.mostWinding.tortuosity! - 1) * 100))}% duža od ravne linije).
          </>
        )}
        {insights.fastest && insights.slowest && (
          <>{" "}
            Korelacija je jasna: linije s većim razmakom stajališta voze brže.{" "}
            <strong>Tramvaj {insights.fastest.name}</strong> ({Math.round(insights.fastest.spacing)} m razmak) postiže{" "}
            {fmtDec(insights.fastest.speed, 1)} km/h, dok <strong>tramvaj {insights.slowest.name}</strong> ({Math.round(insights.slowest.spacing)} m) ide samo {fmtDec(insights.slowest.speed, 1)} km/h.
          </>
        )}
      </Insight>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 4. Fleet & Interlining
// ---------------------------------------------------------------------------
function FleetSection({ fleet, insights }: { fleet: Fleet; insights: ReturnType<typeof computeInsights> }) {
  const topBlocks = [...fleet.interlinedExamples]
    .sort((a, b) => b.routes.length - a.routes.length)
    .slice(0, 5)

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Vozni park i interlining
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Interlining znači da jedno vozilo tijekom dana vozi više različitih linija.
        Od {fleet.totalBlocks} dnevnih blokova, {fleet.interlinedBlocks} ih sadrži više linija.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-serif text-[28px] font-medium leading-none tabular-nums text-emerald-600 dark:text-emerald-400">{fleet.totalBlocks}</div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">ukupno blokova</div>
            </div>
            <div>
              <div className="font-serif text-[28px] font-medium leading-none tabular-nums text-amber-600 dark:text-amber-400">{fleet.interlinedBlocks}</div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">interliniranih</div>
            </div>
          </div>
          <div className="mt-4 flex gap-6 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <span className="font-serif text-[20px] tabular-nums text-slate-800 dark:text-slate-200">{fleet.tramBlocks}</span>
              <span className="ml-1.5 text-[11px] text-slate-500">tramvajskih</span>
            </div>
            <div>
              <span className="font-serif text-[20px] tabular-nums text-slate-800 dark:text-slate-200">{fleet.busBlocks}</span>
              <span className="ml-1.5 text-[11px] text-slate-500">autobusnih</span>
            </div>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-3 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Najsloženiji blokovi</div>
          <div className="space-y-2.5">
            {topBlocks.map((block) => (
              <div key={block.blockId} className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 text-[12px] font-medium tabular-nums text-slate-600 dark:text-slate-300">{block.blockId}</span>
                <span className="text-[10px] text-slate-400">→</span>
                {block.routes.map((route) => (
                  <span key={route} className="inline-flex h-5 items-center rounded bg-blue-100 px-1.5 text-[10px] font-semibold tabular-nums text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{route}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Insight>
        Interlining je isključivo autobusni fenomen - <strong>{insights.busInterlinePct}% autobusnih blokova</strong> vozi
        više od jedne linije, dok tramvaji zadržavaju fiksne rute.
        {insights.biggestBlock && (<>
          {" "}Najsloženiji blok ({insights.biggestBlock.blockId}) prolazi kroz{" "}
          <strong>{insights.biggestBlock.routes.length} različitih linija</strong> u jednom danu.
          To znači da kašnjenje na liniji {insights.biggestBlock.routes[0]} može kaskadno utjecati na
          linije {insights.biggestBlock.routes.slice(1).join(", ")}.
        </>)}
      </Insight>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 5. Weekend & Asymmetry
// ---------------------------------------------------------------------------
function WeekendAsymmetrySection({
  weekendService,
  asymmetry,
}: {
  weekendService: WeekendService | null
  asymmetry: DirectionalAsymmetryEntry[] | null
}) {
  if (!weekendService && !asymmetry) return null

  const topAsymmetric = asymmetry
    ? [...asymmetry].sort((a, b) => a.ratio - b.ratio).slice(0, 5)
    : []

  // Identify tram routes in weekday-only list
  const weekdayTrams = weekendService?.weekdayOnlyRoutes.filter(
    (r) => parseInt(r, 10) <= 34 && !isNaN(parseInt(r, 10))
  ) ?? []
  const weekdayBuses = weekendService?.weekdayOnlyRoutes.filter(
    (r) => parseInt(r, 10) > 34 || isNaN(parseInt(r, 10))
  ) ?? []

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Vikend i smjerna asimetrija
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Neke linije ne voze vikendom, a neke imaju različit broj polazaka u svakom smjeru.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {weekendService && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
            <div className="mb-1 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Samo radnim danom</div>
            <div className="mb-4 font-serif text-[28px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
              {weekendService.weekdayOnlyCount}{" "}
              <span className="text-[16px] text-slate-500 dark:text-slate-400">linija</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {weekendService.weekdayOnlyRoutes
                .sort((a, b) => {
                  const na = parseInt(a, 10), nb = parseInt(b, 10)
                  if (isNaN(na) && isNaN(nb)) return a.localeCompare(b)
                  if (isNaN(na)) return 1
                  if (isNaN(nb)) return -1
                  return na - nb
                })
                .map((route) => (
                  <span key={route} className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">{route}</span>
                ))}
            </div>
          </div>
        )}

        {topAsymmetric.length > 0 && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
            <div className="mb-1 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Smjerna asimetrija</div>
            <div className="mb-4 font-serif text-[28px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
              {asymmetry?.length ?? 0}{" "}
              <span className="text-[16px] text-slate-500 dark:text-slate-400">linija</span>
            </div>
            <div className="space-y-3">
              {topAsymmetric.map((entry) => {
                const maxTrips = Math.max(entry.outboundTrips, entry.inboundTrips, 1)
                const outPct = (entry.outboundTrips / maxTrips) * 100
                const inPct = (entry.inboundTrips / maxTrips) * 100
                return (
                  <div key={entry.name}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="inline-flex h-6 w-9 items-center justify-center rounded-md bg-blue-500 text-[11px] font-bold text-white">{entry.name}</span>
                      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{entry.outboundTrips} odl. / {entry.inboundTrips} dol.</span>
                    </div>
                    <div className="flex h-4 items-center gap-1">
                      <span className="w-8 text-right text-[9px] text-slate-400">odl.</span>
                      <div className="flex-1"><div className="h-2.5 rounded-full bg-emerald-400 dark:bg-emerald-500" style={{ width: `${outPct}%` }} /></div>
                    </div>
                    <div className="flex h-4 items-center gap-1">
                      <span className="w-8 text-right text-[9px] text-slate-400">dol.</span>
                      <div className="flex-1"><div className="h-2.5 rounded-full bg-rose-400 dark:bg-rose-500" style={{ width: `${inPct}%` }} /></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <Insight>
        {weekdayTrams.length > 0 && (
          <>
            Tramvajske linije <strong>{weekdayTrams.join(", ")}</strong> potpuno nestaju vikendom - ZET
            ih zamjenjuje drugačijim voznim redom.
          </>
        )}
        {topAsymmetric.length > 0 && (
          <>
            {" "}Linija {topAsymmetric[0].name} ima {topAsymmetric[0].outboundTrips} polazaka u jednom smjeru,
            ali samo {topAsymmetric[0].inboundTrips} u drugom - vjerojatno ekspresna varijanta koja se
            vraća pod drugim brojem linije.
          </>
        )}
      </Insight>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NetworkStatsSection() {
  const data = loadNetworkStats()
  if (!data) return null

  const routeStats = loadRouteStatsForInsights()
  const insights = computeInsights(data, routeStats)

  return (
    <div>
      <NetworkOverview data={data} />
      <HourlyHeatmap routes={data.routes} insights={insights} />
      <RouteQualityCards routes={data.routes} insights={insights} />
      {data.fleet && <FleetSection fleet={data.fleet} insights={insights} />}
      <WeekendAsymmetrySection
        weekendService={data.weekendService}
        asymmetry={data.directionalAsymmetry}
      />
    </div>
  )
}
