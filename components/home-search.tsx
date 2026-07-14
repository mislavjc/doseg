"use client"

import { IconMagnifyingGlass } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import type { SearchIndexPayload } from "@/app/api/search-index/route"
import { LineBadge } from "@/app/statistika/editorial/blocks"
import { norm } from "@/lib/normalize"

/**
 * Homepage search over lines + stops (Paper "Home v1.1 — Imenik"). The index
 * is lazy-fetched on first focus (~1200 stop names — too heavy to inline)
 * and normalized once on arrival, so per-keystroke matching is plain
 * startsWith/includes over precomputed strings. Enter goes to the top
 * result; every suggestion is a plain link.
 */

type Result = {
  href: string
  /** Line number for the blue badge; null renders the outline "stanica" chip. */
  broj: string | null
  label: string
  meta: string | null
}

type IndexedStop = {
  slug: string
  name: string
  kvart: string | null
  nameNorm: string
}

type SearchIndex = {
  lines: { broj: string; label: string; terminalsNorm: string[] }[]
  stops: IndexedStop[]
  aliases: { alias: string; stop: IndexedStop }[]
}

/** Colloquial names → the stop people mean — only where the official stop
 *  name doesn't contain the colloquialism (norm()-ed keys). */
const STOP_ALIASES = [
  { alias: "kvatric", slug: "kvaternikov-trg" },
  { alias: "britanac", slug: "britanski-trg" },
] as const

function buildIndex(payload: SearchIndexPayload): SearchIndex {
  const stops = payload.stops.map((s) => ({ ...s, nameNorm: norm(s.name) }))
  return {
    lines: payload.lines.map((l) => ({
      broj: l.broj,
      label: `${l.terminals[0]} - ${l.terminals[1]}`,
      terminalsNorm: l.terminals.map(norm),
    })),
    stops,
    aliases: STOP_ALIASES.flatMap((a) => {
      const stop = stops.find((s) => s.slug === a.slug)
      return stop ? [{ alias: a.alias, stop }] : []
    }),
  }
}

const MAX_RESULTS = 7
/** Line rows shown alongside stop matches on a text (non-digit) query. */
const LINE_SLOTS = 3

const lineResult = (l: SearchIndex["lines"][number]): Result => ({
  href: `/linije/${l.broj}`,
  broj: l.broj,
  label: l.label,
  meta: null,
})

const stopResult = (s: IndexedStop): Result => ({
  href: `/stanice/${s.slug}`,
  broj: null,
  label: s.name,
  meta: s.kvart,
})

function search(index: SearchIndex, rawQuery: string): Result[] {
  const q = norm(rawQuery.trim())
  if (!q) return []

  if (/^\d+$/.test(q)) {
    // Digits — a line number lookup, exact broj first.
    return index.lines
      .filter((l) => l.broj.startsWith(q))
      .sort((a, b) => a.broj.length - b.broj.length || Number(a.broj) - Number(b.broj))
      .slice(0, MAX_RESULTS)
      .map(lineResult)
  }

  // Text — alias targets first (e.g. "kvatrić" means Kvaternikov trg), then
  // stop names (startsWith beats includes), then line terminals.
  const aliasHits =
    q.length >= 3
      ? index.aliases
          .filter((a) => a.alias.startsWith(q))
          .map((a) => stopResult(a.stop))
      : []

  const starts: Result[] = []
  const contains: Result[] = []
  for (const s of index.stops) {
    if (s.nameNorm.startsWith(q)) {
      starts.push(stopResult(s))
      if (starts.length >= MAX_RESULTS) break
    } else if (contains.length < MAX_RESULTS && s.nameNorm.includes(q)) {
      contains.push(stopResult(s))
    }
  }

  const lineHits: Result[] = []
  for (const l of index.lines) {
    if (lineHits.length >= LINE_SLOTS) break
    if (l.terminalsNorm.some((t) => t.includes(q))) lineHits.push(lineResult(l))
  }

  const stopHits = [...aliasHits, ...starts, ...contains].filter(
    (r, i, arr) => arr.findIndex((x) => x.href === r.href) === i
  )
  return [...stopHits.slice(0, MAX_RESULTS - lineHits.length), ...lineHits]
}

function ResultList({ results }: { results: Result[] }) {
  return (
    <ul
      id="home-search-results"
      className="absolute inset-x-0 top-full z-20 border-2 border-t-0 border-ink bg-white"
    >
      {results.map((r) => (
        <li key={r.href}>
          <Link
            href={r.href}
            className="flex items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-surface"
          >
            {r.broj ? (
              <LineBadge broj={r.broj} />
            ) : (
              <span className="flex h-6 shrink-0 items-center border border-hairline-strong px-1.5 font-mono text-label text-ink-2">
                stanica
              </span>
            )}
            <span className="min-w-0 truncate font-heros text-body text-ink">
              {r.label}
            </span>
            {r.meta && (
              <span className="ml-auto shrink-0 font-mono text-label text-ink-faint">
                {r.meta}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HomeSearch() {
  const router = useRouter()
  // Memoized in-flight fetch: keystrokes that land mid-load await the same
  // promise; a failed fetch resolves null and search degrades to the
  // brzi-linkovi chips below (no error UI).
  const indexPromiseRef = useRef<Promise<SearchIndex | null> | null>(null)
  const queryRef = useRef("")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)

  const loadIndex = () => {
    indexPromiseRef.current ??= fetch("/api/search-index")
      .then((res) => (res.ok ? (res.json() as Promise<SearchIndexPayload>) : null))
      .then((data) => data && buildIndex(data))
      .catch(() => null)
    return indexPromiseRef.current
  }

  const runSearch = (value: string) => {
    setQuery(value)
    setOpen(true)
    queryRef.current = value
    void loadIndex().then((idx) => {
      // Only the latest keystroke's callback renders; earlier ones bail.
      if (idx && queryRef.current === value) setResults(search(idx, value))
    })
  }

  const showResults = open && query.trim().length > 0 && results.length > 0

  return (
    <div
      className="relative w-full"
      onBlur={(e) => {
        // Keep the list open while focus moves between the input and a result.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <div className="flex h-14 items-center gap-3.5 border-2 border-ink bg-white px-4">
        <IconMagnifyingGlass size={16} className="shrink-0 text-ink" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          onFocus={() => {
            void loadIndex()
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) router.push(results[0].href)
            if (e.key === "Escape") setOpen(false)
          }}
          placeholder="Upiši liniju ili stanicu, npr. 107 ili Kvaternikov trg"
          aria-label="Pretraži linije i stanice"
          aria-expanded={showResults}
          role="combobox"
          aria-controls="home-search-results"
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent font-heros text-body text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {showResults && <ResultList results={results} />}
    </div>
  )
}
