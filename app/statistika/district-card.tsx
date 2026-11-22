import Link from "next/link"
import type { District as DistrictScore } from "@/lib/generated"
import { fmtHR } from "@/lib/format"
import { pct } from "./stat-data"
import { DistrictEmblem } from "./stat-shared"

type DistrictCardProps = {
  district: DistrictScore
  emblemPath?: string
  totalGridCells: number
  bandColor: string
  cityAvg: number
  mapLink: string
}

function DenseSpecialBadges({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {d.trainLines.length > 0 && (
        <div className="inline-flex items-center gap-1 bg-blue-wash px-1.5 py-0.5 font-mono text-label text-zg-blue">
          HŽ Vlak
        </div>
      )}
      {d.bajsStations > 0 && (
        <div className="inline-flex items-center gap-1 bg-surface px-1.5 py-0.5 font-mono text-label text-ink-muted">
          {d.bajsStations} BAJS
        </div>
      )}
      {d.peakOffpeakDrop >= 30 && (
        <div className="inline-flex items-center gap-1 bg-blue-wash px-1.5 py-0.5 font-mono text-label text-zg-blue">
          -{d.peakOffpeakDrop}% navečer
        </div>
      )}
      {d.desertPct >= 20 && (
        <div className="inline-flex items-center gap-1 bg-surface px-1.5 py-0.5 font-mono text-label text-ink">
          {d.desertPct}% pustinja
        </div>
      )}
    </div>
  )
}

function DenseBoostBars({
  d,
  totalGridCells,
}: {
  d: DistrictScore
  totalGridCells: number
}) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100

  const renderBoost = (
    label: string,
    pctVal: number,
    rawVal: number,
    colorClass: string,
    bgClass: string,
    barClass: string
  ) => (
    <div className="mt-3">
      <div className="mb-1 flex justify-between font-mono text-label">
        <span className={colorClass}>{label}</span>
        <span className={colorClass}>+{pctVal}%</span>
      </div>
      <div className={`relative h-1 w-full overflow-hidden ${bgClass}`}>
        <div
          className={`absolute inset-y-0 left-0 ${barClass}`}
          style={{
            width: `${Math.min((rawVal / totalGridCells) * 100, 100)}%`,
          }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-black/10"
          style={{ width: `${reachPctNum}%` }}
        />
      </div>
    </div>
  )

  return (
    <>
      {d.trainBoostPct > 0 &&
        renderBoost(
          "S HŽ Vlakovima",
          d.trainBoostPct,
          d.trainAvgReachableCells,
          "text-zg-blue",
          "bg-blue-wash",
          "bg-blue-pale"
        )}
      {d.bajsBoostPct > 0 &&
        renderBoost(
          "S BAJS Biciklima",
          d.bajsBoostPct,
          d.bajsAvgReachableCells,
          "text-ink-muted",
          "bg-surface",
          "bg-ink-ghost"
        )}
    </>
  )
}

function DenseLinesList({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-4">
      <span className="mb-2 block font-mono text-label text-ink-faint">
        Linije
      </span>
      <div className="flex flex-wrap gap-1">
        {d.tramLines.map((line) => (
          <span
            key={`t${line}`}
            className="flex h-5 min-w-5 items-center justify-center bg-track px-1 font-mono text-label text-ink-2"
          >
            {line}
          </span>
        ))}
        {d.busLines.length > 0 && (
          <span className="flex h-5 items-center justify-center bg-track px-1.5 font-mono text-label text-ink-2">
            {d.busLines.length} bus
          </span>
        )}
        {d.trainLines.length > 0 && (
          <span className="flex h-5 items-center justify-center bg-blue-wash px-1.5 font-mono text-label text-zg-blue">
            HŽ
          </span>
        )}
      </div>
    </div>
  )
}

function DistrictCardHeader({
  d,
  emblemPath,
  bandColor,
}: {
  d: DistrictScore
  emblemPath?: string
  bandColor: string
}) {
  return (
    <div className="flex items-center justify-between p-6 pb-6">
      <div className="flex items-center gap-4">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <div>
          <div className="mb-1 font-mono text-label font-bold text-ink-faint">
            Kvart
          </div>
          <h4 className="text-head font-bold text-ink">{d.name}</h4>
        </div>
      </div>
      <div className="text-right">
        <div className="text-head font-bold" style={{ color: bandColor }}>
          {d.score}
        </div>
        <div className="font-mono text-label text-ink-faint">Indeks</div>
      </div>
    </div>
  )
}

function DenseStatTiles({ d }: { d: DistrictScore }) {
  return (
    <div className="flex justify-between gap-3 text-center">
      <div className="flex-1 bg-surface py-3">
        <div className="mb-0.5 font-mono text-label text-ink-faint">Stan.</div>
        <div className="text-body text-ink">
          {d.population !== null && d.population !== 0
            ? fmtHR(d.population / 1000, 1) + "k"
            : "-"}
        </div>
      </div>
      <div className="flex-1 bg-surface py-3">
        <div className="mb-0.5 font-mono text-label text-ink-faint">
          Stanice
        </div>
        <div className="text-body text-ink">{d.stops}</div>
      </div>
      <div className="flex-1 bg-surface py-3">
        <div className="mb-0.5 font-mono text-label text-ink-faint">
          Interval
        </div>
        <div className="text-body text-ink">
          ~{Math.round(d.medianHeadwayMin)}m
        </div>
      </div>
    </div>
  )
}

export function DistrictCard({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  cityAvg,
  mapLink,
}: DistrictCardProps) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  const cityReachPctNum = (cityAvg / totalGridCells) * 100

  return (
    <div className="flex h-full flex-col overflow-hidden border border-hairline-strong bg-white">
      <DistrictCardHeader d={d} emblemPath={emblemPath} bandColor={bandColor} />

      <div className="px-6">
        <DenseStatTiles d={d} />

        <div className="mt-4">
          <DenseSpecialBadges d={d} />
        </div>
      </div>

      <div className="mt-6 border-t border-hairline p-6 pb-5">
        <div className="mb-4 flex justify-between font-mono text-label text-ink-muted">
          <span>Doseg grada</span>
          <span className="font-semibold text-ink">
            {pct(d.avgReachableCells, totalGridCells)}%
          </span>
        </div>
        <div className="relative h-2 w-full bg-track">
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }}
          />
          <div
            className="absolute inset-y-0 w-[2px] bg-ink-ghost"
            style={{ left: `${cityReachPctNum}%` }}
          />
        </div>

        <div className="mt-4">
          <DenseBoostBars d={d} totalGridCells={totalGridCells} />
        </div>
      </div>

      <div className="mt-auto border-t border-hairline px-6 py-5">
        <DenseLinesList d={d} />

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={mapLink}
            className="group flex items-center gap-1.5 font-mono text-label text-zg-blue transition-colors hover:text-navy"
          >
            <span>Istraži područje</span>
            <span className="transition-transform group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
