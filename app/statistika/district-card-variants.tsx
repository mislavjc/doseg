import Link from "next/link"
import type { District as DistrictScore } from "@/lib/generated"
import { fmtHR, pct } from "./stat-data"
import { DistrictEmblem } from "./stat-shared"

export type DistrictCardProps = {
  district: DistrictScore
  emblemPath?: string
  totalGridCells: number
  bandColor: string
  cityAvg: number
  bestDistrict: string
  mapLink: string
}

// -----------------------------------------------------------------------------
// HELPER COMPONENTS FOR DATA DENSE VARIANTS (V21 - V25)
// -----------------------------------------------------------------------------

function DenseSpecialBadges({ d }: { d: DistrictScore }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {(d.trainLines?.length ?? 0) > 0 && (
        <div className="inline-flex items-center gap-1 rounded-sm bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
          HŽ Vlak
        </div>
      )}
      {d.bajsStations > 0 && (
        <div className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {d.bajsStations} BAJS
        </div>
      )}
      {(d.peakOffpeakDrop ?? 0) >= 30 && (
        <div className="inline-flex items-center gap-1 rounded-sm bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
          -{d.peakOffpeakDrop}% navečer
        </div>
      )}
      {(d.desertPct ?? 0) >= 20 && (
        <div className="inline-flex items-center gap-1 rounded-sm bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {d.desertPct}% pustinja
        </div>
      )}
    </div>
  )
}

function DenseBoostBars({ d, totalGridCells }: { d: DistrictScore; totalGridCells: number }) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100

  const renderBoost = (label: string, pctVal: number, rawVal: number, colorClass: string, bgClass: string, barClass: string) => (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider">
        <span className={colorClass}>{label}</span>
        <span className={colorClass}>+{pctVal}%</span>
      </div>
      <div className={`relative h-1 w-full overflow-hidden rounded-full ${bgClass}`}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${barClass}`} style={{ width: `${Math.min((rawVal / totalGridCells) * 100, 100)}%` }} />
        <div className="absolute inset-y-0 left-0 bg-black/10 dark:bg-white/10" style={{ width: `${reachPctNum}%` }} />
      </div>
    </div>
  )

  return (
    <>
      {(d.trainBoostPct ?? 0) > 0 && renderBoost("S HŽ Vlakovima", d.trainBoostPct, d.trainAvgReachableCells ?? d.avgReachableCells, "text-teal-600 dark:text-teal-400", "bg-teal-100 dark:bg-teal-900/30", "bg-teal-500 dark:bg-teal-400")}
      {(d.bajsBoostPct ?? 0) > 0 && renderBoost("S BAJS Biciklima", d.bajsBoostPct, d.bajsAvgReachableCells ?? d.avgReachableCells, "text-amber-600 dark:text-amber-400", "bg-amber-100 dark:bg-amber-900/30", "bg-amber-500 dark:bg-amber-400")}
    </>
  )
}

function DenseLinesList({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-4">
      <span className="mb-2 block text-[10px] uppercase tracking-widest text-slate-400">Linije</span>
      <div className="flex flex-wrap gap-1">
        {d.tramLines.map((line) => (
          <span key={`t${line}`} className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-slate-100 px-1 font-mono text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{line}</span>
        ))}
        {d.busLines.length > 0 && (
          <span className="flex h-5 items-center justify-center rounded-sm bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{d.busLines.length} bus</span>
        )}
        {(d.trainLines?.length ?? 0) > 0 && (
          <span className="flex h-5 items-center justify-center rounded-sm bg-teal-50 px-1.5 font-mono text-[10px] font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">HŽ</span>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V28: The Refined Crammed Fix - Spaced out, shadowless, elegant
// -----------------------------------------------------------------------------
export function DistrictCardV28({
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
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200/60 bg-white transition-colors hover:border-slate-300/80 dark:border-white/5 dark:bg-slate-900/50 dark:hover:border-white/10">
      
      {/* Header with Emblem */}
      <div className="flex items-center justify-between p-6 pb-6">
        <div className="flex items-center gap-4">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Kvart</div>
            <h4 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">{d.name}</h4>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[24px] font-semibold tracking-tight" style={{ color: bandColor }}>{d.score}</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Indeks</div>
        </div>
      </div>

      {/* Dense Stats Grid */}
      <div className="px-6">
        <div className="flex justify-between gap-3 text-center">
          <div className="flex-1 rounded-3xl bg-slate-50/50 py-3 dark:bg-slate-800/30">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Stan.</div>
            <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.population != null && d.population !== 0 ? fmtHR(d.population/1000, 1)+'k' : '-'}</div>
          </div>
          <div className="flex-1 rounded-3xl bg-slate-50/50 py-3 dark:bg-slate-800/30">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Stanice</div>
            <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.stops}</div>
          </div>
          <div className="flex-1 rounded-3xl bg-slate-50/50 py-3 dark:bg-slate-800/30">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Interval</div>
            <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">~{Math.round(d.medianHeadwayMin)}m</div>
          </div>
        </div>
        
        <div className="mt-4">
          <DenseSpecialBadges d={d} />
        </div>
      </div>

      {/* Reach & Boosts */}
      <div className="mt-6 border-t border-slate-50/80 p-6 pb-5 dark:border-slate-800/50">
        <div className="mb-4 flex justify-between text-[11px] uppercase tracking-widest text-slate-500">
          <span>Doseg grada</span>
          <span className="font-semibold text-slate-900 dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
          <div className="absolute inset-y-0 w-[2px] bg-slate-300 dark:bg-slate-600" style={{ left: `${cityReachPctNum}%` }} />
        </div>
        
        <div className="mt-4">
          <DenseBoostBars d={d} totalGridCells={totalGridCells} />
        </div>
      </div>

      {/* Lines & Link */}
      <div className="mt-auto border-t border-slate-50/80 bg-slate-50/30 px-6 py-5 dark:border-slate-800/50 dark:bg-slate-800/10">
        <DenseLinesList d={d} />
        
        <div className="mt-6 flex items-center justify-between">
          <Link href={mapLink} className="group flex items-center gap-2 text-[14px] font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <span>Istraži područje</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white transition-transform group-hover:translate-x-1 dark:bg-slate-800">&rarr;</span>
          </Link>
        </div>
      </div>

    </div>
  )
}


