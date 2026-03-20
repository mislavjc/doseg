import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "O projektu | Doseg",
  description:
    "Kako radi Doseg, interaktivna karta dosega javnog prijevoza u Zagrebu.",
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/[0.08]">
      <h2 className="text-[14px] font-semibold tracking-wide text-slate-200">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide text-slate-500 uppercase transition-colors hover:text-slate-300"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8l4-4" />
      </svg>
      Natrag na kartu
    </Link>
  )
}

function DataSection() {
  return (
    <Section title="Podaci">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            ZET GTFS
          </span>
          <p className="font-medium text-slate-400">
            vozni red tramvaja i buseva
          </p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            ZET GTFS-RT
          </span>
          <p className="font-medium text-slate-400">
            kašnjenja u stvarnom vremenu
          </p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            OpenStreetMap
          </span>
          <p className="font-medium text-slate-400">pješačka mreža</p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            OpenTripPlanner
          </span>
          <p className="font-medium text-slate-400">
            server za rutiranje
          </p>
        </div>
      </div>
    </Section>
  )
}

function ArchitectureSection() {
  return (
    <Section title="Arhitektura">
      <div className="space-y-3 text-[14px] leading-relaxed text-slate-300">
        <p>
          Teški dio posla radi{" "}
          <span className="font-semibold text-slate-200">Rust servis</span>{" "}
          (axum). Dijkstrin algoritam po transit grafu, zatim ekspanzija
          pješačkom mrežom od 422K čvorova iz OpenStreetMapa.
        </p>
        <p>
          <span className="font-semibold text-slate-200">GTFS-RT</span>{" "}
          kašnjenja dolaze iz ZET-ovog protobuf feeda svake 30 sekundi
          (~600 trip updateova po osvježavanju).
        </p>
        <p>
          <span className="font-semibold text-slate-200">ts-rs</span>{" "}
          generira TypeScript tipove iz Rust structova, jedan izvor
          istine za cijeli stack.
        </p>
        <p>
          <span className="font-semibold text-slate-200">Next.js</span>{" "}
          servira SSR stranice i lakše API endpointe.{" "}
          <span className="font-semibold text-slate-200">
            OpenTripPlanner
          </span>{" "}
          radi planiranje ruta.
        </p>
        <p>
          Ispred svega stoji{" "}
          <span className="font-semibold text-slate-200">Caddy</span>{" "}
          reverse proxy s Cloudflareom. Koordinate se snappaju na mrežu
          (~100&thinsp;m) tako da CDN može cachirati odgovore.
        </p>
      </div>
    </Section>
  )
}

function PerformanceSection() {
  return (
    <Section title="Performance">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            Izokrona
          </span>
          <p className="font-medium text-slate-400">
            40&thinsp;ms po zahtjevu (Rust) vs 244&thinsp;ms (Node.js), 6x brže
          </p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            100 korisnika istovremeno
          </span>
          <p className="font-medium text-slate-400">
            41&thinsp;req/s, nula grešaka, jedan Rust proces
          </p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            GeoJSON odgovor
          </span>
          <p className="font-medium text-slate-400">
            2.5&thinsp;MB, transit linije + pješačka mreža
          </p>
        </div>
        <div>
          <span className="mb-1 block font-semibold text-slate-200">
            GTFS-RT feed
          </span>
          <p className="font-medium text-slate-400">
            ~600 trip updateova svake 30&thinsp;s
          </p>
        </div>
      </div>
    </Section>
  )
}

function Sections() {
  return (
    <div className="mt-12 space-y-6">
      <Section title="Kako radi">
        <p className="text-[14px] leading-relaxed text-slate-300">
          Klikom na kartu Doseg izračunava izokrone koristeći Dijkstrin
          algoritam nad ZET-ovim voznim redom. Rute se rekonstruiraju na
          klijentskoj strani, pa pregled prijelaza između linija radi
          trenutno dok pomičeš miš.
        </p>
      </Section>

      <DataSection />

      <Section title="Privatnost">
        <p className="text-[14px] leading-relaxed text-slate-300">
          Nema kolačića, praćenja ni osobnih podataka. Svi upiti ostaju
          između tvog preglednika i servera za rutiranje.
        </p>
      </Section>

      <ArchitectureSection />
      <PerformanceSection />

      <Section title="Otvoreni kod">
        <p className="text-[14px] leading-relaxed text-slate-300">
          Cjelokupni izvorni kod je dostupan na{" "}
          <a
            href="https://github.com/mislavjc/doseg"
            className="font-semibold text-slate-200 underline decoration-slate-600 underline-offset-2 transition-colors hover:text-white hover:decoration-slate-400"
          >
            GitHubu
          </a>
          .
        </p>
      </Section>
    </div>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-background">
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:py-24">
        <BackLink />

        <h1 className="mt-12 text-4xl font-bold tracking-tighter text-white sm:text-5xl">
          Doseg
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-slate-400 sm:text-[18px]">
          Interaktivna karta dosega javnog prijevoza u Zagrebu. Klikni bilo gdje
          i vidi dokle možeš stići tramvajem ili busom u 15, 30 ili 45 minuta.
        </p>

        <Sections />

        <p className="mt-12 text-[13px] font-medium text-slate-500">
          Napravio{" "}
          <a
            href="https://mislavjc.com"
            className="text-slate-400 underline decoration-slate-700 underline-offset-2 transition-colors hover:text-white hover:decoration-slate-400"
          >
            Mislav Jovanović
          </a>
        </p>
      </main>
    </div>
  )
}
