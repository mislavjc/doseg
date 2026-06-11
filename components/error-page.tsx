import Image from "next/image"
import Link from "next/link"

import { FooterMapBand } from "@/app/statistika/editorial/footer"
import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { cn } from "@/lib/utils"

/**
 * Error pages (404 / 500) — one route-line system, locked in Paper
 * ("404 — 4 varijante" V2 + "500 — 4 varijante" V3): centred message block,
 * then a route motif where blue is what works and faint grey is what broke.
 * On 404 the filled stops ARE the recovery links and the line dies dashed
 * into a hollow "404" stop; on 500 the line between "ti" and "doseg.hr" is
 * severed mid-way. Desktop draws the route horizontally; mobile reuses the
 * vertical stop-rail idiom from the linija pages.
 */

// ── Shell ────────────────────────────────────────────────────────────────────

export function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-ground font-heros text-ink-2 antialiased selection:bg-zg-blue/15">
      {/* Plain white header (Paper error artboards) — the dithered map only
          bookends the page from the footer. */}
      <header className="flex w-full justify-center px-4 pt-8 sm:px-16 sm:pt-10">
        <SiteNav active="" />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-14 text-center sm:gap-11">
        {children}
      </main>
      <ErrorFooter />
    </div>
  )
}

/** Mono error code, bold one-liner, muted explanation. */
export function ErrorMessage({
  code,
  title,
  children,
}: {
  code: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-mono text-label lowercase text-ink-faint">
        greška {code}
      </p>
      <h1 className="font-heros text-head font-bold text-ink">{title}</h1>
      <p className="max-w-[520px] font-heros text-body text-ink-muted">
        {children}
      </p>
    </div>
  )
}

/** Wordmark + the four site links + the dither map band, per the Paper artboards. */
function ErrorFooter() {
  return (
    <footer>
      <div className="mx-auto flex w-full max-w-[840px] flex-wrap items-center justify-between gap-x-10 gap-y-3 px-4 pb-5 sm:px-8">
        <span className="flex items-center gap-[11px]">
          <Image
            src="/doseg-mark.png"
            alt=""
            width={34}
            height={25}
            className="h-[25px] w-[34px] object-contain"
          />
          <span className="font-mono text-sm font-medium leading-tight tracking-[-0.01em]">
            <span className="text-ink">doseg</span>
            <span className="text-zg-blue">.hr</span>
          </span>
        </span>
        <span className="flex items-center gap-5">
          {[
            { t: "karta", href: "/" },
            { t: "linije", href: "/linije" },
            { t: "o projektu", href: "/o-projektu" },
          ].map((l) => (
            <Link
              key={l.t}
              href={l.href}
              className="font-mono text-label text-zg-blue transition-colors hover:text-navy"
            >
              {l.t}
            </Link>
          ))}
          <a
            href="https://github.com/mislavjc/doseg"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-label text-zg-blue transition-colors hover:text-navy"
          >
            github
          </a>
        </span>
      </div>
      <FooterMapBand />
    </footer>
  )
}

// ── Route motifs ─────────────────────────────────────────────────────────────

/** 404 link stops — shared by both orientations. */
const DEAD_END_STOPS = [
  { label: "početna", href: "/", x: 30 },
  { label: "statistika", href: "/statistika", x: 310 },
  { label: "sve linije", href: "/linije", x: 590 },
] as const

const ROUTE_W = 820
const pct = (x: number) => `${((x / ROUTE_W) * 100).toFixed(2)}%`

const stopLink =
  "font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy"

/**
 * 404 — the route runs through three filled stops (the recovery links), then
 * goes dashed and dies at a hollow stop labelled 404.
 */
export function RouteDeadEnd() {
  return (
    <>
      {/* Desktop: horizontal route, labels overlaid under the scaled SVG dots. */}
      <div className="hidden w-full max-w-[820px] sm:block">
        <svg
          viewBox={`0 0 ${ROUTE_W} 40`}
          className="block h-auto w-full"
          aria-hidden
        >
          <line x1="30" y1="20" x2="590" y2="20" stroke="var(--zg-blue)" strokeWidth="2" />
          <line
            x1="598"
            y1="20"
            x2="772"
            y2="20"
            stroke="var(--ink-faint)"
            strokeWidth="2"
            strokeDasharray="2 6"
          />
          {DEAD_END_STOPS.map((s) => (
            <circle key={s.label} cx={s.x} cy="20" r="6" fill="var(--zg-blue)" />
          ))}
          <circle cx="784" cy="20" r="6" fill="var(--ground)" stroke="var(--ink-faint)" strokeWidth="2" />
        </svg>
        <nav aria-label="izlazi" className="relative h-7">
          {DEAD_END_STOPS.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn("absolute top-1 -translate-x-1/2", stopLink)}
              style={{ left: pct(s.x) }}
            >
              {s.label}
            </Link>
          ))}
          <span
            aria-hidden
            className="absolute top-1 -translate-x-1/2 font-mono text-[16px] leading-6 text-ink-faint"
            style={{ left: pct(784) }}
          >
            404
          </span>
        </nav>
      </div>

      {/* Mobile: the vertical stop rail from the linija pages. */}
      <nav aria-label="izlazi" className="w-full max-w-[240px] sm:hidden">
        <ul className="flex flex-col text-left">
          {DEAD_END_STOPS.map((s, i) => (
            <li key={s.label} className="relative flex h-12 items-center gap-4">
              <Rail upper={i === 0 ? "none" : "solid"} lower={i === 2 ? "dashed" : "solid"} />
              <span className="relative size-3 shrink-0 rounded-full bg-zg-blue" />
              <Link href={s.href} className={stopLink}>
                {s.label}
              </Link>
            </li>
          ))}
          <li className="relative flex h-12 items-center gap-4">
            <Rail upper="dashed" lower="none" />
            <span className="relative size-3 shrink-0 rounded-full border-2 border-ink-faint bg-ground" />
            <span aria-hidden className="font-mono text-[16px] leading-6 text-ink-faint">
              404
            </span>
          </li>
        </ul>
      </nav>
    </>
  )
}

