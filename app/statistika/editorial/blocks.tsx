import {
  IconArrowLeft,
  IconArrowRight,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { Body, Eyebrow, Hook } from "./primitives"

/**
 * Composite blocks shared across the editorial pSEO pages (linije, kvartovi,
 * stanice). Built from the primitives kit; one implementation each so the
 * line/stop/kvart pages stay visually identical instead of re-rolling markup.
 */

// ── Section header (eyebrow + hook + lede) ──────────────────────────────────

export function SectionHeader({
  eyebrow,
  accent = false,
  hook,
  children,
  className,
}: {
  eyebrow: ReactNode
  /** Blue eyebrow — elevates a section as the star (e.g. kvart scorecard). */
  accent?: boolean
  hook: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("pb-8", className)}>
      <Eyebrow className={accent ? "text-zg-blue" : undefined}>{eyebrow}</Eyebrow>
      <Hook className="mt-4">{hook}</Hook>
      {children && (
        <Body className="mt-3 max-w-[520px] text-ink-muted">{children}</Body>
      )}
    </header>
  )
}

// ── Fact row (dotted-leader "label …… value") ───────────────────────────────

export function FactRow({
  label,
  value,
  href,
  divided = false,
}: {
  label: string
  value: string
  /** Links the value (e.g. a stop's kvart → the kvart page). */
  href?: string
  /** Bottom hairline per row (drops on the last) — for bordered fact lists. */
  divided?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 py-[9px]",
        divided && "border-b border-hairline last:border-b-0"
      )}
    >
      <span className="shrink-0 font-heros text-body text-ink-muted">{label}</span>
      <span className="h-[13px] min-w-0 flex-1 border-b border-dotted border-hairline-strong" />
      {href ? (
        <Link
          href={href}
          className="shrink-0 font-mono text-body text-zg-blue transition-colors hover:text-navy"
        >
          {value}
        </Link>
      ) : (
        <span className="shrink-0 font-mono text-body text-ink">{value}</span>
      )}
    </div>
  )
}

// ── Breadcrumb (mono trail at the top of a page) ────────────────────────────

export function Breadcrumb({
  trail,
}: {
  trail: { label: string; href?: string }[]
}) {
  return (
    <p className="font-mono text-label text-ink-faint">
      {trail.map((seg, i) => (
        <span key={`${seg.label}-${i}`}>
          {i > 0 && " / "}
          {seg.href ? (
            <Link
              href={seg.href}
              className="text-zg-blue transition-colors hover:text-navy"
            >
              {seg.label}
            </Link>
          ) : (
            seg.label
          )}
        </span>
      ))}
    </p>
  )
}

// ── Line-number badge (tram = filled blue, bus = outline) ───────────────────

export function LineBadge({
  broj,
  mode,
  href,
}: {
  broj: string
  /** Omit for the always-filled inline badge used in list rows. */
  mode?: "tram" | "bus"
  href?: string
}) {
  const outline = mode === "bus"
  const cls = cn(
    "flex h-6 min-w-[34px] shrink-0 items-center justify-center px-1.5 font-mono text-label",
    outline
      ? "border border-zg-blue bg-white text-zg-blue"
      : "bg-zg-blue text-white"
  )
  const title = mode ? `${mode === "tram" ? "tramvaj" : "autobus"} ${broj}` : undefined
  return href ? (
    <Link href={href} className={cls} title={title}>
      {broj}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {broj}
    </span>
  )
}

// ── Pill link (outline chip; muted = non-clickable) ─────────────────────────

export function PillLink({
  href,
  children,
  muted = false,
}: {
  href?: string
  children: ReactNode
  muted?: boolean
}) {
  const base = "px-3.5 py-1.5 font-mono text-[16px] leading-5 transition-colors"
  if (href && !muted) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "border border-zg-blue text-zg-blue hover:bg-zg-blue hover:text-white"
        )}
      >
        {children}
      </Link>
    )
  }
  return (
    <span className={cn(base, "border border-hairline-strong text-ink-muted")}>
      {children}
    </span>
  )
}

// ── Prev / next pager ───────────────────────────────────────────────────────

/** `value` is the optional trailing/leading text (e.g. a line number); the
 * directional arrow is always a central icon. */
type PagerLink = { href: string; label: string; value?: string }

export function PrevNext({
  prev,
  next,
}: {
  prev?: PagerLink | null
  next?: PagerLink | null
}) {
  const value =
    "flex items-center gap-1 font-mono text-[16px] leading-6 text-zg-blue transition-colors group-hover:text-navy"
  return (
    <nav className="flex items-start justify-between">
      {prev ? (
        <Link href={prev.href} className="group flex flex-col gap-0.5">
          <span className="font-mono text-label text-ink-faint">{prev.label}</span>
          <span className={value}>
            <IconArrowLeft size={16} className="shrink-0" />
            {prev.value}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-0.5"
        >
          <span className="font-mono text-label text-ink-faint">{next.label}</span>
          <span className={value}>
            {next.value}
            <IconArrowRight size={16} className="shrink-0" />
          </span>
        </Link>
      )}
    </nav>
  )
}

// ── Provenijencija (data-source footnote) ───────────────────────────────────

/** GTFS data-provenance line shared by the line + stop pages. */
export function Provenijencija({ date }: { date: string }) {
  return (
    <p className="font-mono text-label text-ink-faint">
      vozni red iz službenog zet gtfs feeda · osvježava se automatski ·
      vrijedi za {date}
    </p>
  )
}
