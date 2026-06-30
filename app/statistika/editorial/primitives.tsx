import type { ComponentPropsWithoutRef, ElementType } from "react"
import { cn } from "@/lib/utils"

/**
 * Statistika editorial primitives — the kit every section composes from.
 *
 * Two physical type sizes only (16px Heros prose / 12px Geist Mono labels);
 * hierarchy comes from weight + colour + space. Sharp corners, Zagreb blue,
 * the four-step ink ramp. See docs/design-system.md + docs/statistika-build-plan.md.
 *
 * Deliberately separate from the old `stat-typography`/`stat-shared` kit, which
 * keeps the legacy dashboard (now → /statistika/podaci) running until cutover.
 */

// ── Layout ──────────────────────────────────────────────────────────────────

/** Full-bleed white page frame for the editorial statistika page. Renders the
 * page's `<main>` landmark and the `#main-content` skip-link target (the global
 * skip link in app/layout.tsx points here); `tabIndex={-1}` lets the skip link
 * move focus, not just scroll. */
export function EditorialShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-svh bg-ground font-heros text-ink-2 antialiased outline-none selection:bg-zg-blue/15"
    >
      {children}
    </main>
  )
}

const COLUMN = {
  article: "max-w-[620px]", // prose + 1-D bar charts (pristup, jutro, sesvete)
  wide: "max-w-[840px]", // side-by-side map sections (povezanost, matrica) + footer
  full: "max-w-none", // section manages its own width (maps, etc.)
} as const

/**
 * Vertical-rhythm wrapper (80px desktop / 56px mobile) that centres a content
 * column and carries the section's anchor id + scroll offset.
 */
export function Section({
  id,
  width = "article",
  className,
  innerClassName,
  children,
}: {
  id?: string
  width?: keyof typeof COLUMN
  className?: string
  innerClassName?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-14 sm:py-20", className)}>
      <div
        className={cn("mx-auto w-full px-4 sm:px-8", COLUMN[width], innerClassName)}
      >
        {children}
      </div>
    </section>
  )
}

/** 1px rule. `strong` for visible dividers, default for a faint hairline. */
export function Hairline({
  strong = false,
  className,
  ...props
}: { strong?: boolean } & ComponentPropsWithoutRef<"hr">) {
  return (
    <hr
      className={cn(
        "border-0 border-t",
        strong ? "border-hairline-strong" : "border-hairline",
        className
      )}
      {...props}
    />
  )
}

// ── Type ────────────────────────────────────────────────────────────────────

/** Mono lowercase overline above a section/figure (e.g. "povezanost · 17 kvartova"). */
export function Eyebrow({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("font-mono text-label lowercase text-ink-faint", className)}
      {...props}
    />
  )
}

/** Section headline — Heros Bold 16/22. Renders as <h2> by default. */
export function Hook({
  as: Tag = "h2",
  className,
  ...props
}: { as?: ElementType } & ComponentPropsWithoutRef<"h2">) {
  return (
    <Tag
      className={cn("font-heros text-head font-bold text-ink", className)}
      {...props}
    />
  )
}

/** Page title — the Hook headline as a semantic <h1> (single source of style). */
export function PageTitle(props: ComponentPropsWithoutRef<"h1">) {
  return <Hook as="h1" {...props} />
}

/** Regular prose — Heros 16/24, secondary ink. */
export function Body({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("font-heros text-body text-ink-2", className)}
      {...props}
    />
  )
}

/** Quieter prose — same metrics, tertiary ink (trailing notes, captions). */
export function BodyMuted({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("font-heros text-body text-ink-muted", className)}
      {...props}
    />
  )
}

/** Inline emphasis inside prose — bold + primary ink. */
export function Strong({
  className,
  ...props
}: ComponentPropsWithoutRef<"strong">) {
  return (
    <strong className={cn("font-bold text-ink", className)} {...props} />
  )
}

// ── Mono labels / data cells ──────────────────────────────────────────────────

/** Mono label — faint, for column headers and units. */
export function MonoLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-mono text-label text-ink-faint", className)}
      {...props}
    />
  )
}

/** Mono value — tabular figures, primary ink (scores, minutes, metres). */
export function MonoValue({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-mono text-label tabular-nums text-ink", className)}
      {...props}
    />
  )
}

/** Methodology / metadata tag — mono 11px in a sharp light box. */
export function Chip({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center bg-surface px-2.5 py-[5px] font-mono text-[11px] leading-[14px] text-ink-2",
        className
      )}
      {...props}
    />
  )
}
