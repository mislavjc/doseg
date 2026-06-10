"use client"

import { Select } from "@base-ui/react/select"
import { useEffect, useMemo, useState } from "react"
import { scoreColor, scoreTextColor } from "@/lib/score-color"
import { parseDistrictShapes } from "./district-shapes"
import { BodyMuted, Eyebrow, Hook, MonoLabel, Section } from "./primitives"

/**
 * Matrica putovanja (Paper node EDT-0) — interactive travel-time explorer. Pick
 * an origin → the list re-sorts by minutes to every other district and the flat
 * choropleth recolours (darker = closer; origin in ink). List ↔ map hover-link.
 * Time ramp reuses the shared scoreColor (inverted: close = dark/high score).
 */

type Shape = { name: string; d: string }
type Dest = { name: string; min: number }
type Paint = { fill: (min: number) => string; text: (min: number) => string }

// close (low min) → dark navy ; far → pale
const timeScore = (min: number, maxMin: number) => (1 - min / maxMin) * 100

function OriginPicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <MonoLabel className="text-[11px]">iz</MonoLabel>
      <Select.Root
        value={value}
        onValueChange={(v) => onChange(String(v))}
        aria-label="Polazni kvart"
      >
        <Select.Trigger className="inline-flex min-w-[160px] cursor-pointer items-center justify-between gap-3 border border-hairline-strong px-3 py-1.5 font-mono text-xs text-ink outline-none transition-colors select-none hover:border-ink-faint focus-visible:ring-2 focus-visible:ring-zg-blue/40 data-[popup-open]:border-zg-blue">
          <Select.Value />
          <Select.Icon className="font-mono text-xs text-ink-faint transition-transform duration-150 data-[popup-open]:rotate-180">
            ▾
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className="z-50"
            sideOffset={5}
            alignItemWithTrigger={false}
          >
            <Select.Popup className="max-h-[min(22rem,var(--available-height))] origin-(--transform-origin) overflow-auto overscroll-none border border-hairline-strong bg-white py-1 shadow-soft outline-none transition-[transform,opacity] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              {options.map((o) => (
                <Select.Item
                  key={o}
                  value={o}
                  className="flex cursor-default items-center justify-between gap-4 px-3 py-1.5 font-mono text-xs text-ink-2 outline-none select-none data-[highlighted]:bg-surface data-[selected]:text-ink"
                >
                  <Select.ItemText>{o}</Select.ItemText>
                  <Select.ItemIndicator className="text-zg-blue">
                    ✓
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}

function TravelList({
  origin,
  dest,
  paint,
  hover,
  setHover,
}: {
  origin: string
  dest: Dest[]
  paint: Paint
  hover: string | null
  setHover: (n: string | null) => void
}) {
  return (
    <div className="min-w-0 grow">
      <div className="flex items-center justify-between px-3 pb-2">
        <MonoLabel className="text-[11px]">do kvarta</MonoLabel>
        <MonoLabel className="text-[11px]">min</MonoLabel>
      </div>
      <div
        className="flex items-center gap-3 px-3 py-1"
        style={{ backgroundColor: "var(--ink)" }}
      >
        <span className="grow font-heros text-xs leading-4 text-ground">
          · &nbsp;{origin}
        </span>
        <span className="font-mono text-xs text-ground/70">ovdje si</span>
      </div>
      {dest.map((t, i) => {
        const active = hover === t.name
        const color = active ? "var(--ground)" : paint.text(t.min)
        return (
          <div
            key={t.name}
            onPointerEnter={() => setHover(t.name)}
            onPointerLeave={() => setHover(null)}
            className="flex items-center gap-3 px-3 py-1 transition-colors duration-150 ease-out-strong"
            style={{ backgroundColor: active ? "var(--highlight)" : paint.fill(t.min) }}
          >
            <span
              className="w-5 shrink-0 font-mono text-[11px] tabular-nums opacity-60"
              style={{ color }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="grow font-heros text-xs leading-4" style={{ color }}>
              {t.name}
            </span>
            <span className="font-mono text-xs tabular-nums" style={{ color }}>
              {t.min}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Choropleth({
  shapes,
  origin,
  minByName,
  paint,
  hover,
  setHover,
}: {
  shapes: Shape[]
  origin: string
  minByName: Map<string, number>
  paint: Paint
  hover: string | null
  setHover: (n: string | null) => void
}) {
  return (
    <div className="shrink-0 md:w-[320px]">
      <svg viewBox="0 0 960 620" className="h-auto w-full">
        {shapes.map((s) => {
          const fill =
            s.name === origin
              ? "var(--ink)"
              : hover === s.name
                ? "var(--highlight)"
                : paint.fill(minByName.get(s.name) ?? 0)
          return (
            <path
              key={s.name}
              d={s.d}
              fill={fill}
              stroke="#fff"
              strokeWidth={1.5}
              strokeLinejoin="round"
              onPointerEnter={() => setHover(s.name)}
              onPointerLeave={() => setHover(null)}
              className="cursor-pointer"
            />
          )
        })}
      </svg>
      <MonoLabel className="mt-2 block text-[11px]">
        tamnije = bliže · ○ ovdje si
      </MonoLabel>
    </div>
  )
}

export function Matrica({
  districts,
  matrix,
}: {
  districts: string[]
  matrix: number[][]
}) {
  const [origin, setOrigin] = useState(
    districts.includes("Donji grad") ? "Donji grad" : districts[0]
  )
  const [shapes, setShapes] = useState<Shape[]>([])
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    fetch("/district-map.svg")
      .then((r) => r.text())
      .then((svg) =>
        setShapes(parseDistrictShapes(svg).filter((s) => s.name && s.d))
      )
      .catch(() => {})
  }, [])

  const { dest, minByName, maxMin } = useMemo(() => {
    const oi = districts.indexOf(origin)
    const minByName = new Map<string, number>()
    districts.forEach((n, j) => minByName.set(n, Math.round(matrix[oi][j])))
    const dest = districts
      .map((name, j) => ({ name, min: Math.round(matrix[oi][j]) }))
      .filter((_, j) => j !== oi)
      .sort((a, b) => a.min - b.min)
    return { dest, minByName, maxMin: Math.max(...dest.map((d) => d.min), 1) }
  }, [origin, districts, matrix])

  const paint: Paint = {
    fill: (min) => scoreColor(timeScore(min, maxMin)),
    text: (min) => scoreTextColor(timeScore(min, maxMin)),
  }

  return (
    <Section id="matrica" width="wide">
      <div className="flex flex-col gap-6">
        <Eyebrow>matrica putovanja</Eyebrow>
        <Hook>Koliko grada ti je nadohvat iz tvog kvarta?</Hook>
        <OriginPicker value={origin} options={districts} onChange={setOrigin} />
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <TravelList
            origin={origin}
            dest={dest}
            paint={paint}
            hover={hover}
            setHover={setHover}
          />
          <Choropleth
            shapes={shapes}
            origin={origin}
            minByName={minByName}
            paint={paint}
            hover={hover}
            setHover={setHover}
          />
        </div>
        <BodyMuted>
          Iz centra je gotovo cijeli grad unutar sata. S ruba je drukčije:
          prosječna vožnja među kvartovima traje 56 minuta, a do Podsljemena i
          preko dva sata.
        </BodyMuted>
      </div>
    </Section>
  )
}
