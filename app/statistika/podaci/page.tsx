import type { Metadata } from "next"
import { PodaciDashboard } from "../podaci-dashboard"

export const metadata: Metadata = {
  title: "Detaljni podaci o povezanosti kvartova — Doseg",
  description:
    "Detaljna analiza zagrebačke prometne mreže po kvartovima: struktura, linije, centralnost, matrica putovanja, BAJS i metodologija. Otvoreni podaci.",
  alternates: { canonical: "/statistika/podaci" },
}

export const revalidate = 3600

const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Doseg — ocjene povezanosti zagrebačkih kvartova",
  description:
    "Ocjene dostupnosti javnog prijevoza za 17 zagrebačkih kvartova (gradskih četvrti): doseg u 30 minuta, rang, linije i metodologija. Izračunato iz ZET GTFS voznog reda.",
  url: "https://doseg.hr/statistika/podaci",
  inLanguage: "hr",
  creator: { "@type": "Organization", name: "Doseg", url: "https://doseg.hr" },
  distribution: {
    "@type": "DataDownload",
    encodingFormat: "application/json",
    contentUrl: "https://doseg.hr/api/open-data",
  },
}

export default function PodaciPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <PodaciDashboard />
    </>
  )
}
