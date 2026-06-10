/**
 * Dropdown/popover primitives — shared by the autocomplete, and the
 * upcoming Slojevi panel and polazak time picker (spec §5–7).
 */

/** White floating panel under an anchor (field, map control). */
export function DropdownPanel({
  className = "",
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`pop-enter absolute z-30 flex flex-col border border-hairline-strong bg-ground shadow-dropdown ${className}`}
    >
      {children}
    </div>
  )
}

/** Mono section header — `rezultati`, `nedavno`, `slojevi karte`. */
export function DropdownSection({
  label,
  divider = false,
}: {
  label: string
  divider?: boolean
}) {
  return (
    <div
      className={`px-4 pt-[11px] pb-[7px] ${
        divider ? "border-t border-hairline" : ""
      }`}
    >
      <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
        {label}
      </span>
    </div>
  )
}

/**
 * Hoverable row: fixed icon lane + title (+ sub). `onPick` rows keep focus
 * on the anchor input (pointerdown is swallowed — it fires before blur on
 * every platform, including iOS where mousedown comes too late).
 */
export function DropdownRow({
  icon,
  title,
  sub,
  tone = "ink",
  divider = false,
  onPick,
}: {
  icon: React.ReactNode
  title: string
  sub?: string | null
  tone?: "ink" | "ink-2" | "blue" | "red"
  divider?: boolean
  onPick: () => void
}) {
  const toneClass =
    tone === "blue"
      ? "text-zg-blue"
      : tone === "red"
        ? "text-poi-hospital"
        : tone === "ink-2"
          ? "text-ink-2"
          : "text-ink"
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPick}
      className={`flex w-full items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-row-tint ${
        divider ? "border-b border-hairline py-[13px]" : "py-[9px]"
      }`}
    >
      <span className="flex w-[18px] shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={`truncate font-heros text-[16px] leading-5 ${toneClass}`}
        >
          {title}
        </span>
        {sub && (
          <span className="truncate font-heros text-[13px] leading-4 text-ink-faint">
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}
