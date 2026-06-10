"use client"

import { useState } from "react"

import { POI_CATEGORIES, type MapPoiCategory } from "@/lib/poi"
import {
  CheckSquare,
  DropdownPanel,
  DropdownSection,
  MapTile,
  MapTileButton,
  PoiDot,
} from "./ui"

/**
 * Layers control (Paper "Slojevi V2 — brojevi + kategorije", spec §5).
 * The panel doubles as the legend: every row carries its map color + count.
 */

export type LayersState = {
  doseg: boolean
  poi: Record<MapPoiCategory, boolean>
  bajs: boolean
}

export const DEFAULT_LAYERS: LayersState = {
  doseg: true,
  poi: { hospital: false, school: false, park: false },
  bajs: false,
}

function activeCount(layers: LayersState): number {
  const poiOn = Object.values(layers.poi).some(Boolean)
  return Number(layers.doseg) + Number(poiOn) + Number(layers.bajs)
}

function LayerRow({
  state,
  label,
  meta,
  onToggle,
}: {
  state: "on" | "off" | "mixed"
  label: string
  meta?: React.ReactNode
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 py-[9px] pr-4 pl-4 text-left transition-colors duration-150 hover:bg-row-tint"
    >
      <CheckSquare state={state} />
      <span
        className={`grow font-heros text-[16px] leading-5 ${
          state === "off" ? "text-ink-muted" : "text-ink"
        }`}
      >
        {label}
      </span>
      {meta && (
        <span className="font-mono text-label text-ink-faint">{meta}</span>
      )}
    </button>
  )
}

/** Category sub-row — lives inside the left-rule group under its parent. */
function SubRow({
  on,
  colorClass,
  label,
  meta,
  onToggle,
}: {
  on: boolean
  colorClass: string
  label: string
  meta?: React.ReactNode
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 py-[7px] pr-4 pl-[17px] text-left transition-colors duration-150 hover:bg-row-tint"
    >
      <span className={`flex ${on ? "" : "opacity-35"}`}>
        <PoiDot colorClass={colorClass} />
      </span>
      <span
        className={`grow font-heros text-[14px] leading-[18px] ${
          on ? "text-ink-2" : "text-ink-faint"
        }`}
      >
        {label}
      </span>
      {meta != null && (
        <span
          className={`font-mono text-label ${
            on ? "text-ink-muted" : "text-ink-faint/70"
          }`}
        >
          {meta}
        </span>
      )}
    </button>
  )
}

function PanelBody({
  layers,
  onChange,
  km2,
  poiCounts,
  bajsCount,
}: {
  layers: LayersState
  onChange: (l: LayersState) => void
  km2: number | null
  poiCounts: Record<string, number> | null
  bajsCount: number | null
}) {
  const poiStates = Object.values(layers.poi)
  const poiState: "on" | "off" | "mixed" = poiStates.every(Boolean)
    ? "on"
    : poiStates.some(Boolean)
      ? "mixed"
      : "off"
  return (
    <DropdownPanel className="origin-top-right top-full right-0 mt-1.5 w-[272px] pb-1.5">
      <DropdownSection label="slojevi karte" />
      <LayerRow
        state={layers.doseg ? "on" : "off"}
        label="Doseg"
        meta={km2 != null ? `${Math.round(km2)} km²` : undefined}
        onToggle={() => onChange({ ...layers, doseg: !layers.doseg })}
      />
      <LayerRow
        state={poiState}
        label="Ustanove"
        onToggle={() => {
          const next = poiState !== "on"
          onChange({
            ...layers,
            poi: { hospital: next, school: next, park: next },
          })
        }}
      />
      <div className="mb-1 ml-[21px] border-l border-hairline">
        {POI_CATEGORIES.map((row) => (
          <SubRow
            key={row.key}
            on={layers.poi[row.key]}
            colorClass={row.colorClass}
            label={row.label}
            meta={poiCounts ? (poiCounts[row.key] ?? 0) : undefined}
            onToggle={() =>
              onChange({
                ...layers,
                poi: { ...layers.poi, [row.key]: !layers.poi[row.key] },
              })
            }
          />
        ))}
      </div>
      <LayerRow
        state={layers.bajs ? "on" : "off"}
        label="BAJS stanice"
        meta={bajsCount ?? undefined}
        onToggle={() => onChange({ ...layers, bajs: !layers.bajs })}
      />
      <LayerRow
        state="off"
        label="Vozila uživo"
        meta="uskoro"
        onToggle={() => {}}
      />
    </DropdownPanel>
  )
}

export function LayersControl({
  layers,
  onChange,
  km2,
  poiCounts,
  bajsCount,
  variant = "label",
}: {
  layers: LayersState
  onChange: (l: LayersState) => void
  km2: number | null
  poiCounts: Record<string, number> | null
  bajsCount: number | null
  variant?: "label" | "icon"
}) {
  const [open, setOpen] = useState(false)
  const n = activeCount(layers)

  return (
    <div className="relative">
      <MapTile>
        <MapTileButton
          onClick={() => setOpen((o) => !o)}
          label={variant === "icon" ? "Slojevi" : undefined}
          className={
            variant === "icon" ? "size-11" : "gap-2 px-[13px] py-[9px]"
          }
        >
          <span
            aria-hidden
            className={`flex flex-col ${
              variant === "icon" ? "gap-[3px]" : "gap-0.5"
            }`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`bg-ink-muted ${
                  variant === "icon" ? "h-[2.5px] w-[18px]" : "h-0.5 w-[13px]"
                }`}
              />
            ))}
          </span>
          {variant === "label" && (
            <span className="font-heros text-[15px] leading-[18px] text-ink-2">
              Slojevi{n > 0 ? ` · ${n}` : ""}
            </span>
          )}
        </MapTileButton>
      </MapTile>
      {open && (
        <>
          <button
            type="button"
            aria-label="Zatvori"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <PanelBody
            layers={layers}
            onChange={onChange}
            km2={km2}
            poiCounts={poiCounts}
            bajsCount={bajsCount}
          />
        </>
      )}
    </div>
  )
}
