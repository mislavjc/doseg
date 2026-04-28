import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "O projektu — Doseg | Zagreb Transit Reachability",
  description:
    "Kako radi Doseg: interaktivna karta dosega javnog prijevoza u Zagrebu. Dijkstrin algoritam, ZET GTFS vozni red, GTFS-RT kašnjenja i pješačka mreža s 422K čvorova.",
  alternates: { canonical: "/o-projektu" },
  openGraph: {
    title: "O projektu — Doseg | Zagreb Transit Reachability",
    description:
      "Kako radi Doseg: interaktivna karta dosega javnog prijevoza u Zagrebu. Dijkstrin algoritam, ZET GTFS vozni red, GTFS-RT kašnjenja i pješačka mreža s 422K čvorova.",
    type: "article",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 lowercase transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8l4-4" />
      </svg>
      natrag na kartu
    </Link>
  )
}

function Section({
  number,
  eyebrow,
  children,
}: {
  number: number
  eyebrow: string
  children: React.ReactNode
}) {
  const numLabel = String(number).padStart(2, "0")
  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex items-center gap-0">
        <div className="h-[2px] w-12 rounded-full bg-gradient-to-r from-slate-400 to-slate-200 dark:from-white/40 dark:to-white/10" />
        <div className="h-px flex-1 bg-slate-200/80 dark:bg-white/[0.08]" />
      </div>
      <div className="pt-8">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {numLabel} &mdash; {eyebrow}
        </p>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  )
}

function Em({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-slate-900 dark:text-slate-100">
      {children}
    </span>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-[1.7] text-slate-600 sm:text-[16px] dark:text-slate-300">
      {children}
    </p>
  )
}

function HowItWorks() {
  return (
    <Section number={1} eyebrow="kako radi">
      <Body>
        Klikom na kartu Doseg izračunava izokrone koristeći{" "}
        <Em>Dijkstrin algoritam</Em> nad ZET-ovim voznim redom. Rute se
        rekonstruiraju na klijentskoj strani, pa pregled prijelaza između linija
        radi trenutno dok pomičeš miš.
      </Body>
    </Section>
  )
}

function DataRow({ source, detail }: { source: string; detail: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-x-6 border-t border-slate-200/80 py-4 first:border-t-0 sm:grid-cols-[180px_1fr] dark:border-white/[0.08]">
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {source}
      </span>
      <span className="text-[14px] text-slate-600 dark:text-slate-400">
        {detail}
      </span>
    </div>
  )
}

function Data() {
  return (
    <Section number={2} eyebrow="podaci">
      <div>
        <DataRow source="ZET GTFS" detail="vozni red tramvaja i buseva" />
        <DataRow source="ZET GTFS-RT" detail="kašnjenja u stvarnom vremenu" />
        <DataRow source="OpenStreetMap" detail="pješačka mreža" />
        <DataRow source="OpenTripPlanner" detail="server za rutiranje" />
      </div>
    </Section>
  )
}

function Privacy() {
  return (
    <Section number={3} eyebrow="privatnost">
      <Body>
        Nema kolačića, praćenja ni osobnih podataka. Svi upiti ostaju između tvog
        preglednika i servera za rutiranje.
      </Body>
    </Section>
  )
}

function Architecture() {
  return (
    <Section number={4} eyebrow="arhitektura">
      <div className="flex flex-col gap-5">
        <Body>
          Teški dio posla radi <Em>Rust servis</Em> (axum). Dijkstrin algoritam
          po transit grafu, zatim ekspanzija pješačkom mrežom od 422K čvorova iz
          OpenStreetMapa.
        </Body>
        <Body>
          <Em>GTFS-RT</Em> kašnjenja dolaze iz ZET-ovog protobuf feeda svake 30
          sekundi (~600 trip updateova po osvježavanju).
        </Body>
        <Body>
          <Em>ts-rs</Em> generira TypeScript tipove iz Rust structova, jedan
          izvor istine za cijeli stack.
        </Body>
        <Body>
          <Em>Next.js</Em> servira SSR stranice i lakše API endpointe.{" "}
          <Em>OpenTripPlanner</Em> radi planiranje ruta.
        </Body>
        <Body>
          Ispred svega stoji <Em>Caddy</Em> reverse proxy s Cloudflareom.
          Koordinate se snappaju na mrežu (~100&thinsp;m) tako da CDN može
          cachirati odgovore.
        </Body>
      </div>
    </Section>
  )
}

function OpenSource() {
  return (
    <Section number={5} eyebrow="otvoreni kod">
      <Body>
        Cjelokupni izvorni kod je dostupan na{" "}
        <a
          href="https://github.com/mislavjc/doseg"
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition-[color,text-decoration-color] duration-150 hover:decoration-slate-500 dark:text-slate-100 dark:decoration-slate-600 dark:hover:decoration-slate-400"
        >
          GitHubu
        </a>
        .
      </Body>
    </Section>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-slate-50 dark:bg-background">
      <main
        id="main-content"
        className="mx-auto max-w-3xl px-5 pt-12 pb-20 sm:px-6 sm:pt-16 sm:pb-28"
      >
        <BackLink />

        <h1 className="mt-12 font-sans text-[44px] font-medium leading-[1.05] tracking-tight text-slate-900 sm:text-[56px] dark:text-white">
          Doseg
        </h1>
        <p className="mt-6 max-w-xl text-base leading-[1.7] text-slate-600 sm:text-[18px] dark:text-slate-400">
          Interaktivna karta dosega javnog prijevoza u Zagrebu. Klikni bilo gdje
          i vidi dokle možeš stići tramvajem ili busom u 15, 30 ili 45 minuta.
        </p>

        <HowItWorks />
        <Data />
        <Privacy />
        <Architecture />
        <OpenSource />

        <p className="mt-20 text-[13px] font-medium text-slate-500 dark:text-slate-400">
          Napravio{" "}
          <a
            href="https://mislavjc.com"
            className="text-slate-900 underline decoration-slate-300 underline-offset-4 transition-[color,text-decoration-color] duration-150 hover:decoration-slate-500 dark:text-slate-100 dark:decoration-slate-600 dark:hover:decoration-slate-400"
          >
            Mislav Jovanović
          </a>
        </p>
      </main>
    </div>
  )
}
