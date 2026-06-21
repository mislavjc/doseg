"use client"

import { useCallback, useRef, useState } from "react"
import {
  IconArrowBottomTop,
  IconCrossLarge,
  IconLocation,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

import { GEOCODE_KIND_META } from "@/lib/poi"
import {
  useAddressSearch,
  type GeocodeSuggestion,
} from "@/lib/use-address-search"
import { requestMyLocation, type LatLon } from "./reach-state"
import {
  DestSquare,
  DropdownPanel,
  DropdownRow,
  DropdownSection,
  OriginRing,
} from "./ui"

/**
 * Anchored search fields (spec §2 + Paper "Autocomplete · desktop"): the
 * origin row never moves; once an origin exists the destination row expands
 * in place below it — and both rows are live autocompletes. Picking in the
 * destination row routes, picking in the origin row re-origins.
 */

type Recent = { label: string; lat: number; lon: number }

const RECENTS_KEY = "doseg-recent-origins"

function loadRecents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as Recent[]
  } catch {
    return []
  }
}

function useRecents() {
  const [recents, setRecents] = useState<Recent[]>(() =>
    typeof window === "undefined" ? [] : loadRecents()
  )
  const add = useCallback((r: Recent) => {
    const next = [r, ...loadRecents().filter((x) => x.label !== r.label)].slice(
      0,
      4
    )
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    setRecents(next)
  }, [])
  return { recents, add }
}

/** Split "Ilica 242, Črnomerec, Zagreb" into title + context line. */
function splitName(name: string): { title: string; sub: string | null } {
  const [title, ...rest] = name.split(",")
  const sub = rest.join(",").trim()
  return { title: title.trim(), sub: sub || null }
}

function MyLocationIcon() {
  return <IconLocation size={17} className="text-zg-blue" />
}

function ResultRow({
  s,
  active,
  onPick,
}: {
  s: GeocodeSuggestion
  active: boolean
  onPick: (p: LatLon, label: string) => void
}) {
  const { title, sub } = splitName(s.display_name)
  const meta = GEOCODE_KIND_META[s.kind ?? "place"]
  return (
    <DropdownRow
      icon={<span className={`size-[9px] rounded-full ${meta.dotClass}`} />}
      title={title}
      sub={sub ? `${sub.split(",")[0]} · ${meta.label}` : meta.label}
      active={active}
      onPick={() => onPick({ lat: s.lat, lon: s.lon }, s.display_name)}
    />
  )
}

function Dropdown({
  results,
  recents,
  query,
  loading,
  showMyLocation,
  activeIndex,
  onRemoveOrigin,
  onPick,
  onMyLocation,
}: {
  results: GeocodeSuggestion[]
  recents: Recent[]
  query: string
  loading: boolean
  showMyLocation: boolean
  /** Keyboard highlight — indices follow dropdownItems() order. */
  activeIndex: number
  onRemoveOrigin: (() => void) | null
  onPick: (p: LatLon, label: string) => void
  onMyLocation: () => void
}) {
  // Row indices must mirror dropdownItems() — keep the two in sync.
  let idx = -1
  const next = () => ++idx
  return (
    <DropdownPanel className="origin-top top-full right-0 left-0 mt-1.5 pb-1">
      {onRemoveOrigin && (
        <DropdownRow
          icon={<IconCrossLarge size={15} className="text-poi-hospital" />}
          title="Ukloni polazište"
          tone="red"
          divider
          active={next() === activeIndex}
          onPick={onRemoveOrigin}
        />
      )}
      {showMyLocation && (
        <DropdownRow
          icon={<MyLocationIcon />}
          title="Moja lokacija"
          tone="blue"
          divider
          active={next() === activeIndex}
          onPick={onMyLocation}
        />
      )}
      {query.length >= 2 && results.length === 0 && (
        <DropdownSection label={loading ? "tražim…" : "nema rezultata"} />
      )}
      {results.length > 0 && (
        <>
          <DropdownSection label="rezultati" />
          {results.slice(0, 5).map((s) => (
            <ResultRow
              key={`${s.lat}${s.lon}`}
              s={s}
              active={next() === activeIndex}
              onPick={onPick}
            />
          ))}
        </>
      )}
      {recents.length > 0 && (
        <>
          <DropdownSection label="nedavno" divider={results.length > 0} />
          {recents.map((r) => (
            <DropdownRow
              key={r.label}
              icon={
                <span className="size-[11px] rounded-full border-[1.5px] border-ink-faint/60" />
              }
              title={splitName(r.label).title}
              tone="ink-2"
              active={next() === activeIndex}
              onPick={() => onPick({ lat: r.lat, lon: r.lon }, r.label)}
            />
          ))}
        </>
      )}
    </DropdownPanel>
  )
}

