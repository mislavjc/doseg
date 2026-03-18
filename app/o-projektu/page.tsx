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
    <section className="rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/[0.08]">
      <h2 className="text-[14px] font-semibold tracking-wide text-slate-200">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-background">
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:py-24">
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

        <h1 className="mt-12 text-4xl font-bold tracking-tighter text-white sm:text-5xl">
          Doseg
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-slate-400 sm:text-[18px]">
          Interaktivna karta dosega javnog prijevoza u Zagrebu. Klikni bilo gdje
          i vidi dokle možeš stići tramvajem ili busom u 15, 30 ili 45 minuta.
        </p>

        <div className="mt-12 space-y-6">
          <Section title="Kako radi">
            <p className="text-[14px] leading-relaxed text-slate-300">
              Klikom na kartu Doseg izračunava izokrone koristeći Dijkstrin
              algoritam nad ZET-ovim voznim redom. Rute se rekonstruiraju na
              klijentskoj strani, pa pregled prijelaza između linija radi
              trenutno dok pomičeš miš.
            </p>
          </Section>

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

          <Section title="Privatnost">
            <p className="text-[14px] leading-relaxed text-slate-300">
              Nema kolačića, praćenja ni osobnih podataka. Svi upiti ostaju
              između tvog preglednika i servera za rutiranje.
            </p>
          </Section>
        </div>

        <p className="mt-12 text-[13px] font-medium text-slate-500">
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
