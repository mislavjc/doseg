import type { Metadata } from "next"
import Link from "next/link"

import { Breadcrumb } from "@/app/statistika/editorial/blocks"
import { Footer } from "@/app/statistika/editorial/footer"
import { Hero } from "@/app/statistika/editorial/hero"
import { JsonLd } from "@/app/statistika/editorial/json-ld"
import {
  Body,
  EditorialShell,
  PageTitle,
  Section,
} from "@/app/statistika/editorial/primitives"
import { type KvartBoardRow, loadKvartBoard } from "@/lib/kvart-data"
import { scoreColor } from "@/lib/score-color"

export const metadata: Metadata = {
  title: "Zagrebački kvartovi po povezanosti javnog prijevoza | Doseg",
  description:
    "Svih 17 zagrebačkih kvartova rangirano po dosegu javnog prijevoza, od najbolje povezanog do prometne pustinje. Za svaki kvart: linije, doseg i susjedne stanice.",
  alternates: { canonical: "/kvartovi" },
  openGraph: {
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
}

function Row({ r }: { r: KvartBoardRow }) {
  return (
    <li>
      <Link
        href={`/kvartovi/${r.slug}`}
        className="group flex items-center gap-3.5 border-b border-hairline py-2.5"
      >
        <span className="w-6 shrink-0 font-mono text-label tabular-nums text-ink-faint">
          {String(r.rank).padStart(2, "0")}
        </span>
        <span className="w-[160px] shrink-0 truncate font-heros text-body text-ink transition-colors group-hover:text-zg-blue">
          {r.name}
        </span>
        <span className="flex h-4 min-w-0 flex-1 bg-surface">
          <span style={{ width: `${r.score}%`, backgroundColor: scoreColor(r.score) }} />
        </span>
        <span className="hidden w-[68px] shrink-0 text-right font-mono text-label text-ink-muted sm:inline">
          {r.lineCount} linija
        </span>
        <span className="w-8 shrink-0 text-right font-mono text-body text-ink">
          {r.score}
        </span>
      </Link>
    </li>
  )
}

export default function KvartoviPage() {
  const board = loadKvartBoard()
  if (!board) return null

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Zagrebački kvartovi po povezanosti javnog prijevoza",
    itemListElement: board.rows.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.name,
      url: `https://doseg.hr/kvartovi/${r.slug}`,
    })),
  }

  return (
    <EditorialShell>
      <JsonLd data={itemList} />
      <Hero active="kvartovi" />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "svi kvartovi" }]} />
        <PageTitle className="mt-4">Kvartovi po povezanosti.</PageTitle>
        <Body className="mt-1 text-ink-muted">
          svih {board.rows.length} zagrebačkih kvartova, od najboljeg do najgoreg
        </Body>
        <Body className="mt-5 max-w-[560px]">
          Najbolje je povezan <strong className="font-bold text-ink">{board.best.name}</strong>{" "}
          (indeks {board.best.score}), najslabije {board.worst.name} ({board.worst.score}).{" "}
          {board.cityDesertPct}% grada je dalje od 500 m od bilo koje stanice.
        </Body>
      </Section>

      <Section width="article" className="pt-6">
        <ul>
          {board.rows.map((r) => (
            <Row key={r.slug} r={r} />
          ))}
        </ul>
      </Section>

      <Footer updated={board.generatedAt} />
    </EditorialShell>
  )
}