/** Flat action list in dropdown render order — drives arrow keys + Enter. */
function dropdownItems(args: {
  results: GeocodeSuggestion[]
  recents: Recent[]
  showMyLocation: boolean
  onRemoveOrigin: (() => void) | null
  onPick: (p: LatLon, label: string) => void
  onMyLocation: () => void
}): { run: () => void; isResult: boolean }[] {
  const items: { run: () => void; isResult: boolean }[] = []
  if (args.onRemoveOrigin) {
    const run = args.onRemoveOrigin
    items.push({ run, isResult: false })
  }
  if (args.showMyLocation)
    items.push({ run: args.onMyLocation, isResult: false })
  for (const s of args.results.slice(0, 5)) {
    items.push({
      run: () => args.onPick({ lat: s.lat, lon: s.lon }, s.display_name),
      isResult: true,
    })
  }
  for (const r of args.recents) {
    items.push({
      run: () => args.onPick({ lat: r.lat, lon: r.lon }, r.label),
      isResult: false,
    })
  }
  return items
}

/** Arrow keys move the highlight, Enter picks (bare Enter = first result).
 * The single dropdownItems() list is the one source of order + count. */
function useDropdownKeyboard(args: {
  open: boolean
  highlight: number
  setHighlight: (h: number) => void
  itemArgs: Parameters<typeof dropdownItems>[0]
}) {
  const { open, highlight, setHighlight, itemArgs } = args
  // Only the count is needed per render (to clamp the highlight); the closure
  // list is built on demand inside the keydown handler, and only while open.
  const items = open ? dropdownItems(itemArgs) : []
  // Results can shrink under the highlight — treat out-of-range as none.
  const activeIndex = highlight < items.length ? highlight : -1

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((activeIndex + 1) % items.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((activeIndex - 1 + items.length) % items.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item =
        activeIndex >= 0 ? items[activeIndex] : items.find((i) => i.isResult)
      item?.run()
    }
  }

  return { activeIndex, onKeyNav }
}

type RowKind = "origin" | "dest"

function SearchRow({
  kind,
  icon,
  value,
  placeholder,
  inputRef,
  onChange,
  onFocus,
  onBlur,
  onKeyNav,
  onClear,
  showClear,
  trailing,
}: {
  kind: RowKind
  icon: React.ReactNode
  value: string
  placeholder: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (v: string) => void
  onFocus: () => void
  onBlur: () => void
  onKeyNav: (e: React.KeyboardEvent) => void
  onClear: () => void
  showClear: boolean
  trailing?: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-3 px-3.5 py-[13px]">
      {icon}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") inputRef.current?.blur()
          else onKeyNav(e)
        }}
        placeholder={placeholder}
        aria-label={kind === "origin" ? "Polazište" : "Odredište"}
        title={value || undefined}
        className="w-full bg-transparent font-heros text-[16px] leading-5 text-ink outline-none placeholder:text-ink-faint"
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Očisti unos"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="-my-2 -mr-2 flex size-9 shrink-0 items-center justify-center text-ink-faint transition-colors duration-150 hover:text-ink-muted active:scale-[0.97]"
        >
          <IconCrossLarge size={15} />
        </button>
      ) : (
        trailing
      )}
    </label>
  )
}

/** Resting-state ✕ on a filled row — one click clears the value. */
function ClearValueButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="-my-2 -mr-2 flex size-9 shrink-0 items-center justify-center text-ink-faint transition-colors duration-150 hover:text-ink-muted active:scale-[0.97]"
    >
      <IconCrossLarge size={15} />
    </button>
  )
}

