"use client"

import { useCallback, useRef, useState } from "react"

import { GEOCODE_KIND_META } from "@/lib/poi"
import {
  useAddressSearch,
  type GeocodeSuggestion,
} from "@/lib/use-address-search"
import type { LatLon } from "./reach-state"
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
  return (
    <span
      aria-hidden
      className="flex size-[18px] items-center justify-center rounded-full border-2 border-zg-blue"
    >
      <span className="size-[5px] rounded-full bg-zg-blue" />
    </span>
  )
}

function Dropdown({
  results,
  recents,
  query,
  loading,
  showMyLocation,
  onRemoveOrigin,
  onPick,
  onMyLocation,
}: {
  results: GeocodeSuggestion[]
  recents: Recent[]
  query: string
  loading: boolean
  showMyLocation: boolean
  onRemoveOrigin: (() => void) | null
  onPick: (p: LatLon, label: string) => void
  onMyLocation: () => void
}) {
  return (
    <DropdownPanel className="origin-top top-full right-0 left-0 mt-1.5 pb-1">
      {onRemoveOrigin && (
        <DropdownRow
          icon={
            <span className="font-mono text-[14px] leading-4 text-poi-hospital">
              ×
            </span>
          }
          title="Ukloni polazište"
          tone="red"
          divider
          onPick={onRemoveOrigin}
        />
      )}
      {showMyLocation && (
        <DropdownRow
          icon={<MyLocationIcon />}
          title="Moja lokacija"
          tone="blue"
          divider
          onPick={onMyLocation}
        />
      )}
      {query.length >= 2 && results.length === 0 && (
        <DropdownSection label={loading ? "tražim…" : "nema rezultata"} />
      )}
      {results.length > 0 && (
        <>
          <DropdownSection label="rezultati" />
          {results.slice(0, 5).map((s) => {
            const { title, sub } = splitName(s.display_name)
            const meta = GEOCODE_KIND_META[s.kind ?? "place"]
            return (
              <DropdownRow
                key={`${s.lat}${s.lon}`}
                icon={
                  <span className={`size-[9px] rounded-full ${meta.dotClass}`} />
                }
                title={title}
                sub={
                  sub ? `${sub.split(",")[0]} · ${meta.label}` : meta.label
                }
                onPick={() =>
                  onPick({ lat: s.lat, lon: s.lon }, s.display_name)
                }
              />
            )
          })}
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
              onPick={() => onPick({ lat: r.lat, lon: r.lon }, r.label)}
            />
          ))}
        </>
      )}
    </DropdownPanel>
  )
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
        }}
        placeholder={placeholder}
        aria-label={kind === "origin" ? "Polazište" : "Odredište"}
        className="w-full bg-transparent font-heros text-[16px] leading-5 text-ink outline-none placeholder:text-ink-faint"
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Očisti unos"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="-my-2 -mr-2 flex size-9 shrink-0 items-center justify-center text-[14px] leading-none text-ink-faint transition-colors duration-150 hover:text-ink-muted active:scale-[0.97]"
        >
          ✕
        </button>
      ) : (
        trailing
      )}
    </label>
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
    onChange: (v: string) => setQuery(v),
    onFocus: () => {
      setActiveRow(kind)
      clear()
    },
    onBlur: () => setActiveRow(null),
    onClear: () => {
      clear()
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
    open: activeRow !== null,
  }
}

function SwapButton({ onSwap }: { onSwap: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label="Zamijeni polazište i odredište"
      className="absolute top-1/2 right-[9px] flex size-[30px] -translate-y-1/2 items-center justify-center border border-hairline-strong bg-ground font-mono text-[14px] leading-[18px] text-ink-faint transition-transform duration-150 ease-out hover:text-ink-muted active:scale-[0.97]"
    >
      ⇅
    </button>
  )
}

/** Resting-state origin action — focuses the row (opens the dropdown). */
function ChangeOriginAction({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="shrink-0 font-mono text-[11px] leading-[14px] tracking-[0.04em] text-zg-blue transition-colors duration-150 hover:text-navy"
    >
      promijeni
    </button>
  )
}

export type SearchFieldsProps = {
  hasOrigin: boolean
  originName: string | null
  destName: string | null
  showSwap: boolean
  onSelectOrigin: (p: LatLon, label?: string) => void
  onSelectDest: (p: LatLon, label?: string) => void
  onSwap: () => void
  onClearOrigin: () => void
}

export function SearchFields({
  hasOrigin,
  originName,
  destName,
  showSwap,
  onSelectOrigin,
  onSelectDest,
  onSwap,
  onClearOrigin,
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
    open,
  } = useRowWiring({ originName, destName, onSelectOrigin, onSelectDest })

  return (
    <div className="relative">
      <div
        className={
          activeRow !== null
            ? "border-2 border-zg-blue [&>label]:px-[13px] [&>label:first-child]:pt-3 [&>label:last-child]:pb-3"
            : "border border-hairline-strong"
        }
      >
        <SearchRow
          {...rowProps("origin")}
          icon={<OriginRing active={hasOrigin || activeRow === "origin"} />}
          placeholder={
            hasOrigin
              ? (originName ?? "Novo polazište…")
              : "Pretraži ili klikni kartu"
          }
          trailing={
            hasOrigin && activeRow === null && !showSwap ? (
              <ChangeOriginAction
                onActivate={() => originRef.current?.focus()}
              />
            ) : undefined
          }
        />
        {hasOrigin && (
          <>
            <div className="ml-10 h-px bg-hairline" />
            <SearchRow
              {...rowProps("dest")}
              icon={<DestSquare active={destName != null} />}
              placeholder="Odredište — traži ili klikni kartu"
            />
          </>
        )}
        {showSwap && activeRow === null && <SwapButton onSwap={onSwap} />}
      </div>
      {open && (
        <Dropdown
          results={results}
          recents={recents}
          query={query}
          loading={loading}
          showMyLocation={activeRow === "origin"}
          onRemoveOrigin={
            activeRow === "origin" && hasOrigin ? onClearOrigin : null
          }
          onPick={(p, label) => activeRow && pick(activeRow, p, label)}
          onMyLocation={() => {
            originRef.current?.blur()
            navigator.geolocation?.getCurrentPosition(
              (pos) =>
                onSelectOrigin({
                  lat: pos.coords.latitude,
                  lon: pos.coords.longitude,
                }),
              () => {}
            )
          }}
        />
      )}
    </div>
  )
}
