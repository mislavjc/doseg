import type { Metadata } from "next"
import { loadScores, loadAllData } from "../stat-data"
import { Shell, BackLink } from "../stat-shared"
import { StatPageTitle, StatGroupLead } from "../stat-typography"
import {
  DistrictCardV1,
  DistrictCardV2,
  DistrictCardV3,
  DistrictCardV4,
  DistrictCardV5,
  DistrictCardV6,
  DistrictCardV7,
  DistrictCardV8,
  DistrictCardV9,
  DistrictCardV10,
  DistrictCardV11,
  DistrictCardV12,
  DistrictCardV13,
  DistrictCardV14,
  DistrictCardV15,
  DistrictCardV16,
  DistrictCardV17,
  DistrictCardV18,
  DistrictCardV19,
  DistrictCardV20,
  DistrictCardV21,
  DistrictCardV22,
  DistrictCardV23,
  DistrictCardV24,
  DistrictCardV25,
  DistrictCardV26,
  DistrictCardV27,
} from "../district-card-variants"

export const metadata: Metadata = {
  title: "Testiranje Kartica Kvartova",
  description: "Pregled svih 10 dizajn varijanti kartica.",
}

type CardVariant = {
  title: string
  Component: React.ComponentType<{
    district: ReturnType<typeof loadAllData>["bands"][number]["districts"][number]
    emblemPath?: string
    totalGridCells: number
    bandColor: string
    cityAvg: number
    bestDistrict: string
    mapLink: string
  }>
  fullWidth?: boolean
}

const variants: CardVariant[] = [
  { title: "V1: Vercel Style", Component: DistrictCardV1 },
  { title: "V2: Linear Style", Component: DistrictCardV2 },
  { title: "V3: Apple iOS Style", Component: DistrictCardV3 },
  { title: "V4: Horizontal Flow (Puni red)", Component: DistrictCardV4, fullWidth: true },
  { title: "V5: Swiss Poster", Component: DistrictCardV5 },
  { title: "V6: Soft Clean", Component: DistrictCardV6 },
  { title: "V7: Outline Style", Component: DistrictCardV7 },
  { title: "V8: Notion Style", Component: DistrictCardV8 },
  { title: "V9: Floating Badges", Component: DistrictCardV9 },
  { title: "V10: Clean Modern Baseline", Component: DistrictCardV10 },
  { title: "V11: V1 Airy (Veće margine)", Component: DistrictCardV11 },
  { title: "V12: V6 Minimal Line (Obojani rub)", Component: DistrictCardV12 },
  { title: "V13: V1 Glass (Zamućena pozadina)", Component: DistrictCardV13 },
  { title: "V14: V6 Structured Grid (Mreža)", Component: DistrictCardV14 },
  { title: "V15: V1 Typographic (Samo tipografija)", Component: DistrictCardV15 },
  { title: "V16: V6 Elevated (Uzdignuto)", Component: DistrictCardV16 },
  { title: "V17: V1 Precision (Tablični redovi)", Component: DistrictCardV17 },
  { title: "V18: V6 Data Dense (Podijeljen layout)", Component: DistrictCardV18 },
  { title: "V19: V1 Soft Shadow (Meke sjene)", Component: DistrictCardV19 },
  { title: "V20: V1/V6 Hybrid (Vanjski okvir + V1 struktura)", Component: DistrictCardV20 },
  { title: "V21: V1 Data Dense (Svi podaci)", Component: DistrictCardV21 },
  { title: "V22: V6 Data Rich (Svi podaci)", Component: DistrictCardV22 },
  { title: "V23: V1 Comprehensive Dashboard", Component: DistrictCardV23 },
  { title: "V24: V6 Expanded Vertical", Component: DistrictCardV24 },
  { title: "V25: The Ultimate Data Card", Component: DistrictCardV25 },
  { title: "V26: V21/V22 Mix (Amblem + V6 okvir)", Component: DistrictCardV26 },
  { title: "V27: V21/V22 Mix (Alternative)", Component: DistrictCardV27 },
]

export default function TestCardsPage() {
  const data = loadScores()
  if (!data) {
    return (
      <Shell>
        <div className="p-6">
          <BackLink />
          <p>Nema podataka. Pokrenite OTP.</p>
        </div>
      </Shell>
    )
  }

  const all = loadAllData(data)
  const sampleDistrict = all.bands[0].districts[0]
  const sampleColor = all.bands[0].color
  const sampleEmblem = all.districtEmblems[String(sampleDistrict.osmId)]

  const props = {
    district: sampleDistrict,
    emblemPath: sampleEmblem,
    totalGridCells: data.totalGridCells,
    bandColor: sampleColor,
    cityAvg: all.base.cityAvg,
    bestDistrict: all.base.best.name,
    mapLink: "#",
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-24 sm:px-6">
        <BackLink />
        <StatPageTitle className="mt-8 mb-4">Testiranje Kartica Kvartova</StatPageTitle>
        <StatGroupLead>
          Pregled svih 10 različitih dizajn varijanti za prikaz kvartova.
        </StatGroupLead>

        <div className="mt-16 space-y-24">
          {variants.map(({ title, Component, fullWidth }) => (
            <VariantSection key={title} title={title}>
              {fullWidth ? (
                <div className="w-full">
                  <Component {...props} />
                </div>
              ) : (
                <Component {...props} />
              )}
            </VariantSection>
          ))}
        </div>
      </div>
    </Shell>
  )
}

function VariantSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-6 font-mono text-sm font-bold uppercase tracking-widest text-slate-500">
        {title}
      </h2>
      <div className="mx-auto max-w-sm rounded-xl border border-slate-200/50 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
        {children}
      </div>
    </section>
  )
}
