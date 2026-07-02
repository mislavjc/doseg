/**
 * Map-redesign controls: segmented option group and the white-tile shell
 * for buttons floating over the map (Slojevi, zoom).
 */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: {
    value: T
    label: string
    disabled?: boolean
    title?: string
    /** Small caption under the label — e.g. "uskoro" on a disabled option. */
    note?: string
  }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex grow items-stretch border border-hairline-strong">
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={opt.disabled}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            title={opt.title}
            className={`flex grow basis-0 flex-col items-center justify-center gap-px py-3 text-center font-mono text-[13px] leading-4 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${
              i > 0 ? "border-l border-hairline-strong" : ""
            } ${
              selected
                ? "bg-chip-blue text-zg-blue"
                : opt.disabled
                  ? "cursor-not-allowed text-ink-faint/60"
                  : "text-ink-muted hover:text-ink-2"
            }`}
          >
            {opt.label}
            {opt.note && (
              <span className="text-[11px] leading-none tracking-[0.04em] text-ink-faint">
                {opt.note}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** White bordered tile floating over the map — Slojevi, zoom stack. */
export function MapTile({
  className = "",
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`border border-hairline-strong bg-ground shadow-map ${className}`}
    >
      {children}
    </div>
  )
}

export function MapTileButton({
  onClick,
  label,
  className = "",
  children,
}: {
  onClick?: () => void
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center transition-transform duration-150 ease-out active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  )
}
