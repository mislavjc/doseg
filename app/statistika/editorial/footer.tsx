import Image from "next/image"
import Link from "next/link"
import { MonoLabel, Section } from "./primitives"

/**
 * Footer (Paper node BXC-0) — four mono columns (sources · downloads · doseg ·
 * updated) then the logo line. Internal links via next/link, external via <a>.
 * Wordmark is the doseg.hr lockup; updated date is data-wired.
 */

const GITHUB = "https://github.com/mislavjc/doseg"

type Item = { t: string; href?: string; external?: boolean }
type Column = { label: string; items: Item[] }

const COLUMNS: Column[] = [
  {
    label: "izvori",
    items: [
      { t: "zet gtfs · rt", href: "https://www.zet.hr/odredbe/datoteke-u-gtfs-formatu/669", external: true },
      { t: "© openstreetmap", href: "https://www.openstreetmap.org/copyright", external: true },
      { t: "dzs 2021", href: "https://dzs.gov.hr", external: true },
    ],
  },
  {
    label: "preuzmi",
    items: [
      { t: "rezultati.json", href: "/api/open-data" },
      { t: "izohrone.geojson", href: GITHUB, external: true },
      { t: "metoda.pdf", href: GITHUB, external: true },
    ],
  },
  {
    label: "doseg",
    items: [
      { t: "karta", href: "/karta" },
      { t: "podaci", href: "/statistika/podaci" },
      { t: "o projektu", href: "/o-projektu" },
      { t: "github", href: GITHUB, external: true },
    ],
  },
]

function ColumnItem({ item }: { item: Item }) {
  const cls = "font-mono text-label leading-5"
  if (!item.href)
    return <span className={`${cls} text-ink-faint`}>{item.t}</span>
  const linkCls = `${cls} text-zg-blue transition-colors hover:text-navy`
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
      {item.t}
    </a>
  ) : (
    <Link href={item.href} className={linkCls}>
      {item.t}
    </Link>
  )
}

function FooterColumn({ label, items }: Column) {
  return (
    <div className="flex flex-col gap-1.5">
      <MonoLabel className="text-ink">{label}</MonoLabel>
      <div className="flex flex-col items-start">
        {items.map((item) => (
          <ColumnItem key={item.t} item={item} />
        ))}
      </div>
    </div>
  )
}

export function Footer({ updated }: { updated: string }) {
  return (
    <footer>
      <Section width="wide" className="pb-10">
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-x-10 gap-y-7 sm:flex sm:gap-16">
            {COLUMNS.map((c) => (
              <FooterColumn key={c.label} {...c} />
            ))}
            <div className="flex flex-col gap-1.5">
              <MonoLabel className="text-ink">ažurirano</MonoLabel>
              <span className="font-mono text-label leading-5 text-ink-faint">
                {updated}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-[11px]">
            <Image
              src="/doseg-mark.png"
              alt="Doseg"
              width={34}
              height={25}
              className="h-[25px] w-[34px] object-contain"
            />
            <span className="font-mono text-label font-medium">
              <span className="text-ink">doseg</span>
              <span className="text-zg-blue">.hr</span>
            </span>
            <span className="text-label font-mono text-ink-faint">
              · statistika dostupnosti zagrebačkog javnog prijevoza
            </span>
          </div>
        </div>
      </Section>

      <FooterMapBand />
    </footer>
  )
}

/**
 * Dither map of the area around Trg žrtava fašizma (east Lower Town — the
 * round pavilion + its radial avenues), fading up from the bottom — a
 * different part of Zagreb that bookends the hero map. Shared with the
 * error pages (app/not-found.tsx, app/error.tsx).
 */
export function FooterMapBand() {
  return (
    <div className="relative h-[340px] w-full overflow-hidden sm:h-[480px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/footer-map.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center 66%" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, var(--ground) 0%, color-mix(in srgb, var(--ground) 82%, transparent) 22%, transparent 56%)",
        }}
      />
    </div>
  )
}
