"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAddressSearch, type GeocodeSuggestion } from "@/lib/use-address-search"
import { cn } from "@/lib/utils"

type AddressInputProps = {
  placeholder: string
  value: string
  onSelect: (lat: number, lon: number, name: string) => void
  onCurrentLocation?: () => void
  readOnly?: boolean
  autoFocus?: boolean
  className?: string
}

type DropdownItem = { type: "location" | "result"; result?: GeocodeSuggestion }

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan-500">
      <path d="M10.88 17.182L9.2 13.8a1 1 0 0 0-.546-.546L5.27 11.57a.5.5 0 0 1 .054-.925L18.42 5.56a.5.5 0 0 1 .62.62L13.965 19.3a.5.5 0 0 1-.926.055L11.353 17.67a1 1 0 0 0-.473-.488z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}

function DropdownRow({ item, active, onSelect }: { item: DropdownItem; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button" onMouseDown={(e) => e.preventDefault()} onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors ${active ? "bg-slate-50 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
    >
      {item.type === "location" ? <><LocationIcon /><span className="text-cyan-600 font-medium">Moja lokacija</span></> : <><PinIcon /><span className="truncate">{item.result!.display_name}</span></>}
    </button>
  )
}

function Dropdown({ items, activeIndex, showNoResults, showLoading, onSelect }: {
  items: DropdownItem[]; activeIndex: number; showNoResults: boolean; showLoading: boolean; onSelect: (item: DropdownItem) => void
}) {
  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl bg-white border border-slate-100">
      {items.map((item, i) => <DropdownRow key={item.type === "location" ? "loc" : `${i}-${item.result!.lat}`} item={item} active={i === activeIndex} onSelect={() => onSelect(item)} />)}
      {showLoading && <div className="px-3 py-3 text-[13px] text-slate-500">Tražim...</div>}
      {showNoResults && <div className="px-3 py-3 text-[13px] text-slate-500">Nema rezultata</div>}
    </div>
  )
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const cbRef = useRef(onClose)
  useEffect(() => { cbRef.current = onClose })
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) cbRef.current() }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [ref])
}

const INPUT_CLASS = "h-[44px] rounded-2xl border-transparent bg-slate-100 px-4 text-[15px] text-slate-900 w-full placeholder:text-slate-400 text-ellipsis outline-none transition-colors"

function displayName(result: GeocodeSuggestion) {
  return result.display_name.split(",")[0]
}

export function AddressInput({ placeholder, value, onSelect, onCurrentLocation, readOnly, autoFocus, className }: AddressInputProps) {
  const search = useAddressSearch()
  const [focused, setFocused] = useState(false)
  const [rawActiveIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const list: DropdownItem[] = []
    if (onCurrentLocation && !search.query && focused) list.push({ type: "location" })
    for (const r of search.results) list.push({ type: "result", result: r })
    return list
  }, [onCurrentLocation, search.query, focused, search.results])

  const activeIndex = items.length === 0 ? -1 : Math.min(rawActiveIndex, items.length - 1)

  const close = () => { setFocused(false); search.setIsOpen(false) }
  useClickOutside(wrapperRef, close)

  function selectItem(item: DropdownItem) {
    if (item.type === "location") { onCurrentLocation?.(); search.clear() }
    else if (item.result) { search.select(item.result); onSelect(item.result.lat, item.result.lon, displayName(item.result)) }
    setFocused(false); inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { close(); inputRef.current?.blur(); return }
    const visible = focused && (items.length > 0 || search.loading)
    if (!visible) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, items.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, -1)) }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); selectItem(items[activeIndex]) }
  }

  const finalInputClass = cn(INPUT_CLASS, className)

  if (readOnly) return <input readOnly value={value} placeholder={placeholder} className={cn(finalInputClass, "cursor-default")} />

  const noResults = !search.loading && search.query.length >= 2 && search.results.length === 0 && search.isOpen
  const dropdownVisible = focused && (items.length > 0 || search.loading || noResults)
  return (
    <div ref={wrapperRef} className="relative">
      <input ref={inputRef} type="text" value={focused ? search.query : value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => search.setQuery(e.target.value)}
        onFocus={(e) => { setFocused(true); if (value && !search.query) search.setQuery(value); search.setIsOpen(true); requestAnimationFrame(() => e.target.select()) }}
        onKeyDown={handleKeyDown}
        className={cn(finalInputClass, "focus:border-blue-500 focus:ring-1 focus:ring-blue-500")} />
      {search.loading && focused && <div className="absolute right-2 top-1/2 -translate-y-1/2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-slate-300" /></div>}
      {dropdownVisible && <Dropdown items={items} activeIndex={activeIndex} showLoading={search.loading && items.length === 0} showNoResults={noResults} onSelect={selectItem} />}
    </div>
  )
}
