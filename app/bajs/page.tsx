import type { Metadata } from "next"
import { cacheLife, cacheTag } from "next/cache"
import { Suspense } from "react"

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
 * Everything below the hero is cached for a minute and revalidated in the
 * background (`cacheLife("minutes")`, tag `bajs`), so the route prerenders and
 * serves a static shell. That matches what the readers already allowed: the
 * measured endpoints are 5-minute data, the utilization and the surplus table's
 * GBFS snapshot are 60-second data. The live hero numbers stay per request;
 * see `./hero`.
 *
 * Without the RT server (a Docker build has none) the rides come back null.
 * That result only lives for seconds, which keeps it out of the prerender: the
 * shell then holds the Suspense boundary instead of a frozen "server not
 * responding" state, and the body renders per request until the server answers.
 */
async function loadMeasured() {
  "use cache"
  cacheTag("bajs")

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
  if (rides === null) cacheLife("seconds")
  else cacheLife("minutes")
  return {
    rides,
    ranking,
    live,
    flow,
    balance,
    relocations,
    updated: (rides?.measuredTo ?? new Date()).toISOString(),
  }
}

type Measured = Awaited<ReturnType<typeof loadMeasured>>

function Intro({ rides }: { rides: Measured["rides"] }) {
  return (
    <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
      <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "bajs" }]} />
      <PageTitle className="mt-4">Bajs u brojkama.</PageTitle>
      <Body className="mt-1 text-ink-muted">
        javni bicikli u zagrebu, vožnja po vožnju
      </Body>
      {rides !== null && rides.avgPerDay !== null ? (
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
  )
}

function Measurements({ m }: { m: Measured }) {
  const { rides, ranking, flow, balance, relocations } = m
  if (rides === null || rides.avgPerDay === null) {
    return (
      <Section id="metodologija">
        <BodyMuted>
          Izmjerene brojke dolaze s poslužitelja koji trenutno ne odgovara.
          Karta iznad čita javni feed izravno, pa je i dalje točna.
        </BodyMuted>
      </Section>
    )
  }
  return (
    <>
      <Dani rides={rides} />
      <Odstupanje balance={balance} />
      <Reljef ranking={ranking} />
      <Ritam rides={rides} />
      <Smjer flow={flow} />
      <Kicker rides={rides} />
      <Stanice ranking={ranking} rides={rides} />
      <Kombi relocations={relocations} rides={rides} />
      <Zakljucak rides={rides} balance={balance} relocations={relocations} />
      <Metodologija rides={rides} />
    </>
  )
}

async function BajsBody() {
  const m = await loadMeasured()
  return (
    <>
      <Intro rides={m.rides} />
      {m.live && (
        <Ravnoteza
          docked={m.live.docked}
          knownFleet={m.live.knownFleet}
          stations={m.live.stations}
          empty={m.live.empty}
        />
      )}
      <Measurements m={m} />
      <Footer updated={m.updated} />
    </>
  )
}

export default function BajsPage() {
  return (
    <EditorialShell>
      <JsonLd data={breadcrumbJsonLd([{ name: "Bajs", path: "/bajs" }])} />
      <BajsHero />
      <Suspense>
        <BajsBody />
      </Suspense>
    </EditorialShell>
  )
}
