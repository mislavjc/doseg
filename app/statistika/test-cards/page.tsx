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
import type { District as DistrictScore } from "@/lib/generated"

export const metadata: Metadata = {
  title: "Testiranje Kartica Kvartova",
  description: "Pregled svih 10 dizajn varijanti kartica.",
}

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
  
  // Uzimamo prvi kvart za primjer prikaza
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
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 sm:px-6 pt-8">
        <BackLink />
        <StatPageTitle className="mt-8 mb-4">Testiranje Kartica Kvartova</StatPageTitle>
        <StatGroupLead>
          Pregled svih 10 različitih dizajn varijanti za prikaz kvartova.
        </StatGroupLead>

        <div className="mt-16 space-y-24">
          <VariantSection title="V1: Vercel Style">
            <DistrictCardV1 {...props} />
          </VariantSection>

          <VariantSection title="V2: Linear Style">
            <DistrictCardV2 {...props} />
          </VariantSection>

          <VariantSection title="V3: Apple iOS Style">
            <DistrictCardV3 {...props} />
          </VariantSection>

          <VariantSection title="V4: Horizontal Flow (Puni red)">
            <div className="w-full">
              <DistrictCardV4 {...props} />
            </div>
          </VariantSection>

          <VariantSection title="V5: Swiss Poster">
            <DistrictCardV5 {...props} />
          </VariantSection>

          <VariantSection title="V6: Soft Clean">
            <DistrictCardV6 {...props} />
          </VariantSection>

          <VariantSection title="V7: Outline Style">
            <DistrictCardV7 {...props} />
          </VariantSection>

          <VariantSection title="V8: Notion Style">
            <DistrictCardV8 {...props} />
          </VariantSection>

          <VariantSection title="V9: Floating Badges">
            <DistrictCardV9 {...props} />
          </VariantSection>

          <VariantSection title="V10: Clean Modern Baseline">
            <DistrictCardV10 {...props} />
          </VariantSection>

          <VariantSection title="V11: V1 Airy (Veće margine)">
            <DistrictCardV11 {...props} />
          </VariantSection>

          <VariantSection title="V12: V6 Minimal Line (Obojani rub)">
            <DistrictCardV12 {...props} />
          </VariantSection>

          <VariantSection title="V13: V1 Glass (Zamućena pozadina)">
            <DistrictCardV13 {...props} />
          </VariantSection>

          <VariantSection title="V14: V6 Structured Grid (Mreža)">
            <DistrictCardV14 {...props} />
          </VariantSection>

          <VariantSection title="V15: V1 Typographic (Samo tipografija)">
            <DistrictCardV15 {...props} />
          </VariantSection>

          <VariantSection title="V16: V6 Elevated (Uzdignuto)">
            <DistrictCardV16 {...props} />
          </VariantSection>

          <VariantSection title="V17: V1 Precision (Tablični redovi)">
            <DistrictCardV17 {...props} />
          </VariantSection>

          <VariantSection title="V18: V6 Data Dense (Podijeljen layout)">
            <DistrictCardV18 {...props} />
          </VariantSection>

          <VariantSection title="V19: V1 Soft Shadow (Meke sjene)">
            <DistrictCardV19 {...props} />
          </VariantSection>

          <VariantSection title="V20: V1/V6 Hybrid (Vanjski okvir + V1 struktura)">
            <DistrictCardV20 {...props} />
          </VariantSection>

          <VariantSection title="V21: V1 Data Dense (Svi podaci)">
            <DistrictCardV21 {...props} />
          </VariantSection>

          <VariantSection title="V22: V6 Data Rich (Svi podaci)">
            <DistrictCardV22 {...props} />
          </VariantSection>

          <VariantSection title="V23: V1 Comprehensive Dashboard">
            <DistrictCardV23 {...props} />
          </VariantSection>

          <VariantSection title="V24: V6 Expanded Vertical">
            <DistrictCardV24 {...props} />
          </VariantSection>

          <VariantSection title="V25: The Ultimate Data Card">
            <DistrictCardV25 {...props} />
          </VariantSection>

          <VariantSection title="V26: V21/V22 Mix (Amblem + V6 okvir)">
            <DistrictCardV26 {...props} />
          </VariantSection>

          <VariantSection title="V27: V21/V22 Mix (Alternative)">
            <DistrictCardV27 {...props} />
          </VariantSection>
        </div>
      </div>
    </Shell>
  )
}

function VariantSection({ title, children }: { title: string, children: React.ReactNode }) {
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
