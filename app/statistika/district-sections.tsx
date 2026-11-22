import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
} from "@/lib/generated"
import type {
  DistrictEmblems,
  computeBaseInsights,
  computeBajsInsights,
  computeBands,
} from "./stat-data"
import { StatModuleTitle } from "./stat-typography"
import { DistrictCard } from "./district-card"
import { plural } from "@/app/linije/copy"

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
    <div className="flex flex-col gap-24 border-t border-hairline py-16 sm:py-24">
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
                mapLink={`/karta?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=08:00${d.bajsStations > 0 ? "&bajs=1" : ""}`}
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
  band: { label: string; color: string; districts: Array<DistrictScore> }
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <span
          className="inline-block size-3 shrink-0"
          style={{ backgroundColor: band.color }}
        />
        <StatModuleTitle className="text-head font-bold">
          {band.label}
        </StatModuleTitle>
      </div>
      <span className="pl-7 font-mono text-label text-ink-faint lowercase">
        {band.districts.length}{" "}
        {band.districts.length === 1
          ? "kvart"
          : band.districts.length >= 2 && band.districts.length <= 4
            ? "kvarta"
            : "kvartova"}
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
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
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
        <MethodologyItem title="BAJS">
          Idealni scenarij:{" "}
          <strong className="font-medium text-ink">
            {bajs.bajsTotalStations}
          </strong>{" "}
          stanica, svaka s 1 biciklom. Brzina{" "}
          <strong className="font-medium text-ink">14 km/h</strong>.
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
      <MethodologyItem title="Algoritam">
        Dijkstrina pretraga nad{" "}
        <strong className="font-medium text-ink">ZET GTFS</strong> i pješačkom
        mrežom.
      </MethodologyItem>
      <MethodologyItem title="Raster">
        <strong className="font-medium text-ink">{data.gridSpacingM}m</strong>{" "}
        razmak ·{" "}
        <strong className="font-medium text-ink">
          {data.totalSamplePoints.toLocaleString("hr-HR")}
        </strong>{" "}
        uzoraka u naseljima.
      </MethodologyItem>
      <MethodologyItem title="Metrika">
        Udio dosežnih ćelija od ukupno{" "}
        <strong className="font-medium text-ink">
          {data.totalGridCells.toLocaleString("hr-HR")}
        </strong>{" "}
        u gradu.
      </MethodologyItem>
      <MethodologyItem title="Vozni red">
        Prosjek od{" "}
        <strong className="font-medium text-ink">
          {data.departureCount}{" "}
          {plural(data.departureCount, "polazak", "polaska", "polazaka")}
        </strong>{" "}
        u prozoru{" "}
        <strong className="font-medium text-ink">
          {base.displayDepartureTime}
        </strong>{" "}
        (vršni sat). Čekanje na stanicu modelirano kao pola intervala dolaska
        linije. Bez kašnjenja u voznom redu.
      </MethodologyItem>
      <MethodologyItem title="Zašto 30 minuta?">
        30 minuta je međunarodni standard za mjerenje dostupnosti javnog
        prijevoza (OECD, EU Sustainable Mobility). Obuhvaća jednu tramvajsku ili
        autobusnu dionicu s presjedanjem - tipično svakodnevno putovanje u
        Zagrebu.
      </MethodologyItem>
    </>
  )
}

function MethodologyItem({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-hairline-strong pt-4 pb-6">
      <span className="font-mono text-label text-ink-faint lowercase">
        {title}
      </span>
      <p className="text-body text-ink-2">{children}</p>
    </div>
  )
}

function MethodologyFooter({ base }: { base: BaseInsights }) {
  return (
    <div className="mt-12 flex flex-col gap-6 border-t border-hairline pt-10">
      <p className="font-mono text-label text-ink-muted">
        Zadnji izračun proveden:{" "}
        <span className="font-medium text-ink">{base.generatedLabel}</span>
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
        className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-body text-white transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-ink active:scale-[0.98]"
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
      <span className="max-w-xs text-body text-ink-muted sm:max-w-md">
        Svi izračunati podaci po kvartovima - rezultati, populacija, pustinjski
        indeks, BAJS utjecaj, večernji pad - u strojno čitljivom JSON formatu.
        Slobodno za korištenje uz navođenje izvora.
      </span>
    </div>
  )
}