/**
 * 500 — two stops, "ti" and "doseg.hr", with the line severed mid-way and
 * "500 · prekid" at the break.
 */
export function RouteBreak() {
  return (
    <>
      {/* Desktop */}
      <div className="hidden w-full max-w-[820px] sm:block" aria-hidden>
        <svg viewBox={`0 0 ${ROUTE_W} 40`} className="block h-auto w-full">
          <line x1="30" y1="20" x2="384" y2="20" stroke="var(--zg-blue)" strokeWidth="2" />
          <line x1="436" y1="20" x2="790" y2="20" stroke="var(--zg-blue)" strokeWidth="2" />
          <line x1="399" y1="28" x2="409" y2="12" stroke="var(--ink-faint)" strokeWidth="2" />
          <line x1="411" y1="28" x2="421" y2="12" stroke="var(--ink-faint)" strokeWidth="2" />
          <circle cx="30" cy="20" r="6" fill="var(--zg-blue)" />
          <circle cx="790" cy="20" r="6" fill="var(--zg-blue)" />
        </svg>
        <div className="relative h-7">
          <span
            className="absolute top-1 -translate-x-1/2 font-mono text-[16px] leading-6 text-ink"
            style={{ left: pct(30) }}
          >
            ti
          </span>
          <span className="absolute left-1/2 top-1.5 -translate-x-1/2 font-mono text-label text-ink-faint">
            500 · prekid
          </span>
          <span
            className="absolute top-1 -translate-x-1/2 font-mono text-[16px] leading-6 text-ink"
            style={{ left: pct(790) }}
          >
            doseg.hr
          </span>
        </div>
      </div>

      {/* Mobile */}
      <div className="w-full max-w-[240px] sm:hidden" aria-hidden>
        <ul className="flex flex-col text-left">
          <li className="relative flex h-12 items-center gap-4">
            <Rail upper="none" lower="solid" />
            <span className="relative size-3 shrink-0 rounded-full bg-zg-blue" />
            <span className="font-mono text-[16px] leading-6 text-ink">ti</span>
          </li>
          <li className="relative flex h-12 items-center gap-4">
            <span className="absolute bottom-[calc(50%+9px)] left-[5px] top-0 w-0.5 bg-zg-blue" />
            <span className="absolute bottom-0 left-[5px] top-[calc(50%+9px)] w-0.5 bg-zg-blue" />
            <span className="relative flex size-3 shrink-0 flex-col items-center justify-center gap-[3px]">
              <span className="h-0.5 w-3 -rotate-[58deg] bg-ink-faint" />
              <span className="h-0.5 w-3 -rotate-[58deg] bg-ink-faint" />
            </span>
            <span className="font-mono text-label text-ink-faint">500 · prekid</span>
          </li>
          <li className="relative flex h-12 items-center gap-4">
            <Rail upper="solid" lower="none" />
            <span className="relative size-3 shrink-0 rounded-full bg-zg-blue" />
            <span className="font-mono text-[16px] leading-6 text-ink">doseg.hr</span>
          </li>
        </ul>
      </div>
    </>
  )
}

/** Half-height rail segments above/below a stop dot (mobile vertical route). */
function Rail({
  upper,
  lower,
}: {
  upper: "solid" | "dashed" | "none"
  lower: "solid" | "dashed" | "none"
}) {
  const seg = (kind: "solid" | "dashed", pos: "upper" | "lower") => (
    <span
      className={cn(
        "absolute left-[5px]",
        pos === "upper" ? "top-0 h-1/2" : "bottom-0 h-1/2",
        kind === "solid"
          ? "w-0.5 bg-zg-blue"
          : "w-0 border-l-2 border-dotted border-ink-faint"
      )}
    />
  )
  return (
    <>
      {upper !== "none" && seg(upper, "upper")}
      {lower !== "none" && seg(lower, "lower")}
    </>
  )
}
