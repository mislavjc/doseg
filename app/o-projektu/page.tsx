import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "O projektu — Doseg",
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
    <section className="rounded-xl bg-white/[0.04] px-5 py-4 ring-1 ring-white/[0.06]">
      <h2 className="text-[13px] font-medium tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-background">
      <main
        id="main-content"
        className="mx-auto max-w-xl px-5 py-12 sm:py-20"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-200"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
          Natrag na kartu
        </Link>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
          Doseg
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
          Interaktivna karta dosega javnog prijevoza u Zagrebu. Klikni bilo gdje
          i vidi dokle možeš stići tramvajem ili busom u 15, 30 ili 45 minuta.
        </p>

        <div className="mt-10 space-y-4">
          <Section title="Kako radi">
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate-300">
              Klikom na kartu Doseg izračunava izokrone koristeći Dijkstrin
              algoritam nad ZET-ovim voznim redom. Rute se rekonstruiraju
              na klijentskoj strani, pa pregled prijelaza između linija
              radi trenutno dok pomičeš miš.
            </p>
          </Section>

          <Section title="Podaci">
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <div>
                <span className="text-slate-200">ZET GTFS</span>
                <p className="text-slate-500">vozni red tramvaja i buseva</p>
              </div>
              <div>
                <span className="text-slate-200">ZET GTFS-RT</span>
                <p className="text-slate-500">kašnjenja u stvarnom vremenu</p>
              </div>
              <div>
                <span className="text-slate-200">OpenStreetMap</span>
                <p className="text-slate-500">pješačka mreža</p>
              </div>
              <div>
                <span className="text-slate-200">OpenTripPlanner</span>
                <p className="text-slate-500">server za rutiranje</p>
              </div>
            </div>
          </Section>

          <Section title="Privatnost">
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate-300">
              Nema kolačića, praćenja ni osobnih podataka. Svi upiti ostaju
              između tvog preglednika i servera za rutiranje.
            </p>
          </Section>
        </div>

        <p className="mt-8 text-[13px] text-slate-500">
          Napravio{" "}
          <a
            href="https://mislavjc.com"
            className="text-slate-400 underline decoration-slate-700 underline-offset-2 transition-colors hover:text-white hover:decoration-slate-400"
          >
            Mislav Jovanić
          </a>
        </p>
      </main>
    </div>
  )
}
