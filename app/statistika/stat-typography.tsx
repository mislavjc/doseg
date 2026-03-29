import { cn } from "@/lib/utils"
import type { ComponentPropsWithoutRef, ElementType, HTMLAttributes } from "react"

/**
 * Stats page typography — components only (no design tokens file).
 *
 * Scale: page title → group (TOC section) → module → eyebrow / overline → body.
 */

// --- Page / hero ---

export function StatPageTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1
      className={cn(
        "font-sans text-4xl font-medium leading-[1.1] tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100",
        className
      )}
      {...props}
    />
  )
}

export function StatHeroMeta({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "mb-6 flex items-center gap-3 text-[13px] font-medium text-slate-400 dark:text-slate-500",
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
  return (
    <span
      className={cn("font-medium lowercase text-slate-400 dark:text-slate-500", className)}
      {...props}
    />
  )
}

// --- Major TOC bands (one per scroll group) ---

export function StatGroupTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn(
        "font-sans text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100",
        className
      )}
      {...props}
    />
  )
}

export function StatGroupLead({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "mb-12 max-w-[650px] text-base leading-relaxed text-slate-600 sm:text-[17px] dark:text-slate-400",
        className
      )}
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
      className={cn(
        "font-sans text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100",
        className
      )}
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
      className={cn(
        "mt-4 max-w-xl text-[17px] leading-relaxed text-slate-700 sm:text-[18px] dark:text-slate-300",
        className
      )}
      {...props}
    />
  )
}

// --- Editorial / feature row (between hero and body content) ---

export function StatDisplayHeading({
  className,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn(
        "mb-8 text-center text-xl font-normal tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100",
        className
      )}
      {...props}
    />
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
        "mb-2 text-sm font-medium lowercase text-slate-400 dark:text-slate-500",
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
        "mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400",
        className
      )}
      {...props}
    />
  )
}

// --- Body copy ---

export function StatBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "text-base leading-relaxed text-slate-600 dark:text-slate-400",
        className
      )}
      {...props}
    />
  )
}

export function StatBodyLarge({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "text-base leading-[1.8] text-slate-600 dark:text-slate-400",
        className
      )}
      {...props}
    />
  )
}

export function StatProse({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 text-base leading-[1.8] text-slate-600 dark:text-slate-400",
        className
      )}
      {...props}
    />
  )
}

export function StatMuted({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("text-sm text-slate-500 dark:text-slate-400", className)}
      {...props}
    />
  )
}

export function StatEmphasis({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-medium text-slate-900 dark:text-slate-100", className)}
      {...props}
    />
  )
}

// --- KPI / editorial numerals ---

export function StatKpiValue({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "font-sans text-5xl font-normal leading-none tracking-tight text-slate-900 sm:text-[56px] dark:text-slate-100",
        className
      )}
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
      className={cn(
        "font-sans text-[32px] font-normal leading-none tracking-tight text-slate-900 sm:text-[40px] dark:text-slate-100",
        className
      )}
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
      className={cn(
        "mt-8 text-xs leading-relaxed text-slate-600 sm:text-[13px] dark:text-slate-400",
        className
      )}
      {...props}
    />
  )
}

export function StatMetricValue({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "font-sans text-3xl font-semibold tracking-tighter tabular-nums text-slate-900 sm:text-[28px] dark:text-slate-100",
        className
      )}
      {...props}
    />
  )
}

export function StatMetricHint({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("text-xs text-slate-500 dark:text-slate-400", className)}
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
    <div
      className={cn(
        "mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-6 sm:p-7 dark:border-white/10 dark:bg-white/4",
        className
      )}
      {...props}
    />
  )
}

export function StatInsightBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "text-[15px] leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300",
        className
      )}
      {...props}
    />
  )
}

// --- Dense card / list title (district rows, etc.) ---

export function StatCardTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h4">) {
  return (
    <h4
      className={cn(
        "font-sans text-lg leading-tight font-medium tracking-tight text-slate-900 sm:text-[22px] dark:text-slate-100",
        className
      )}
      {...props}
    />
  )
}
