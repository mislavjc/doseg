import { cn } from "@/lib/utils"
import type {
  ComponentPropsWithoutRef,
  ElementType,
  HTMLAttributes,
} from "react"

/**
 * Stats page typography — components only (no design tokens file).
 *
 * Scale: page title → group (TOC section) → module → eyebrow / overline → body.
 */

// --- Page / hero ---

export function StatPageTitle({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1
      className={cn("font-sans text-head font-bold text-ink", className)}
      {...props}
    >
      {children}
    </h1>
  )
}

export function StatHeroMeta({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 font-mono text-label text-ink-muted",
        className
      )}
      {...props}
    />
  )
}

export function StatHeroMetaText({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("lowercase", className)} {...props} />
}

// --- Major TOC bands (one per scroll group) ---

export function StatGroupTitle({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn("font-sans text-head font-bold text-ink", className)}
      {...props}
    >
      {children}
    </h2>
  )
}

export function StatGroupLead({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("mb-10 max-w-[620px] text-body text-ink-muted", className)}
      {...props}
    />
  )
}

// --- Modules inside a group (always smaller than StatGroupTitle) ---

type StatModuleTitleProps = {
  as?: "h2" | "h3" | "h4"
} & HTMLAttributes<HTMLHeadingElement>

export function StatModuleTitle({
  as: Tag = "h3",
  className,
  ...props
}: StatModuleTitleProps) {
  return (
    <Tag
      className={cn("font-sans text-head font-bold text-ink", className)}
      {...props}
    />
  )
}

export function StatModuleLead({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("mt-2 max-w-[620px] text-body text-ink-2", className)}
      {...props}
    />
  )
}

// --- Editorial / feature row (between hero and body content) ---

export function StatDisplayHeading({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn("mb-5 text-head font-bold text-ink", className)}
      {...props}
    >
      {children}
    </h2>
  )
}

// --- Map / figure overline (lowercase label above a block) ---

export function StatOverline({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "mb-1 font-mono text-label text-ink-faint lowercase",
        className
      )}
      {...props}
    />
  )
}

// --- Uppercase section / table / card labels ---

export function StatEyebrow({
  className,
  as: Tag = "h3",
  ...props
}: { as?: ElementType } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "mb-2 font-mono text-label text-ink-faint lowercase",
        className
      )}
      {...props}
    />
  )
}

// --- Body copy ---

export function StatBodyLarge({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-body text-ink-2", className)} {...props} />
}

export function StatProse({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-4 text-body text-ink-2", className)}
      {...props}
    />
  )
}

export function StatMuted({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-body text-ink-muted", className)} {...props} />
}

export function StatEmphasis({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("font-bold text-ink", className)} {...props} />
}

// --- KPI / editorial numerals ---

export function StatKpiValue({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-sans text-head font-bold text-ink", className)}
      {...props}
    />
  )
}

export function StatKpiNote({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-sans text-head font-bold text-ink", className)}
      {...props}
    />
  )
}

export function StatKpiCaption({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("font-mono text-label text-ink-muted", className)}
      {...props}
    />
  )
}

// --- Insight callouts (network section pattern) ---

export function StatInsight({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("mt-10 bg-surface p-5 sm:p-6", className)} {...props} />
  )
}

export function StatInsightBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-body text-ink-2", className)} {...props} />
}

// --- Dense card / list title (district rows, etc.) ---
