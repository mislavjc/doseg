import Link from "next/link"
import type { District as DistrictScore } from "@/lib/generated"
import {
  StatKpiCaption,
  StatKpiNote,
  StatKpiValue,
  StatGroupLead,
  StatGroupTitle,
  StatModuleTitle,
} from "./stat-typography"

const sectionAccents: Record<string, { gradient: string; eyebrowColor: string }> = {
  "promet-danas": {
    gradient: "from-emerald-400 to-teal-500 dark:from-emerald-500 dark:to-teal-600",
    eyebrowColor: "text-emerald-600 dark:text-emerald-400",
  },
  pouzdanost: {
    gradient: "from-sky-400 to-blue-500 dark:from-sky-500 dark:to-blue-600",
    eyebrowColor: "text-sky-600 dark:text-sky-400",
  },
  povezanost: {
    gradient: "from-violet-400 to-purple-500 dark:from-violet-500 dark:to-purple-600",
    eyebrowColor: "text-violet-600 dark:text-violet-400",
  },
  bajs: {
    gradient: "from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600",
    eyebrowColor: "text-amber-600 dark:text-amber-400",
  },
  analiza: {
    gradient: "from-rose-400 to-pink-500 dark:from-rose-500 dark:to-pink-600",
    eyebrowColor: "text-rose-600 dark:text-rose-400",
  },
}

