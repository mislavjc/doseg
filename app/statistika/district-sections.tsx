import Link from "next/link"
import type { District as DistrictScore, DistrictScoresOutput as ScoreData } from "@/lib/generated"
import type { DistrictEmblems, computeBaseInsights, computeBajsInsights, computeBands } from "./stat-data"
import { StatModuleTitle } from "./stat-typography"
import { DistrictCardV28 } from "./district-card-variants"

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
              <DistrictCardV28
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

