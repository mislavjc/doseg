import { IconBike } from "@central-icons-react/square-outlined-radius-0-stroke-2"

import { isBikeMode, isWalkMode, modeColorFor } from "@/lib/mode-colors"

/** BAJS glyph — chip + journey strip. Wraps the shared icon set so the
 * homepage and /promjene stay visually consistent. */
export function BikeIcon({ className = "" }: { className?: string }) {
  return <IconBike size={14} className={className} />
}

/**
 * THE chip (spec §4 — one component, reused): itinerary leg chip, journey
 * node, live-vehicle marker. Transit = line-color fill + white mono number;
 * walk = hairline fill + grey dot; BAJS = amber fill + bike glyph.
 * Pass `color` to match the map polyline.
 */
export function ModeChip({
  mode,
  route,
  color,
}: {
  mode: string
  route?: string
  color?: string
}) {
  if (isWalkMode(mode)) {
    return (
      <span className="flex h-6 w-[30px] shrink-0 items-center justify-center rounded-[5px] bg-hairline">
        <span className="size-1.5 rounded-full bg-ink-faint" />
      </span>
    )
  }
  return (
    <span
      className="flex h-6 w-[30px] shrink-0 items-center justify-center rounded-[5px]"
      style={{ background: color ?? modeColorFor(mode) }}
    >
      {isBikeMode(mode) ? (
        <BikeIcon className="text-white" />
      ) : (
        <span className="font-mono text-[11px] leading-[14px] text-white">
          {route ?? "·"}
        </span>
      )}
    </span>
  )
}

/** Hollow origin ring — input field icon; blue once an origin is set. */
export function OriginRing({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-3.5 shrink-0 rounded-full border-2 ${
        active ? "border-zg-blue" : "border-ink-faint/60"
      }`}
    />
  )
}

/** Destination square — navy when set, hollow while empty (matches marker). */
export function DestSquare({ active = true }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-[11px] shrink-0 ${
        active ? "bg-navy" : "border-2 border-ink-faint/60"
      }`}
    />
  )
}

/** Flat editorial checkbox — layer toggles. `mixed` = some children on. */
export function CheckSquare({
  state,
}: {
  state: "on" | "off" | "mixed"
}) {
  return (
    <span
      aria-hidden
      className={`flex size-3.5 shrink-0 items-center justify-center transition-colors duration-150 ${
        state === "off" ? "border-[1.5px] border-ink-faint/60" : "bg-zg-blue"
      }`}
    >
      {state === "on" && (
        <span className="font-mono text-[10px] leading-none text-white">✓</span>
      )}
      {state === "mixed" && <span className="h-[1.5px] w-[7px] bg-white" />}
    </span>
  )
}

/** POI category dot — sidebar counts ↔ map markers share the palette. */
export function PoiDot({ colorClass }: { colorClass: string }) {
  return (
    <span className={`size-[9px] shrink-0 rounded-full ${colorClass}`} />
  )
}
