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

const SECTION_IDS = [
  "promet-danas",
  "pouzdanost",
  "povezanost",
  "bajs",
  "analiza",
] as const

export function SectionGroup({
  id,
  number,
  eyebrow,
  title,
  description,
  children,
}: {
  id: (typeof SECTION_IDS)[number]
  number: number
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="relative mt-20 scroll-mt-24 pt-6 sm:mt-28">
      <div className="absolute inset-x-0 top-0 flex">
        <div className="h-[2px] w-12 bg-zg-blue" />
        <div className="mt-px h-px flex-1 bg-hairline-strong" />
      </div>
      <p className="flex gap-2 font-mono text-label lowercase">
        <span className="text-zg-blue">{String(number).padStart(2, "0")}</span>
        <span className="text-ink-faint">{eyebrow}</span>
      </p>
      <StatGroupTitle className="mt-1">{title}</StatGroupTitle>
      <StatGroupLead className="mt-2">{description}</StatGroupLead>
      {children}
    </div>
  )
}

export function EditorialStat({
  value,
  note,
  detail,
}: {
  value: string
  note?: string
  detail?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-hairline-strong py-4 sm:px-5 sm:[&:not(:nth-child(3n))]:border-r sm:[&:not(:nth-child(3n))]:border-r-hairline sm:[&:nth-child(3n+1)]:pl-0">
      <div className="flex items-baseline">
        <StatKpiValue>{value}</StatKpiValue>
        {note && <StatKpiNote>{note}</StatKpiNote>}
      </div>
      {detail && <StatKpiCaption>{detail}</StatKpiCaption>}
    </div>
  )
}

const sectionIconPaths = {
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
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
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
  bolt: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  "circle-down": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 10-4 4-4-4" />
    </>
  ),
}

function SectionIconSvg({ icon }: { icon: keyof typeof sectionIconPaths }) {
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
      {sectionIconPaths[icon]}
    </svg>
  )
}

export function SectionIcon({
  icon,
  title,
}: {
  icon: keyof typeof sectionIconPaths
  title: string
}) {
  return (
    <div className="mb-6 flex items-center gap-3 text-ink-muted">
      <SectionIconSvg icon={icon} />
      <StatModuleTitle>{title}</StatModuleTitle>
    </div>
  )
}

function RankingListItem({
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
      <span className="w-5 shrink-0 text-right font-mono text-label text-ink-faint tabular-nums">
        {i + 1}.
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-body text-ink">{d.name}</span>
          <span
            className={`shrink-0 font-sans text-body tabular-nums ${color.text}`}
          >
            {label(d)}
          </span>
        </div>
        <div className={`relative h-1.5 w-full overflow-hidden ${color.bg}`}>
          <div
            className={`absolute inset-y-0 left-0 ${color.bar}`}
            style={{ width: `${(value(d) / maxVal) * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 font-mono text-label text-ink-faint tabular-nums">
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
  items: Array<DistrictScore>
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

export function BackLink() {
  return (
    <Link
      href="/karta"
      className="inline-flex items-center gap-1.5 font-mono text-label text-zg-blue transition-colors duration-150 hover:text-navy"
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
          className="absolute inset-0 border"
          style={{ borderColor: color }}
        />
      )}
      <span className="relative z-10 inline-flex min-w-7 items-center justify-center px-2 py-1 font-sans text-body text-ink tabular-nums">
        {rank}
      </span>
    </div>
  )
}

function DistrictEmblemSvg({
  pathData,
  color,
}: {
  pathData: string
  color: string
}) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      className="absolute inset-0 overflow-visible"
      aria-hidden="true"
    >
      <path
        d={pathData}
        fill="none"
        fillRule="evenodd"
        stroke={color}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}