function useRowWiring(args: {
  originName: string | null
  destName: string | null
  onSelectOrigin: (p: LatLon, label?: string) => void
  onSelectDest: (p: LatLon, label?: string) => void
}) {
  const { query, setQuery, results, loading, clear } = useAddressSearch()
  const [activeRow, setActiveRow] = useState<RowKind | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const { recents, add: addRecent } = useRecents()
  const originRef = useRef<HTMLInputElement>(null)
  const destRef = useRef<HTMLInputElement>(null)

  const pick = useCallback(
    (row: RowKind, p: LatLon, label?: string) => {
      if (label) addRecent({ label, lat: p.lat, lon: p.lon })
      clear()
      ;(row === "origin" ? originRef : destRef).current?.blur()
      if (row === "origin") args.onSelectOrigin(p, label)
      else args.onSelectDest(p, label)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks stable enough
    [addRecent, clear, args.onSelectOrigin, args.onSelectDest]
  )

  const rowProps = (kind: RowKind) => ({
    kind,
    inputRef: kind === "origin" ? originRef : destRef,
    value:
      activeRow === kind
        ? query
        : ((kind === "origin" ? args.originName : args.destName) ?? ""),
    onChange: (v: string) => {
      setQuery(v)
      setHighlight(-1)
    },
    onFocus: () => {
      setActiveRow(kind)
      setHighlight(-1)
      clear()
    },
    onBlur: () => setActiveRow(null),
    onClear: () => {
      clear()
      setHighlight(-1)
      ;(kind === "origin" ? originRef : destRef).current?.focus()
    },
    showClear: activeRow === kind && query.length > 0,
  })

  return {
    activeRow,
    originRef,
    results,
    recents,
    query,
    loading,
    pick,
    rowProps,
    highlight,
    setHighlight,
    open: activeRow !== null,
  }
}

function SwapButton({ onSwap }: { onSwap: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label="Zamijeni polazište i odredište"
      className="absolute top-1/2 right-[46px] flex size-[30px] -translate-y-1/2 items-center justify-center border border-hairline-strong bg-ground text-ink-faint transition-transform duration-150 ease-out hover:text-ink-muted active:scale-[0.97]"
    >
      <IconArrowBottomTop size={14} />
    </button>
  )
}


export type SearchFieldsProps = {
  hasOrigin: boolean
  hasDest: boolean
  originName: string | null
  destName: string | null
  showSwap: boolean
  onSelectOrigin: (p: LatLon, label?: string) => void
  onSelectDest: (p: LatLon, label?: string) => void
  onSwap: () => void
  onClearOrigin: () => void
  onClearDest: () => void
}

export function SearchFields({
  hasOrigin,
  hasDest,
  originName,
  destName,
  showSwap,
  onSelectOrigin,
  onSelectDest,
  onSwap,
  onClearOrigin,
  onClearDest,
}: SearchFieldsProps) {
  const {
    activeRow,
    originRef,
    results,
    recents,
    query,
    loading,
    pick,
    rowProps,
    highlight,
    setHighlight,
    open,
  } = useRowWiring({ originName, destName, onSelectOrigin, onSelectDest })

  const onMyLocation = () => {
    originRef.current?.blur()
    requestMyLocation(onSelectOrigin)
  }

  const itemArgs = {
    results,
    recents,
    showMyLocation: activeRow === "origin",
    onRemoveOrigin:
      activeRow === "origin" && hasOrigin ? onClearOrigin : null,
    onPick: (p: LatLon, label: string) =>
      activeRow && pick(activeRow, p, label),
    onMyLocation,
  }
  const { activeIndex, onKeyNav } = useDropdownKeyboard({
    open,
    highlight,
    setHighlight,
    itemArgs,
  })

  return (
    <div className="relative">
      <FieldRows
        props={{
          hasOrigin,
          hasDest,
          originName,
          destName,
          showSwap,
          onSwap,
          onClearOrigin,
          onClearDest,
        }}
        activeRow={activeRow}
        rowProps={rowProps}
        onKeyNav={onKeyNav}
      />
      {open && (
        <Dropdown
          results={results}
          recents={recents}
          query={query}
          loading={loading}
          showMyLocation={activeRow === "origin"}
          activeIndex={activeIndex}
          onRemoveOrigin={
            activeRow === "origin" && hasOrigin ? onClearOrigin : null
          }
          onPick={(p, label) => activeRow && pick(activeRow, p, label)}
          onMyLocation={onMyLocation}
        />
      )}
    </div>
  )
}

/** The bordered two-row field stack (origin + optional destination). */
function FieldRows({
  props,
  activeRow,
  rowProps,
  onKeyNav,
}: {
  props: Pick<
    SearchFieldsProps,
    | "hasOrigin"
    | "hasDest"
    | "originName"
    | "destName"
    | "showSwap"
    | "onSwap"
    | "onClearOrigin"
    | "onClearDest"
  >
  activeRow: RowKind | null
  rowProps: (kind: RowKind) => Omit<
    React.ComponentProps<typeof SearchRow>,
    "icon" | "placeholder" | "trailing" | "onKeyNav"
  >
  onKeyNav: (e: React.KeyboardEvent) => void
}) {
  const { hasOrigin, hasDest, originName, destName, showSwap } = props
  const resting = activeRow === null
  return (
    <div
      className={
        !resting
          ? "border-2 border-zg-blue [&>label]:px-[13px] [&>label:first-child]:pt-3 [&>label:last-child]:pb-3"
          : "border border-hairline-strong"
      }
    >
      <SearchRow
        {...rowProps("origin")}
        onKeyNav={onKeyNav}
        icon={<OriginRing active={hasOrigin || activeRow === "origin"} />}
        placeholder={
          hasOrigin
            ? (originName ?? "Novo polazište…")
            : "Pretraži ili klikni kartu"
        }
        trailing={
          hasOrigin && resting ? (
            <ClearValueButton
              label="Ukloni polazište"
              onClick={props.onClearOrigin}
            />
          ) : undefined
        }
      />
      {hasOrigin && (
        <>
          <div className="ml-10 h-px bg-hairline" />
          <SearchRow
            {...rowProps("dest")}
            onKeyNav={onKeyNav}
            icon={<DestSquare active={destName != null} />}
            placeholder="Odredište — traži ili klikni kartu"
            trailing={
              hasDest && resting ? (
                <ClearValueButton
                  label="Ukloni odredište"
                  onClick={props.onClearDest}
                />
              ) : undefined
            }
          />
        </>
      )}
      {showSwap && resting && <SwapButton onSwap={props.onSwap} />}
    </div>
  )
}
