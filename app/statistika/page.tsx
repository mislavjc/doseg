import type { Metadata } from "next"
import { loadScores, loadTravelMatrix } from "./stat-data"
import {
  computeEditorialFacts,
  computeEvening,
  computePovezanost,
  computeWalk,
} from "./editorial/facts"
import { Footer } from "./editorial/footer"
import { Hero } from "./editorial/hero"
import { Intro } from "./editorial/intro"
import { Jutro } from "./editorial/jutro"
import { Matrica } from "./editorial/matrica"
import { Metodologija } from "./editorial/metodologija"
import { Anatomija, Zakljucak } from "./editorial/narrative"
import { Nejednakost } from "./editorial/nejednakost"
import { Povezanost } from "./editorial/povezanost"
import { Pristup } from "./editorial/pristup"
import { EditorialShell } from "./editorial/primitives"
import { Sesvete } from "./editorial/sesvete"

export const metadata: Metadata = {
  title: "Karta i rang povezanosti zagrebačkih kvartova | Doseg",
  description:
    "Koji su najbolje povezani kvartovi u Zagrebu? Koliko grada dosegneš iz svakog od 17 kvartova u 30 minuta javnim prijevozom: rang, karta kvartova, nejednakost i metodologija.",
  alternates: { canonical: "/statistika" },
  openGraph: {
    title: "Karta i rang povezanosti zagrebačkih kvartova | Doseg",
    description:
      "Koji su najbolje povezani kvartovi u Zagrebu? Koliko grada dosegneš iz svakog od 17 kvartova u 30 minuta javnim prijevozom.",
    type: "article",
    url: "/statistika",
    siteName: "Doseg",
    locale: "hr_HR",
  },
}

export const revalidate = 3600

export default function StatistikaPage() {
  const data = loadScores()
  const travelMatrix = loadTravelMatrix()
  const facts = data ? computeEditorialFacts(data) : null
  const pov = data ? computePovezanost(data) : null
  const walk = data ? computeWalk(data) : null

  return (
    <EditorialShell>
      <Hero active="statistika" />
      <Intro maxMinutes={data?.maxMinutes} districtCount={data?.districts.length} departureWindow={data?.departureWindow} />

      {pov && <Povezanost data={pov} />}
      {facts && <Nejednakost facts={facts} />}
      <Anatomija />
      {walk && <Pristup data={walk} />}
      {travelMatrix && (
        <Matrica
          districts={travelMatrix.districts}
          matrix={travelMatrix.matrix}
        />
      )}
      {data && <Jutro rows={computeEvening(data)} />}
      {facts && <Sesvete facts={facts} />}
      <Zakljucak districtCount={facts?.districtCount} />
      <Metodologija departureWindow={data?.departureWindow} />
      <Footer updated={pov?.updated ?? ""} />
    </EditorialShell>
  )
}
