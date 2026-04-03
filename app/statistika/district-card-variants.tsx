import Link from "next/link"
import type { District as DistrictScore } from "@/lib/generated"
import { fmtHR, pct } from "./stat-data"
import { DistrictEmblem, ScoreRing } from "./stat-shared"

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
// V1: Vercel Style - Subtle borders, very clean, monochrome secondary info
// -----------------------------------------------------------------------------
export function DistrictCardV1({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  cityAvg,
  bestDistrict,
  mapLink,
}: DistrictCardProps) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  const cityReachPctNum = (cityAvg / totalGridCells) * 100

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-900/50">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <div>
            <h4 className="font-sans text-[17px] font-semibold text-slate-900 dark:text-slate-100">
              {d.name}
            </h4>
            <div className="mt-1 flex items-center gap-2 font-sans text-[13px] text-slate-500">
              <span>{d.score}% od referentne točke</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold tracking-tight" style={{ color: bandColor }}>
            {d.score}
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">Score</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          <span>{d.population ? fmtHR(d.population / 1000, 1) + "k stan." : "N/A"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          <span>{d.stops} stajališta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          <span>~{Math.round(d.medianHeadwayMin)} min int.</span>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4 dark:border-white/5">
        <div className="mb-2 flex justify-between text-[12px]">
          <span className="text-slate-500">Doseg grada</span>
          <span className="font-medium text-slate-900 dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="relative h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
          <div className="absolute inset-y-0 w-px bg-slate-900 dark:bg-white" style={{ left: `${cityReachPctNum}%` }} />
        </div>
      </div>

      <Link href={mapLink} className="mt-6 text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        Istraži područje &rarr;
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V2: Linear Style - Extremely minimal, dark/light focus, no icons
// -----------------------------------------------------------------------------
export function DistrictCardV2({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="group relative flex flex-col border border-slate-200/50 bg-slate-50/50 p-5 transition-colors hover:bg-slate-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
      <div className="flex items-baseline justify-between border-b border-slate-200/50 pb-4 dark:border-white/5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm text-slate-400">#{d.rank}</span>
          <h4 className="text-[16px] font-medium text-slate-900 dark:text-slate-200">{d.name}</h4>
        </div>
        <span className="font-mono text-[16px]" style={{ color: bandColor }}>{d.score}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 text-[13px]">
        <div>
          <span className="block text-slate-500 mb-1">Populacija</span>
          <span className="font-medium text-slate-900 dark:text-slate-200">{d.population ? fmtHR(d.population, 0) : "N/A"}</span>
        </div>
        <div>
          <span className="block text-slate-500 mb-1">Doseg</span>
          <span className="font-medium text-slate-900 dark:text-slate-200">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div>
          <span className="block text-slate-500 mb-1">Interval</span>
          <span className="font-medium text-slate-900 dark:text-slate-200">{Math.round(d.medianHeadwayMin)}m</span>
        </div>
        <div>
          <span className="block text-slate-500 mb-1">Stajališta</span>
          <span className="font-medium text-slate-900 dark:text-slate-200">{d.stops}</span>
        </div>
      </div>

      <Link href={mapLink} className="mt-2 text-[13px] text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
        Otvori kartu ↗
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V3: Apple iOS Style - Soft rounded corners, nested containers, large score
// -----------------------------------------------------------------------------
export function DistrictCardV3({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="rounded-[24px] bg-[#f2f2f7] p-5 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <h4 className="text-[20px] font-semibold tracking-tight text-black dark:text-white">{d.name}</h4>
        </div>
        <ScoreRing score={d.score} accent={bandColor} size="sm" />
      </div>

      <div className="rounded-[16px] bg-white p-4 shadow-sm dark:bg-[#2c2c2e]">
        <div className="flex justify-between text-[14px]">
          <span className="text-[#8e8e93]">Doseg</span>
          <span className="font-medium text-black dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="my-2 h-[4px] w-full rounded-full bg-[#f2f2f7] dark:bg-[#1c1c1e]">
          <div className="h-full rounded-full" style={{ width: `${(d.avgReachableCells / totalGridCells) * 100}%`, backgroundColor: bandColor }} />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-[#f2f2f7] text-center dark:divide-[#1c1c1e]">
          <div>
            <div className="text-[17px] font-medium text-black dark:text-white">{d.population ? fmtHR(d.population / 1000, 1) + "k" : "-"}</div>
            <div className="text-[11px] text-[#8e8e93]">Stan.</div>
          </div>
          <div>
            <div className="text-[17px] font-medium text-black dark:text-white">{d.stops}</div>
            <div className="text-[11px] text-[#8e8e93]">Stanice</div>
          </div>
          <div>
            <div className="text-[17px] font-medium text-black dark:text-white">{Math.round(d.medianHeadwayMin)}m</div>
            <div className="text-[11px] text-[#8e8e93]">Čekanje</div>
          </div>
        </div>
      </div>
      <div className="mt-4 text-center">
        <Link href={mapLink} className="text-[15px] font-medium text-[#007aff] hover:opacity-80 dark:text-[#0a84ff]">
          Istraži područje
        </Link>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V4: Horizontal Flow - Perfect for wider grids, image on left, data on right
// -----------------------------------------------------------------------------
export function DistrictCardV4({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="flex flex-row items-center gap-5 border-b border-slate-200 py-6 dark:border-slate-800">
      <div className="shrink-0">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <h4 className="truncate text-lg font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
          <span className="font-bold" style={{ color: bandColor }}>{d.score} bodova</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-[13px] text-slate-500">
          <span>{pct(d.avgReachableCells, totalGridCells)}% dosega</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>{d.population ? fmtHR(d.population, 0) : 0} stanovnika</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>{d.stops} stajališta</span>
        </div>
        <div className="mt-3 flex gap-2">
          {d.tramLines.slice(0, 5).map((l) => (
            <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">{l}</span>
          ))}
          {d.tramLines.length > 5 && <span className="text-[10px] text-slate-400">+{d.tramLines.length - 5}</span>}
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V5: Swiss Poster - Bold typography, harsh alignments, monochrome with 1 color
// -----------------------------------------------------------------------------
export function DistrictCardV5({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.05),2px_2px_0_rgba(0,0,0,1)] dark:bg-black dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),2px_2px_0_rgba(255,255,255,1)]">
      <div className="border-b-2 border-black pb-2 dark:border-white">
        <span className="text-5xl font-black tracking-tighter" style={{ color: bandColor }}>{d.score}</span>
      </div>
      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RANK {String(d.rank).padStart(2, '0')}</div>
        <h4 className="mt-1 text-2xl font-bold uppercase leading-none tracking-tight text-black dark:text-white">{d.name}</h4>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-y-4 text-[12px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
        <div>
          <span className="block text-[9px] text-slate-400">Doseg</span>
          <span className="font-bold text-black dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400">Stanovnika</span>
          <span className="font-bold text-black dark:text-white">{d.population ? fmtHR(d.population, 0) : "-"}</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400">Linija</span>
          <span className="font-bold text-black dark:text-white">{d.tramLines.length + d.busLines.length + (d.trainLines?.length ?? 0)}</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400">Interval</span>
          <span className="font-bold text-black dark:text-white">{Math.round(d.medianHeadwayMin)} MIN</span>
        </div>
      </div>
      <Link href={mapLink} className="mt-8 block bg-black py-2 text-center text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200">
        Karta
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V6: Soft Clean - Focus on spacing, light gray bg, white elements inside
// -----------------------------------------------------------------------------
export function DistrictCardV6({
  district: d,
  totalGridCells,
  bandColor,
  cityAvg,
}: DistrictCardProps) {
  return (
    <div className="rounded-2xl bg-slate-50 p-2 dark:bg-slate-800/50">
      <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Kvart #{d.rank}</span>
            <h4 className="text-xl font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${bandColor}15`, color: bandColor }}>
            <span className="text-lg font-bold">{d.score}</span>
          </div>
        </div>
        
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800">
            <span className="text-slate-500">Doseg</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}% vs {pct(cityAvg, totalGridCells)}%</span>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800">
            <span className="text-slate-500">Stajališta</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{d.stops}</span>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800">
            <span className="text-slate-500">Prosječno čekanje</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V7: Outline Style - Only lines, no backgrounds, purely structural
// -----------------------------------------------------------------------------
export function DistrictCardV7({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="flex flex-col border border-slate-300 bg-transparent dark:border-slate-700">
      <div className="flex items-stretch border-b border-slate-300 dark:border-slate-700">
        <div className="flex w-16 shrink-0 items-center justify-center border-r border-slate-300 text-xl font-light text-slate-400 dark:border-slate-700">
          {d.rank}
        </div>
        <div className="flex flex-1 items-center justify-between p-4">
          <h4 className="text-[17px] text-slate-900 dark:text-slate-100">{d.name}</h4>
          <span className="text-2xl font-light" style={{ color: bandColor }}>{d.score}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-300 border-b border-slate-300 text-center text-[12px] dark:divide-slate-700 dark:border-slate-700">
        <div className="p-3">
          <span className="block text-slate-500">Doseg</span>
          <span className="mt-1 block text-[15px] font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="p-3">
          <span className="block text-slate-500">Stan.</span>
          <span className="mt-1 block text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000,1)+'k' : '-'}</span>
        </div>
        <div className="p-3">
          <span className="block text-slate-500">Linije</span>
          <span className="mt-1 block text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.tramLines.length + d.busLines.length}</span>
        </div>
      </div>
      <Link href={mapLink} className="p-3 text-center text-[12px] tracking-wide text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        PRIKAŽI NA KARTI &rarr;
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V8: Notion Style - Sophisticated soft minimal, muted text, clean headers
// -----------------------------------------------------------------------------
export function DistrictCardV8({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-[18px] transition-colors hover:bg-[#f9f9f9] dark:border-[#333] dark:bg-[#191919] dark:hover:bg-[#222]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-6 w-6 shrink-0">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        </div>
        <h4 className="text-[15px] font-medium text-[#37352f] dark:text-[#ffffffe5]">{d.name}</h4>
      </div>
      
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-full rounded-sm bg-[#ececed] dark:bg-[#2b2b2b]">
            <div className="h-full rounded-sm" style={{ width: `${d.score}%`, backgroundColor: bandColor }} />
          </div>
          <span className="text-[13px] text-[#787774] dark:text-[#9b9b9b]">{d.score}/100</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-[13px] text-[#787774] dark:text-[#9b9b9b]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            Doseg
          </span>
          <span className="text-[#37352f] dark:text-[#ffffffe5]">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Stanovništvo
          </span>
          <span className="text-[#37352f] dark:text-[#ffffffe5]">{d.population ? fmtHR(d.population, 0) : "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M12 3v14"/><path d="M4 10h16"/><path d="M7 21l2-4"/><path d="M17 21l-2-4"/></svg>
            Tramvaj
          </span>
          <span className="text-[#37352f] dark:text-[#ffffffe5]">{d.tramLines.length > 0 ? d.tramLines.join(", ") : "Nema"}</span>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V9: Floating Badges - Pill-based layout, highly legible
// -----------------------------------------------------------------------------
export function DistrictCardV9({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <h4 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
        <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ backgroundColor: `${bandColor}15`, color: bandColor }}>
          #{d.rank}
        </span>
      </div>
      
      <div className="mt-5 flex flex-wrap gap-2">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">
          <span className="text-slate-400">Score</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{d.score}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">
          <span className="text-slate-400">Doseg</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">
          <span className="text-slate-400">Stan.</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000, 1) + 'k' : '-'}</span>
        </div>
      </div>

      <div className="mt-6">
        <Link href={mapLink} className="inline-block rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
          Vidi detalje
        </Link>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V10: Clean Modern Baseline - An evolution of the original, simply stripped down
// -----------------------------------------------------------------------------
export function DistrictCardV10({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="relative flex flex-col pt-2 pb-6 pl-4 transition-opacity hover:opacity-90">
      {/* Subtle indicator line instead of full border */}
      <div className="absolute left-0 top-2 bottom-6 w-[3px] rounded-full" style={{ backgroundColor: bandColor }} />
      
      <div className="flex items-start justify-between">
        <div>
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <h4 className="mt-3 text-[18px] font-medium tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
        </div>
        <div className="text-right">
          <span className="block text-3xl font-light tracking-tighter text-slate-900 dark:text-white">{d.score}</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Bodova</span>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Doseg grada</span>
          <span className="font-medium text-slate-900 dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Prosječno čekanje</span>
          <span className="font-medium text-slate-900 dark:text-white">~{Math.round(d.medianHeadwayMin)} min</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Linije</span>
          <span className="font-medium text-slate-900 dark:text-white">{d.tramLines.length + d.busLines.length + (d.trainLines?.length ?? 0)}</span>
        </div>
      </div>

      <div className="mt-5">
        <Link href={mapLink} className="text-[12px] font-medium text-slate-400 hover:text-slate-900 dark:hover:text-white">
          Istraži &rarr;
        </Link>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V11: V1 Airy - Larger padding, more whitespace, elegant typography
// -----------------------------------------------------------------------------
export function DistrictCardV11({
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
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <div>
            <h4 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
            <div className="text-[13px] text-slate-500">Kvart rangiran #{d.rank}</div>
          </div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800">
          <span className="text-xl font-bold tracking-tighter" style={{ color: bandColor }}>{d.score}</span>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between text-[14px]">
        <div className="flex flex-col gap-1">
          <span className="text-slate-500">Stanovnika</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population, 0) : "-"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-500">Stajališta</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{d.stops}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-500">Interval</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">~{Math.round(d.medianHeadwayMin)}m</span>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex justify-between text-[13px]">
          <span className="text-slate-500">Doseg grada</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-slate-50 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
          <div className="absolute inset-y-0 w-[2px] bg-slate-300 dark:bg-slate-600" style={{ left: `${cityReachPctNum}%` }} />
        </div>
      </div>

      <Link href={mapLink} className="mt-8 text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
        Detalji kvarta &rarr;
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V12: V6 Minimal Line - Same inner card concept, but with a colorful top border
// -----------------------------------------------------------------------------
export function DistrictCardV12({
  district: d,
  totalGridCells,
  bandColor,
  cityAvg,
}: DistrictCardProps) {
  return (
    <div className="rounded-2xl bg-slate-50 p-[6px] dark:bg-slate-800/40">
      <div 
        className="flex flex-col rounded-[14px] bg-white p-5 shadow-sm dark:bg-slate-900"
        style={{ borderTop: `4px solid ${bandColor}` }}
      >
        <div className="flex items-end justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h4 className="text-[19px] font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
          </div>
          <div className="text-right">
            <span className="text-2xl font-semibold tracking-tight" style={{ color: bandColor }}>{d.score}</span>
          </div>
        </div>
        
        <div className="mt-4 space-y-3 text-[14px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Doseg</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Stajališta</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{d.stops}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Čekanje</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V13: V1 Glass - Elegant translucent background (looks best on colored maps/bg)
// -----------------------------------------------------------------------------
export function DistrictCardV13({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
      <div className="flex items-center gap-3">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <div className="flex-1">
          <h4 className="text-[17px] font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
        </div>
        <span className="text-xl font-bold" style={{ color: bandColor }}>{d.score}</span>
      </div>

      <div className="mt-6 flex gap-4 text-[13px]">
        <div className="flex-1 rounded-lg bg-white/50 p-3 shadow-sm dark:bg-black/20">
          <div className="text-slate-500 mb-1">Doseg</div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</div>
        </div>
        <div className="flex-1 rounded-lg bg-white/50 p-3 shadow-sm dark:bg-black/20">
          <div className="text-slate-500 mb-1">Čekanje</div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</div>
        </div>
      </div>

      <Link href={mapLink} className="mt-5 block text-center text-[12px] font-medium tracking-wide text-slate-500 hover:text-slate-900 dark:hover:text-white">
        PRIKAŽI DETALJE
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V14: V6 Structured Grid - Rigid grid inside the soft gray container
// -----------------------------------------------------------------------------
export function DistrictCardV14({
  district: d,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
        <div className="col-span-2 bg-white p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h4 className="text-[16px] font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
            <span className="font-mono text-lg font-semibold" style={{ color: bandColor }}>{d.score}</span>
          </div>
        </div>
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500">Doseg</span>
          <span className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500">Stanovnika</span>
          <span className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000,1)+'k' : '-'}</span>
        </div>
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500">Interval</span>
          <span className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
        </div>
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500">Linije</span>
          <span className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.tramLines.length + d.busLines.length}</span>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V15: V1 Typographic - Stripped down, no icons, text forms the layout
// -----------------------------------------------------------------------------
export function DistrictCardV15({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-baseline gap-4">
        <span className="text-[13px] font-medium text-slate-400">#{d.rank}</span>
        <h4 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
      </div>
      
      <div className="mt-4 flex items-end justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="text-[13px] leading-relaxed text-slate-500">
          Doseg: <strong className="font-medium text-slate-900 dark:text-slate-200">{pct(d.avgReachableCells, totalGridCells)}%</strong> <br/>
          Stanice: <strong className="font-medium text-slate-900 dark:text-slate-200">{d.stops}</strong> <br/>
          Populacija: <strong className="font-medium text-slate-900 dark:text-slate-200">{d.population ? fmtHR(d.population/1000, 1) + 'k' : '-'}</strong>
        </div>
        <div className="text-[32px] font-light leading-none tracking-tighter" style={{ color: bandColor }}>
          {d.score}
        </div>
      </div>
      
      <Link href={mapLink} className="mt-4 inline-block text-[12px] font-medium tracking-widest text-slate-400 uppercase transition-colors hover:text-slate-900 dark:hover:text-white">
        Prikaži Detalje
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V16: V6 Elevated - Outer frame acts as a pedestal for a floating inner card
// -----------------------------------------------------------------------------
export function DistrictCardV16({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="rounded-[20px] bg-slate-100/50 p-3 pt-6 dark:bg-slate-800/30">
      <div className="relative -mt-8 rounded-[16px] border border-slate-200/50 bg-white p-5 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
          <span className="rounded bg-slate-100 px-2 py-1 text-sm font-bold dark:bg-slate-800" style={{ color: bandColor }}>{d.score}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-y-3 text-[13px]">
          <div>
            <span className="text-slate-400">Doseg</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</div>
          </div>
          <div>
            <span className="text-slate-400">Čekanje</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)} min</div>
          </div>
          <div>
            <span className="text-slate-400">Stanovnika</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000,1)+'k' : '-'}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-center">
        <Link href={mapLink} className="text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
          Otvori kartu
        </Link>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V17: V1 Precision - Strict divider lines, highly organized data
// -----------------------------------------------------------------------------
export function DistrictCardV17({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <h4 className="font-sans text-[16px] font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
        </div>
        <span className="text-xl font-semibold" style={{ color: bandColor }}>{d.score}</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        <div className="flex flex-col items-center justify-center p-3 text-center">
          <span className="text-[11px] text-slate-500">Doseg</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="flex flex-col items-center justify-center p-3 text-center">
          <span className="text-[11px] text-slate-500">Stajališta</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{d.stops}</span>
        </div>
        <div className="flex flex-col items-center justify-center p-3 text-center">
          <span className="text-[11px] text-slate-500">Interval</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
        </div>
      </div>
      <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
        <span className="text-[12px] text-slate-500">
          Glavne linije: <span className="font-medium text-slate-700 dark:text-slate-300">{d.tramLines.slice(0,4).join(", ") || "Nema"}</span>
        </span>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V18: V6 Data Dense - Split layout inside the soft container
// -----------------------------------------------------------------------------
export function DistrictCardV18({
  district: d,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="rounded-2xl bg-slate-50 p-[6px] dark:bg-slate-800/50">
      <div className="flex overflow-hidden rounded-[14px] bg-white shadow-sm dark:bg-slate-900">
        <div className="flex w-1/2 flex-col justify-between border-r border-slate-100 p-4 dark:border-slate-800">
          <div>
            <span className="text-[11px] font-medium text-slate-400">#{d.rank}</span>
            <h4 className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
          </div>
          <div className="mt-6">
            <span className="text-3xl font-bold tracking-tight" style={{ color: bandColor }}>{d.score}</span>
          </div>
        </div>
        <div className="flex w-1/2 flex-col justify-center divide-y divide-slate-50 text-[12px] dark:divide-slate-800/50">
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-500">Doseg</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-500">Stanovnika</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000,1)+'k' : '-'}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-500">Čekanje</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        <Link href={mapLink} className="text-[12px] font-medium text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
          Istraži na karti &rarr;
        </Link>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V19: V1 Soft Shadow - Extremely soft styling, pastel-like presence
// -----------------------------------------------------------------------------
export function DistrictCardV19({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform hover:-translate-y-1 dark:bg-slate-900 dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
      <div className="flex items-center gap-4">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <div className="flex-1">
          <h4 className="text-[18px] font-medium text-slate-800 dark:text-slate-200">{d.name}</h4>
          <span className="text-[13px] text-slate-400">Indeks: {d.score}</span>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-slate-50/80 p-4 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-slate-500">Pokrivenost grada</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full" style={{ width: `${(d.avgReachableCells / totalGridCells) * 100}%`, backgroundColor: bandColor }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Stajališta: <span className="text-slate-700 dark:text-slate-300">{d.stops}</span></span>
          <span className="text-slate-500">Interval: <span className="text-slate-700 dark:text-slate-300">~{Math.round(d.medianHeadwayMin)}m</span></span>
        </div>
      </div>
    </div>
  )
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
      {(d.trainBoostPct ?? 0) > 0 && renderBoost("S HŽ Vlakovima", d.trainBoostPct!, d.trainAvgReachableCells ?? d.avgReachableCells, "text-teal-600 dark:text-teal-400", "bg-teal-100 dark:bg-teal-900/30", "bg-teal-500 dark:bg-teal-400")}
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
// V21: V1 Data Dense - V1 clean styling, but packed with all the rich data
// -----------------------------------------------------------------------------
export function DistrictCardV21({
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
    <div className="flex flex-col rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <div>
            <h4 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
            <div className="text-[13px] text-slate-500">{d.score} bodova</div>
          </div>
        </div>
      </div>

      <DenseSpecialBadges d={d} />

      <div className="mt-5 flex gap-4 text-[12px] text-slate-600 dark:text-slate-400">
        <div><strong>{d.population ? fmtHR(d.population/1000, 1)+'k' : '-'}</strong> stan.</div>
        <div><strong>{d.stops}</strong> stajališta</div>
        <div><strong>~{Math.round(d.medianHeadwayMin)}m</strong> int.</div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="mb-2 flex justify-between text-[11px] uppercase tracking-wider text-slate-500">
          <span>Doseg</span>
          <span className="font-semibold text-slate-900 dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="relative h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
          <div className="absolute inset-y-0 w-px bg-slate-900 dark:bg-white" style={{ left: `${cityReachPctNum}%` }} />
        </div>
        
        <DenseBoostBars d={d} totalGridCells={totalGridCells} />
      </div>

      <DenseLinesList d={d} />

      <Link href={mapLink} className="mt-5 text-[12px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
        Detalji &rarr;
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V22: V6 Data Rich - Soft container, inner white card, extremely data-rich
// -----------------------------------------------------------------------------
export function DistrictCardV22({
  district: d,
  totalGridCells,
  bandColor,
  cityAvg,
}: DistrictCardProps) {
  return (
    <div className="rounded-2xl bg-slate-50 p-2 dark:bg-slate-800/50">
      <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">#{d.rank}</span>
            <h4 className="text-xl font-medium text-slate-900 dark:text-slate-100">{d.name}</h4>
          </div>
          <span className="text-2xl font-bold tracking-tight" style={{ color: bandColor }}>{d.score}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-[12px] mb-4">
          <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
            <div className="text-slate-500">Stan.</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000, 1)+'k' : '-'}</div>
          </div>
          <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
            <div className="text-slate-500">Stanice</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{d.stops}</div>
          </div>
          <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
            <div className="text-slate-500">Interval</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</div>
          </div>
        </div>

        <DenseSpecialBadges d={d} />
        
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex justify-between text-[13px] mb-1">
            <span className="text-slate-500">Doseg</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.avgReachableCells/totalGridCells)*100}%`, backgroundColor: bandColor }} />
            <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${(cityAvg/totalGridCells)*100}%` }} />
          </div>
          <DenseBoostBars d={d} totalGridCells={totalGridCells} />
        </div>

        <DenseLinesList d={d} />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V23: V1 Comprehensive Dashboard - Clean grid internally, shows everything
// -----------------------------------------------------------------------------
export function DistrictCardV23({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <div className="flex-1">
          <h4 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
          <span className="text-[12px] text-slate-500">{d.score} bodova</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[10px] uppercase text-slate-500">Populacija / Stanice</span>
          <span className="mt-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100">
            {d.population ? fmtHR(d.population/1000, 1)+'k' : '-'} / {d.stops}
          </span>
        </div>
        <div className="bg-white p-3 dark:bg-slate-900">
          <span className="block text-[10px] uppercase text-slate-500">Prosj. Interval</span>
          <span className="mt-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100">
            {Math.round(d.medianHeadwayMin)} minuta
          </span>
        </div>
        <div className="col-span-2 bg-white p-3 dark:bg-slate-900">
          <span className="block text-[10px] uppercase text-slate-500 mb-2">Specifičnosti</span>
          <DenseSpecialBadges d={d} />
        </div>
        <div className="col-span-2 bg-white p-3 dark:bg-slate-900">
          <span className="block text-[10px] uppercase text-slate-500 mb-1">Doseg & Potencijali</span>
          <div className="flex justify-between text-[13px] font-medium text-slate-900 dark:text-slate-100">
            <span>Osnovno</span>
            <span>{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <DenseBoostBars d={d} totalGridCells={totalGridCells} />
        </div>
        <div className="col-span-2 bg-white p-3 dark:bg-slate-900">
          <DenseLinesList d={d} />
        </div>
      </div>
      
      <Link href={mapLink} className="block border-t border-slate-100 bg-slate-50 p-3 text-center text-[12px] font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800">
        Otvori kartu
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// V24: V6 Expanded Vertical - Soft aesthetic, heavily stacked with data
// -----------------------------------------------------------------------------
export function DistrictCardV24({
  district: d,
  totalGridCells,
  bandColor,
}: DistrictCardProps) {
  return (
    <div className="rounded-3xl bg-slate-100/50 p-3 dark:bg-slate-800/30">
      <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">#{d.rank}</span>
            <h4 className="mt-2 text-[22px] font-medium tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
          </div>
          <span className="text-3xl font-light" style={{ color: bandColor }}>{d.score}</span>
        </div>

        <div className="mt-6 flex divide-x divide-slate-100 dark:divide-slate-800">
          <div className="flex-1 pr-3">
            <span className="block text-[11px] text-slate-400">Doseg</span>
            <span className="text-[16px] font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="flex-1 px-3 text-center">
            <span className="block text-[11px] text-slate-400">Stan.</span>
            <span className="text-[16px] font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000, 1)+'k' : '-'}</span>
          </div>
          <div className="flex-1 pl-3 text-right">
            <span className="block text-[11px] text-slate-400">Interval</span>
            <span className="text-[16px] font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)}m</span>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <DenseSpecialBadges d={d} />
          <div className="mt-3">
            <DenseBoostBars d={d} totalGridCells={totalGridCells} />
          </div>
        </div>

        <DenseLinesList d={d} />
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
            <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000, 1)+'k' : '-'}</div>
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

// -----------------------------------------------------------------------------
// V26: The Refined Crammed Fix - Spaced out, shadowless, elegant
// -----------------------------------------------------------------------------
export function DistrictCardV26({
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
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      
      {/* Header with Emblem */}
      <div className="flex items-center gap-4 p-6 pb-5">
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <div>
          <h4 className="mb-1 text-[20px] font-medium leading-tight tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
          <div className="text-[14px] font-medium" style={{ color: bandColor }}>{d.score} bodova</div>
        </div>
      </div>

      {/* Dense Stats Grid */}
      <div className="px-6">
        <div className="flex justify-between gap-3 text-center">
          <div className="flex-1 rounded-3xl bg-slate-50/50 py-3 dark:bg-slate-800/30">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Stan.</div>
            <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population/1000, 1)+'k' : '-'}</div>
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


// -----------------------------------------------------------------------------
// V27: Another V21/V22 Mix - Outer padding, pure white card, distinct header
// -----------------------------------------------------------------------------
export function DistrictCardV27({
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
    <div className="rounded-[24px] bg-slate-100/60 p-2.5 dark:bg-slate-800/30">
      <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-sm dark:bg-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3.5">
            <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kvart</span>
              <h4 className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold tracking-tight" style={{ color: bandColor }}>{d.score}</span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400">Indeks</span>
          </div>
        </div>

        {/* Special badges */}
        <DenseSpecialBadges d={d} />

        {/* Stats inline */}
        <div className="my-5 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>{d.population ? fmtHR(d.population / 1000, 1) + "k stan." : "-"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>{d.stops} stajališta</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>~{Math.round(d.medianHeadwayMin)}m int.</span>
          </div>
        </div>

        {/* Reach */}
        <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="mb-2 flex justify-between text-[12px] font-medium">
            <span className="text-slate-500">Doseg</span>
            <span className="text-slate-900 dark:text-white">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
            <div className="absolute inset-y-0 w-px bg-slate-900 dark:bg-white" style={{ left: `${cityReachPctNum}%` }} />
          </div>
          
          <DenseBoostBars d={d} totalGridCells={totalGridCells} />
        </div>

        <DenseLinesList d={d} />

        <Link href={mapLink} className="mt-5 rounded-lg bg-slate-50 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white">
          Istraži područje
        </Link>
      </div>
    </div>
  )
}

export function DistrictCardV25({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  return (
    <div className="flex flex-col border border-slate-200 bg-white transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex p-5">
        <div className="mr-4 shrink-0">
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
            <span className="text-[18px] font-bold" style={{ color: bandColor }}>{d.score}</span>
          </div>
          <DenseSpecialBadges d={d} />
        </div>
      </div>

      <div className="border-t border-slate-100 p-5 dark:border-slate-800">
        <div className="mb-4 grid grid-cols-3 gap-4 text-[12px]">
          <div>
            <span className="text-slate-500">Populacija</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{d.population ? fmtHR(d.population, 0) : "-"}</div>
          </div>
          <div>
            <span className="text-slate-500">Stajališta</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{d.stops}</div>
          </div>
          <div>
            <span className="text-slate-500">Prosj. Interval</span>
            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{Math.round(d.medianHeadwayMin)} min</div>
          </div>
        </div>

        <div className="mb-1 flex justify-between text-[12px] font-medium text-slate-900 dark:text-slate-100">
          <span>Osnovni Doseg</span>
          <span>{pct(d.avgReachableCells, totalGridCells)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full" style={{ width: `${(d.avgReachableCells/totalGridCells)*100}%`, backgroundColor: bandColor }} />
        </div>
        <DenseBoostBars d={d} totalGridCells={totalGridCells} />
      </div>

      <div className="border-t border-slate-100 p-5 pt-4 dark:border-slate-800">
        <DenseLinesList d={d} />
      </div>

      <Link href={mapLink} className="bg-slate-50 p-3 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800/80">
        Prikaži Kvart
      </Link>
    </div>
  )
}

export function DistrictCardV20({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  mapLink,
}: DistrictCardProps) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100

  return (
    <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/30">
      <div className="rounded-[16px] bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="scale-90 origin-left">
              <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
            </div>
            <div>
              <h4 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</h4>
              <span className="text-[12px] text-slate-500">{d.score} bodova</span>
            </div>
          </div>
        </div>

        <div className="mt-5 mb-4">
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="text-slate-500">Doseg</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{pct(d.avgReachableCells, totalGridCells)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {d.stops} stajališta
          </span>
          <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {Math.round(d.medianHeadwayMin)}m int.
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <Link href={mapLink} className="inline-block text-[12px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
          Istraži &rarr;
        </Link>
      </div>
    </div>
  )
}

