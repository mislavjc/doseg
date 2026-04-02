import Link from "next/link"
import type { District as DistrictScore, DistrictScoresOutput as ScoreData } from "@/lib/generated"
import type { DistrictEmblems, computeBaseInsights, computeBajsInsights, computeBands } from "./stat-data"
import { fmtHR, pct } from "./stat-data"
import { DistrictEmblem, ScoreRing } from "./stat-shared"
import { StatModuleTitle } from "./stat-typography"

type BaseInsights = ReturnType<typeof computeBaseInsights>
type BajsInsights = ReturnType<typeof computeBajsInsights>
type Bands = ReturnType<typeof computeBands>

export function DistrictBandsSection({
  data,
  bands,
  districtEmblems,
  base,
}: {
  data: ScoreData
  bands: Bands
  districtEmblems: DistrictEmblems
  base: BaseInsights
}) {
  return (
    <div className="flex flex-col gap-24 border-t border-slate-100 py-16 sm:py-24 dark:border-white/10">
      {bands.map((band) => (
        <section key={band.label}>
          <BandHeader band={band} />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {band.districts.map((d) => (
              <DistrictCard
                key={d.osmId}
                district={d}
                emblemPath={districtEmblems[String(d.osmId)]}
                totalGridCells={data.totalGridCells}
                bandColor={band.color}
                cityAvg={base.cityAvg}
                bestDistrict={base.best.name}
                mapLink={`/?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=08:00${d.bajsStations > 0 ? "&bajs=1" : ""}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BandHeader({
  band,
}: {
  band: { label: string; color: string; districts: DistrictScore[] }
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: band.color }}
        />
        <StatModuleTitle className="text-xl sm:text-2xl">
          {band.label}
        </StatModuleTitle>
      </div>
      <span className="pl-7 text-[15px] font-medium text-slate-500 dark:text-slate-400">
        {band.districts.length}{" "}
        {band.districts.length === 1 ? "četvrt" : "četvrti"}
      </span>
    </div>
  )
}

export function MethodologySection({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: BaseInsights
  bajs: BajsInsights
}) {
  return (
    <section
      id="metodologija"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <StatModuleTitle className="mb-12">Metodologija izračuna</StatModuleTitle>
      <MethodologyGrid data={data} base={base} bajs={bajs} />
      <MethodologyFooter base={base} />
    </section>
  )
}

function MethodologyGrid({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: BaseInsights
  bajs: BajsInsights
}) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
      <MethodologyGridItems data={data} base={base} />
      {bajs.hasBajs && (
        <MethodologyItem color="amber" title="BAJS">
          Idealni scenarij:{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {bajs.bajsTotalStations}
          </strong>{" "}
          stanica, svaka s 1 biciklom. Brzina{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            14 km/h
          </strong>
          .
        </MethodologyItem>
      )}
    </div>
  )
}

function MethodologyGridItems({
  data,
  base,
}: {
  data: ScoreData
  base: BaseInsights
}) {
  return (
    <>
      <MethodologyItem color="emerald" title="Algoritam">
        Dijkstrina pretraga nad{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          ZET GTFS
        </strong>{" "}
        i pješačkom mrežom.
      </MethodologyItem>
      <MethodologyItem color="cyan" title="Raster">
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {data.gridSpacingM}m
        </strong>{" "}
        razmak ·{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {data.totalSamplePoints.toLocaleString("hr-HR")}
        </strong>{" "}
        uzoraka u naseljima.
      </MethodologyItem>
      <MethodologyItem color="blue" title="Metrika">
        Udio dosežnih ćelija od ukupno{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {data.totalGridCells.toLocaleString("hr-HR")}
        </strong>{" "}
        u gradu.
      </MethodologyItem>
      <MethodologyItem color="purple" title="Vozni red">
        Prosjek od{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {data.departureCount ?? 1} polazaka
        </strong>{" "}
        u prozoru{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {base.displayDepartureTime}
        </strong>{" "}
        (vršni sat). Čekanje na stanicu modelirano kao pola intervala dolaska
        linije. Bez kašnjenja u voznom redu.
      </MethodologyItem>
      <MethodologyItem color="slate" title="Zašto 30 minuta?">
        30 minuta je međunarodni standard za mjerenje dostupnosti javnog
        prijevoza (OECD, EU Sustainable Mobility). Obuhvaća jednu tramvajsku ili
        autobusnu dionicu s presjedanjem - tipično svakodnevno putovanje u
        Zagrebu.
      </MethodologyItem>
    </>
  )
}

function MethodologyItem({
  color,
  title,
  children,
}: {
  color: string
  title: string
  children: React.ReactNode
}) {
  const colorHexes: Record<string, string> = {
    emerald: "#10b981",
    cyan: "#06b6d4",
    blue: "#3b82f6",
    purple: "#a855f7",
    slate: "#94a3b8",
    amber: "#f59e0b",
  }
  const colorHex = colorHexes[color] ?? "#94a3b8"
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <span className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
        {title}
      </span>
      <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </p>
    </div>
  )
}

function MethodologyFooter({
  base,
}: {
  base: BaseInsights
}) {
  return (
    <div className="mt-12 flex flex-col gap-6 border-t border-slate-100 pt-10 dark:border-white/10">
      <p className="font-sans text-[13px] tracking-wide text-slate-500 dark:text-slate-400">
        Zadnji izračun proveden:{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {base.generatedLabel}
        </span>
      </p>
      <MethodologyDownload />
    </div>
  )
}

function MethodologyDownload() {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <a
        href="/api/open-data"
        download="doseg-district-scores.json"
        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Preuzmi podatke (JSON)
      </a>
      <span className="max-w-xs sm:max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Svi izračunati podaci po četvrtima - rezultati, populacija, pustinjski
        indeks, BAJS utjecaj, večernji pad - u strojno čitljivom JSON formatu.
        Slobodno za korištenje uz navođenje izvora.
      </span>
    </div>
  )
}

function DistrictCard({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  cityAvg,
  bestDistrict,
  mapLink,
}: {
  district: DistrictScore
  emblemPath?: string
  totalGridCells: number
  bandColor: string
  cityAvg: number
  bestDistrict: string
  mapLink: string
}) {
  return (
    <div
      className="relative flex flex-col overflow-hidden border-l-2 bg-transparent py-2 pl-4 sm:pl-6"
      style={{ borderLeftColor: bandColor }}
    >
      <DistrictCardHeader
        d={d}
        emblemPath={emblemPath}
        bandColor={bandColor}
        bestDistrict={bestDistrict}
      />
      <DistrictCardStats d={d} />
      <DistrictCardReach
        d={d}
        totalGridCells={totalGridCells}
        bandColor={bandColor}
        cityAvg={cityAvg}
      />
      <DistrictCardBoosts d={d} totalGridCells={totalGridCells} />
      <DistrictCardLines d={d} />
      <DistrictCardFooter mapLink={mapLink} />
    </div>
  )
}

function DistrictCardHeader({
  d,
  emblemPath,
  bandColor,
  bestDistrict,
}: {
  d: DistrictScore
  emblemPath?: string
  bandColor: string
  bestDistrict: string
}) {
  return (
    <div className="relative flex items-start justify-between gap-4">
      <div>
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <h4 className="mt-5 font-sans text-[18px] leading-tight tracking-tight text-slate-900 dark:text-slate-100">
          {d.name}
        </h4>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div role="img" aria-label={`Rezultat ${d.score} od 100`}>
          <ScoreRing score={d.score} accent={bandColor} size="lg" />
        </div>
        <div className="text-right">
          <span className="block font-sans text-[8px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">
            Indeks
          </span>
          <span className="mt-0.5 block font-sans text-[9px] text-slate-500 dark:text-slate-400">
            {d.score === 100
              ? "Referentna točka"
              : `${d.score}% od ${bestDistrict}`}
          </span>
        </div>
      </div>
    </div>
  )
}

function DistrictCardStats({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <StatBadge
        value={d.population ? fmtHR(d.population / 1000, 1) + "k" : "N/A"}
        label="stan."
      />
      <StatBadge value={String(d.stops)} label="stajališta" />
      <StatBadge
        value={`~${Math.round(d.medianHeadwayMin)} min`}
        label="interval"
      />
      <DistrictCardSpecialBadges d={d} />
    </div>
  )
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-sm bg-slate-100 px-2 py-1 dark:bg-white/5">
      <span className="font-sans text-[13px] font-medium tracking-tight text-slate-700 dark:text-slate-300">
        {value}
      </span>
      <span className="text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
        {label}
      </span>
    </div>
  )
}

function DistrictCardSpecialBadges({ d }: { d: DistrictScore }) {
  return (
    <>
      {(d.trainLines?.length ?? 0) > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-teal-50 px-2 py-1 dark:bg-teal-900/20">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-teal-600 dark:text-teal-400"
          >
            <rect x="4" y="3" width="16" height="14" rx="2" />
            <path d="M4 11h16" />
            <path d="M12 3v8" />
            <circle cx="8" cy="20" r="1" />
            <circle cx="16" cy="20" r="1" />
          </svg>
          <span className="font-sans text-[13px] font-medium tracking-tight text-teal-700 dark:text-teal-400">
            HŽ
          </span>
        </div>
      )}
      {d.bajsStations > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-amber-50 px-2 py-1 dark:bg-amber-900/20">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600 dark:text-amber-400"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="font-sans text-[13px] font-medium tracking-tight text-amber-700 dark:text-amber-400">
            {d.bajsStations} BAJS
          </span>
        </div>
      )}
      {(d.peakOffpeakDrop ?? 0) >= 30 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-indigo-50 px-2 py-1 dark:bg-indigo-900/20">
          <span className="font-sans text-[13px] font-medium tracking-tight text-indigo-600 dark:text-indigo-400">
            -{d.peakOffpeakDrop}%
          </span>
          <span className="text-[11px] tracking-widest text-indigo-500 uppercase dark:text-indigo-400">
            navečer
          </span>
        </div>
      )}
      {(d.desertPct ?? 0) >= 20 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-red-50 px-2 py-1 dark:bg-red-900/20">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-500 dark:text-red-400"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span className="font-sans text-[13px] font-medium tracking-tight text-red-600 dark:text-red-400">
            {d.desertPct}%
          </span>
          <span className="text-[11px] tracking-widest text-red-500 uppercase dark:text-red-400">
            pustinja
          </span>
        </div>
      )}
    </>
  )
}

function DistrictCardReach({
  d,
  totalGridCells,
  bandColor,
  cityAvg,
}: {
  d: DistrictScore
  totalGridCells: number
  bandColor: string
  cityAvg: number
}) {
  const reachPctStr = pct(d.avgReachableCells, totalGridCells)
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  const cityReachPctNum = (cityAvg / totalGridCells) * 100
  const vsAvg = Math.round(((d.avgReachableCells - cityAvg) / cityAvg) * 100)
  return (
    <div className="mt-8 flex-1">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-sans text-[11px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">
          Doseg grada
        </span>
        <span className="font-sans text-[15px] font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {reachPctStr}%
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }}
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-slate-900 dark:bg-white"
          style={{ left: `${cityReachPctNum}%` }}
          title="Prosjek grada"
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        {d.minReachableCells !== undefined &&
        d.maxReachableCells !== undefined ? (
          <span className="font-sans text-[9px] text-slate-400 tabular-nums dark:text-slate-500">
            {pct(d.minReachableCells, totalGridCells)}-
            {pct(d.maxReachableCells, totalGridCells)}%
          </span>
        ) : (
          <span />
        )}
        <span
          className={`font-sans text-[9px] tracking-widest uppercase ${vsAvg > 0 ? "text-emerald-600 dark:text-emerald-500" : vsAvg < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}
        >
          {vsAvg > 0
            ? `+${vsAvg}% iznad prosjeka`
            : vsAvg === 0
              ? "Drži prosjek grada"
              : `${Math.abs(vsAvg)}% ispod prosjeka`}
        </span>
      </div>
    </div>
  )
}

function DistrictCardBoosts({
  d,
  totalGridCells,
}: {
  d: DistrictScore
  totalGridCells: number
}) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  return (
    <>
      {(d.trainBoostPct ?? 0) > 0 && (
        <BoostBar
          label="S HŽ vlakovima"
          color="teal"
          pct={d.trainBoostPct!}
          barWidth={Math.min(
            ((d.trainAvgReachableCells ?? d.avgReachableCells) /
              totalGridCells) *
              100,
            100
          )}
          baseWidth={reachPctNum}
        />
      )}
      {d.bajsBoostPct > 0 && (
        <BoostBar
          label="S BAJS biciklima"
          color="amber"
          pct={d.bajsBoostPct}
          barWidth={Math.min(
            ((d.bajsAvgReachableCells ?? d.avgReachableCells) /
              totalGridCells) *
              100,
            100
          )}
          baseWidth={reachPctNum}
        />
      )}
    </>
  )
}

function BoostBar({
  label,
  color,
  pct: boostPct,
  barWidth,
  baseWidth,
}: {
  label: string
  color: "teal" | "amber"
  pct: number
  barWidth: number
  baseWidth: number
}) {
  const textColor =
    color === "teal"
      ? "text-teal-600 dark:text-teal-400"
      : "text-amber-600 dark:text-amber-400"
  const bgColor =
    color === "teal"
      ? "bg-teal-50 dark:bg-teal-900/10"
      : "bg-amber-50 dark:bg-amber-900/10"
  const barColor =
    color === "teal"
      ? "bg-teal-400 dark:bg-teal-500"
      : "bg-amber-400 dark:bg-amber-500"
  const overlayColor =
    color === "teal"
      ? "bg-teal-600/20 dark:bg-teal-300/20"
      : "bg-amber-600/20 dark:bg-amber-300/20"
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-end justify-between">
        <span
          className={`font-sans text-[11px] tracking-[0.15em] uppercase ${textColor}`}
        >
          {label}
        </span>
        <span
          className={`font-sans text-[13px] leading-none tracking-tight tabular-nums ${textColor}`}
        >
          +{boostPct}%
        </span>
      </div>
      <div
        className={`relative h-1.5 w-full overflow-hidden rounded-full ${bgColor}`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${overlayColor}`}
          style={{ width: `${baseWidth}%` }}
        />
      </div>
    </div>
  )
}

function DistrictCardLines({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-8">
      <span className="mb-3 block font-sans text-[11px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">
        Linije
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {d.tramLines.length === 0 &&
        d.busLines.length === 0 &&
        (d.trainLines?.length ?? 0) === 0 ? (
          <span className="text-[13px] text-slate-500 italic">Nema linija</span>
        ) : (
          <DistrictCardLinesBadges d={d} />
        )}
      </div>
    </div>
  )
}

function DistrictCardLinesBadges({ d }: { d: DistrictScore }) {
  return (
    <>
      {d.tramLines.map((line) => (
        <span
          key={`t${line}`}
          className="inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-sm bg-slate-100 px-1.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
        >
          {line}
        </span>
      ))}
      {d.busLines.length > 0 && (
        <span className="inline-flex h-[24px] items-center justify-center rounded-sm bg-slate-100 px-2 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {d.busLines.length} {d.busLines.length === 1 ? "bus" : "buseva"}
        </span>
      )}
      {(d.trainLines?.length ?? 0) > 0 && (
        <span className="inline-flex h-[24px] items-center justify-center rounded-sm bg-teal-50 px-2 font-mono text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
          HŽ vlak
        </span>
      )}
    </>
  )
}

function DistrictCardFooter({ mapLink }: { mapLink: string }) {
  return (
    <div className="mt-6 pt-4">
      <Link
        href={mapLink}
        className="flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-[0.2em] text-violet-600 uppercase transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
      >
        Istraži područje
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
