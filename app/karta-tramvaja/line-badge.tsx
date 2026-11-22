import { cn } from "@/lib/utils"
import { tramLineColor } from "@/lib/tram-lines"

/** Square line-number badge in the line's ZET colour. */
export function LineBadge({
  broj,
  className,
}: {
  broj: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-7 shrink-0 items-center justify-center font-mono text-label font-bold text-ground",
        className
      )}
      style={{ backgroundColor: tramLineColor(broj) }}
    >
      {broj}
    </span>
  )
}

/** "Črnomerec - Savišće": terminals joined with a hyphen, never an en-dash. */
export const lineName = (terminals: [string, string]) =>
  `${terminals[0]} - ${terminals[1]}`