export function SectionGroup({
  id,
  number,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  number: number
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  const accent = sectionAccents[id] ?? sectionAccents["analiza"]
  const numLabel = String(number).padStart(2, "0")

  return (
    <div
      id={id}
      className="relative mt-24 scroll-mt-28 pt-14 sm:mt-32 sm:pt-16"
    >
      <div className="absolute inset-x-0 top-0 flex items-center gap-0">
        <div
          className={`h-[2px] w-12 rounded-full bg-gradient-to-r ${accent.gradient}`}
        />
        <div className="h-px flex-1 bg-slate-200/80 dark:bg-white/[0.08]" />
      </div>

      <div className="relative">
        <span
          className="pointer-events-none absolute -top-2 right-0 select-none font-sans text-[96px] font-bold leading-none tracking-tighter text-slate-900/[0.04] sm:text-[120px] dark:text-white/[0.04]"
          aria-hidden="true"
        >
          {numLabel}
        </span>

        <p
          className={`mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.15em] ${accent.eyebrowColor}`}
        >
          {numLabel} &mdash; {eyebrow}
        </p>

        <div className="mb-4">
          <StatGroupTitle>{title}</StatGroupTitle>
        </div>

        <StatGroupLead>{description}</StatGroupLead>
      </div>

      {children}
    </div>
  )
}

export function EditorialStat({
  value,
  note,
  detail,
  valueColor = "text-[#171717] dark:text-[#ededed]",
}: {
  value: string
  note?: string
  detail?: string
  valueColor?: string
}) {
  return (
    <div className="flex min-h-[160px] flex-col justify-between rounded-sm bg-[#f5f5f5] p-6 sm:min-h-[200px] lg:p-8 dark:bg-[#1a1a1a]">
      <div className="flex items-baseline gap-1">
        <StatKpiValue className={valueColor}>{value}</StatKpiValue>
        {note && <StatKpiNote className={valueColor}>{note}</StatKpiNote>}
      </div>
      {detail && (
        <StatKpiCaption className="text-slate-600 dark:text-slate-400">
          {detail}
        </StatKpiCaption>
      )}
    </div>
  )
}

export const sectionColorMap: Record<string, string> = {
  slate: "text-slate-800 dark:text-slate-200",
  rose: "text-rose-800 dark:text-rose-200",
  emerald: "text-emerald-800 dark:text-emerald-200",
  teal: "text-teal-800 dark:text-teal-200",
  violet: "text-violet-800 dark:text-violet-200",
  red: "text-red-800 dark:text-red-200",
  amber: "text-amber-800 dark:text-amber-200",
  sky: "text-sky-800 dark:text-sky-200",
  blue: "text-blue-800 dark:text-blue-200",
  orange: "text-orange-800 dark:text-orange-200",
  indigo: "text-indigo-800 dark:text-indigo-200",
}

export const sectionBgMap: Record<string, string> = {
  slate: "dark:bg-white/10",
  rose: "dark:bg-rose-500/20",
  emerald: "dark:bg-emerald-500/20",
  teal: "dark:bg-teal-500/20",
  violet: "dark:bg-violet-500/20",
  red: "dark:bg-red-500/20",
  amber: "dark:bg-amber-500/20",
  sky: "dark:bg-sky-500/20",
  blue: "dark:bg-blue-500/20",
  orange: "dark:bg-orange-500/20",
  indigo: "dark:bg-indigo-500/20",
}

export function SectionIconSvg({ icon }: { icon: string }) {
  const paths: Record<string, React.ReactNode> = {
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    ),
    warning: (
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
    tram: (
      <>
        <rect x="4" y="3" width="16" height="14" rx="2" />
        <path d="M12 3v14" />
        <path d="M4 10h16" />
        <path d="M7 21l2-4" />
        <path d="M17 21l-2-4" />
      </>
    ),
    flag: (
      <>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
    venn: (
      <>
        <circle cx="7.5" cy="7.5" r="5.5" />
        <circle cx="16.5" cy="16.5" r="5.5" />
      </>
    ),
    moon: (
      <>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    bars: (
      <>
        <path d="M2 20h.01" />
        <path d="M7 20v-4" />
        <path d="M12 20v-8" />
        <path d="M17 20V8" />
        <path d="M22 4v16" />
      </>
    ),
    bolt: (
      <>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </>
    ),
    "circle-down": (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m16 10-4 4-4-4" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[icon]}
    </svg>
  )
}

export function SectionIcon({
  icon,
  color,
  title,
}: {
  icon: string
  color: string
  title: string
}) {
  return (
    <div
      className={`mb-6 flex items-center gap-3 ${sectionColorMap[color] ?? ""}`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full bg-white ${sectionBgMap[color] ?? ""}`}
      >
        <SectionIconSvg icon={icon} />
      </span>
      <StatModuleTitle className="text-[22px] sm:text-[22px]">
        {title}
      </StatModuleTitle>
    </div>
  )
}

export function RankingListItem({
  d,
  i,
  maxVal,
  value,
  label,
  trailing,
  color,
}: {
  d: DistrictScore
  i: number
  maxVal: number
  value: (d: DistrictScore) => number
  label: (d: DistrictScore) => string
  trailing: (d: DistrictScore) => string
  color: { text: string; bg: string; bar: string }
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-right font-sans text-[13px] tracking-tight text-slate-400 tabular-nums">
        {i + 1}.
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">
            {d.name}
          </span>
          <span
            className={`shrink-0 font-sans text-[15px] font-medium tracking-tight tabular-nums ${color.text}`}
          >
            {label(d)}
          </span>
        </div>
        <div
          className={`relative h-1.5 w-full overflow-hidden rounded-full ${color.bg}`}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${color.bar}`}
            style={{ width: `${(value(d) / maxVal) * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
        {trailing(d)}
      </span>
    </div>
  )
}

export function RankingList({
  items,
  value,
  label,
  trailing,
  color,
}: {
  items: DistrictScore[]
  value: (d: DistrictScore) => number
  label: (d: DistrictScore) => string
  trailing: (d: DistrictScore) => string
  color: { text: string; bg: string; bar: string }
}) {
  const maxVal = items.length > 0 ? value(items[0]) : 1
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((d, i) => (
        <RankingListItem
          key={d.osmId}
          d={d}
          i={i}
          maxVal={maxVal}
          value={value}
          label={label}
          trailing={trailing}
          color={color}
        />
      ))}
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-slate-50 px-2 pt-12 pb-6 font-sans text-[#171717] selection:bg-purple-100 sm:px-6 sm:pt-20">
      {children}
    </div>
  )
}

export function ScoreRing({
  score,
  accent,
  size,
}: {
  score: number
  accent: string
  size: "sm" | "lg"
}) {
  const radius = size === "sm" ? 16 : 24
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  const viewBox = size === "sm" ? "0 0 40 40" : "0 0 64 64"
  const cx = size === "sm" ? 20 : 32
  const cy = size === "sm" ? 20 : 32
  const sw = size === "sm" ? 3 : 4
  const containerClass =
    size === "sm"
      ? "relative flex h-11 w-11 shrink-0 items-center justify-center"
      : "relative flex h-16 w-16 shrink-0 items-center justify-center"
  const textClass =
    size === "sm"
      ? "block font-sans tracking-tight text-[15px] leading-none text-slate-900 dark:text-white"
      : "block font-sans tracking-tight text-[20px] leading-none text-slate-900 dark:text-white"
  return (
    <div className={containerClass}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full -rotate-90"
        viewBox={viewBox}
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          className="text-black/5 dark:text-white/10"
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
        />
      </svg>
      <div className="flex flex-col items-center text-center">
        <span className={textClass}>{score}</span>
      </div>
    </div>
  )
}

export function BackLink() {
  return (
    <Link
      href="/"
      className="mb-16 inline-flex items-center gap-2 text-[13px] font-medium text-[#a3a3a3] lowercase transition-colors duration-150 hover:text-[#171717]"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8l4-4" />
      </svg>
      natrag na kartu
    </Link>
  )
}

export function DistrictEmblem({
  pathData,
  rank,
  color,
}: {
  pathData?: string
  rank: number
  color: string
}) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      {pathData ? (
        <DistrictEmblemSvg pathData={pathData} color={color} />
      ) : (
        <div
          className="absolute inset-0 rounded-2xl border"
          style={{ borderColor: color, backgroundColor: `${color}1a` }}
        />
      )}
      <span className="relative z-10 inline-flex min-w-7 items-center justify-center px-2 py-1 font-sans text-[15px] tracking-tight text-slate-900 tabular-nums dark:text-white">
        {rank}
      </span>
    </div>
  )
}

export function DistrictEmblemSvg({
  pathData,
  color,
}: {
  pathData: string
  color: string
}) {
  return (
    <>
      <div
        className="absolute inset-[11px] rounded-full blur-[10px]"
        style={{ backgroundColor: `${color}18` }}
      />
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <path
          d={pathData}
          fill={`${color}14`}
          fillRule="evenodd"
          stroke={color}
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      </svg>
    </>
  )
}
