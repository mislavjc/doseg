import type { Metadata } from "next"

import { Breadcrumb } from "@/app/statistika/editorial/blocks"
import { Footer } from "@/app/statistika/editorial/footer"
import { breadcrumbJsonLd, JsonLd } from "@/app/statistika/editorial/json-ld"
import {
  Body,
  BodyMuted,
  EditorialShell,
  PageTitle,
  Section,
  Strong,
} from "@/app/statistika/editorial/primitives"
import { loadBajsBalance } from "@/lib/bajs-balance"
import { loadBajsRelocations, loadBajsStationFlow } from "@/lib/bajs-flow"
import { loadBajsLive, loadBajsRanking, loadBajsRides } from "@/lib/bajs-rides"
import { pseoMetadata } from "@/lib/pseo-metadata"

import { BajsHero } from "./hero"

import {
  Dani,
  Kicker,
  Kombi,
  Metodologija,
  Odstupanje,
  Ravnoteza,
  Reljef,
  Ritam,
  Smjer,
  Stanice,
  Zakljucak,
} from "./sections"

export const metadata: Metadata = pseoMetadata({
  title: "Bajs u brojkama - koliko se javnih bicikala vozi u Zagrebu | Doseg",
  description:
    "Koliko vožnji javnim biciklima Zagreb napravi u danu, u kojem satu je vrh i koje su stanice najprometnije. Brojano iz otvorenog GBFS feeda, vožnju po vožnju.",
  path: "/bajs",
  ogType: "website",
  ogImage: "/og.jpg",
})

/** The measurement is young, so the window is short and cheap to aggregate. */
const WINDOW_DAYS = 30

/**
 * This route renders per request rather than on a revalidation timer, because
 * the surplus table reads the live GBFS snapshot through `getBajsData()`, whose
 * fetch is `no-store`. The cost is small: that loader keeps its own 60 s
 * in-process cache and the measured endpoints are cached for 5 minutes, so a
 * request is usually just a render. If crawl budget ever argues for a static
 * page, the surplus section is the thing to move client-side.
 */

export default async function BajsPage() {
  const [rides, ranking, live, flow] = await Promise.all([
    loadBajsRides(WINDOW_DAYS),
    loadBajsRanking(WINDOW_DAYS),
    loadBajsLive(),
    loadBajsStationFlow(WINDOW_DAYS),
  ])
  // Both need something from the loads above, so they run after rather than
  // alongside: the balance wants the ranking's empty shares, and the van rate
  // is only meaningful over the days the rides reader judged complete.
  const [balance, relocations] = await Promise.all([
    loadBajsBalance(ranking),
    loadBajsRelocations(WINDOW_DAYS, rides?.fullDays),
  ])

  const hasRides = rides !== null && rides.avgPerDay !== null

  return (
    <EditorialShell>
      <JsonLd data={breadcrumbJsonLd([{ name: "Bajs", path: "/bajs" }])} />
      <BajsHero />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "bajs" }]} />
        <PageTitle className="mt-4">Bajs u brojkama.</PageTitle>
        <Body className="mt-1 text-ink-muted">
          javni bicikli u zagrebu, vožnja po vožnju
        </Body>
        {hasRides && rides.avgPerDay !== null ? (
          <Body className="mt-5 max-w-[560px]">
            Zagreb napravi oko{" "}
            <Strong>
              {new Intl.NumberFormat("hr-HR").format(
                Math.round(rides.avgPerDay / 100) * 100
              )}{" "}
              vožnji
            </Strong>{" "}
            javnim biciklom svaki dan. Nitko tu brojku ne objavljuje, pa je
            brojimo sami: svake minute snimimo koji bicikl stoji na kojoj
            stanici i usporedimo dvije uzastopne snimke.
          </Body>
        ) : (
          <Body className="mt-5 max-w-[560px]">
            Svake minute snimamo koji bicikl stoji na kojoj stanici i
            usporedbom uzastopnih snimaka brojimo vožnje. Brojke se trenutno ne
            mogu dohvatiti, ali karta stanica ispod radi uživo.
          </Body>
        )}
      </Section>

      {live && (
        <Ravnoteza
          docked={live.docked}
          knownFleet={live.knownFleet}
          stations={live.stations}
          empty={live.empty}
        />
      )}

      {hasRides ? (
        <>
          <Dani rides={rides} />
          <Odstupanje balance={balance} />
          <Reljef ranking={ranking} />
          <Ritam rides={rides} />
          <Smjer flow={flow} />
          <Kicker rides={rides} />
          <Stanice ranking={ranking} rides={rides} />
          <Kombi relocations={relocations} rides={rides} />
          <Zakljucak
            rides={rides}
            balance={balance}
            relocations={relocations}
          />
          <Metodologija rides={rides} />
        </>
      ) : (
        <Section id="metodologija">
          <BodyMuted>
            Izmjerene brojke dolaze s poslužitelja koji trenutno ne odgovara.
            Karta iznad čita javni feed izravno, pa je i dalje točna.
          </BodyMuted>
        </Section>
      )}

      <Footer
        updated={(rides?.measuredTo ?? new Date()).toISOString()}
      />
    </EditorialShell>
  )
}
