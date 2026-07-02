import Link from "next/link"
import {
  IconArrowLeft,
  IconArrowRight,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

/**
 * Map-redesign component library (docs/map-redesign-spec.md §4).
 * Editorial primitives: two families (Heros / Geist Mono), token colors,
 * sharp corners. Shared by the sidebar, modal, and map controls.
 */

/** Tracked mono eyebrow — `doseg · zagreb`. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-label tracking-[0.04em] text-ink-faint">
      {children}
    </p>
  )
}

/** Plain mono section label — `u dosegu`, `računam doseg…`. */
export function MonoLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-label text-ink-faint">{children}</p>
}

/** Tiny mono caption (ramp ends, strip numbers) — 11px. */
export function MonoCaption({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
      {children}
    </span>
  )
}

/** Bold Heros hook — section titles, readout values. */
export function Hook({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-heros text-head font-bold text-ink">{children}</p>
  )
}

/** zg-blue Heros link (internal). Pass `arrow` for a trailing forward arrow. */
export function BlueLink({
  href,
  children,
  arrow = false,
}: {
  href: string
  children: React.ReactNode
  arrow?: boolean
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-heros text-[16px] leading-5 text-zg-blue transition-colors duration-150 hover:text-navy"
    >
      {children}
      {arrow && <IconArrowRight size={14} className="shrink-0" />}
    </Link>
  )
}

/** zg-blue Heros action. Pass `back` for a leading back arrow. */
export function BlueAction({
  onClick,
  className = "",
  back = false,
  children,
}: {
  onClick: () => void
  className?: string
  back?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-heros text-[14px] leading-[18px] text-zg-blue transition-[color,transform] duration-150 ease-[var(--ease-out-strong)] hover:text-navy active:scale-[0.97] ${className}`}
    >
      {back && <IconArrowLeft size={14} className="shrink-0" />}
      {children}
    </button>
  )
}

/** Shimmering placeholder block (skeleton states). */
export function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton-block shimmer ${className}`} />
}

/**
 * Numbered explainer step — onboarding modal (md) and sidebar cards (sm).
 */
export function NumberedStep({
  n,
  title,
  sub,
  size = "sm",
}: {
  n: string
  title: string
  sub: string
  size?: "sm" | "md"
}) {
  const md = size === "md"
  return (
    <div className={`flex items-start ${md ? "gap-[13px]" : "gap-[11px]"}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-chip-blue font-mono text-zg-blue ${
          md
            ? "size-6 text-label"
            : "size-[22px] text-[11px] leading-[14px]"
        }`}
      >
        {n}
      </span>
      <span className={`flex flex-col pt-px ${md ? "gap-0.5" : "gap-px"}`}>
        <span className="font-heros text-[16px] leading-5 text-ink">
          {title}
        </span>
        <span
          className={`font-heros text-ink-faint ${
            md ? "text-[14px] leading-[18px]" : "text-[13px] leading-4"
          }`}
        >
          {sub}
        </span>
      </span>
    </div>
  )
}
