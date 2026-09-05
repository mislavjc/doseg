import type { Metadata } from "next"
import { inter } from "@/app/fonts/inter"
import { JsonLd } from "@/app/statistika/editorial/json-ld"
import { PodaciDashboard } from "../podaci-dashboard"

export const metadata: Metadata = {
  title: "Detaljni podaci o povezanosti kvartova | Doseg",
  description:
    "Detaljna analiza zagrebačke prometne mreže po kvartovima: struktura, linije, centralnost, matrica putovanja, BAJS i metodologija. Otvoreni podaci.",
  alternates: { canonical: "/statistika/podaci" },
}

export const revalidate = 3600

// Enriched for Google Dataset Search: license + keywords + spatialCoverage are
// what make a Dataset eligible. Output is ODbL because it derives from OSM (ODbL,
// share-alike); the schedule source is ZET GTFS (Otvorena dozvola RH, credit ZET).
const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Doseg: ocjene povezanosti zagrebačkih kvartova",
  description:
    "Ocjene dostupnosti javnog prijevoza za 17 zagrebačkih kvartova: doseg u 30 minuta, rang, linije i metodologija. Izračunato iz ZET GTFS voznog reda.",
  url: "https://doseg.hr/statistika/podaci",
  inLanguage: "hr",
  license: "https://opendatacommons.org/licenses/odbl/1-0/",
  keywords: [
    "javni prijevoz",
    "Zagreb",
    "GTFS",
    "ZET",
    "dostupnost",
    "izohrone",
    "public transport accessibility",
  ],
  spatialCoverage: { "@type": "Place", name: "Zagreb, Hrvatska" },
  creator: { "@type": "Organization", name: "Doseg", url: "https://doseg.hr" },
  isBasedOn: [
    "https://www.zet.hr/odredbe/datoteke-u-gtfs-formatu/669",
    "https://www.openstreetmap.org/copyright",
  ],
  distribution: {
    "@type": "DataDownload",
    encodingFormat: "application/json",
    contentUrl: "https://doseg.hr/api/open-data",
  },
}

export default function PodaciPage() {
  return (
    <div className={inter.variable}>
      <JsonLd data={datasetJsonLd} />
      <PodaciDashboard />
    </div>
  )
}
