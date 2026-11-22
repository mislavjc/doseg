import type { RouteStatsRoute as RouteInfo } from "@/lib/generated"
import StatSectionTabs from "@/components/table-of-contents"
import NetworkStatsSection from "./network-stats-section"
import PunctualitySection from "./punctuality-section"
import FleetDeploymentSection from "./fleet-deployment-section"
import OccupancySection from "./occupancy-section"
import DelayPropagationSection from "./delay-propagation-section"
import BajsUtilizationSection from "./bajs-utilization-section"
import InsightsSection from "./insights-section"
import AccessibilityProfileSection from "./accessibility-profile-section"
import { loadScores, loadAllData, sortRoutesByName } from "./stat-data"
import type { ScoreData, AllData } from "./stat-data"
import { formatHrDate } from "@/lib/hr-date"
import { Breadcrumb } from "./editorial/blocks"
import { Footer } from "./editorial/footer"
import { Hero } from "./editorial/hero"
import { EditorialShell } from "./editorial/primitives"
import { BackLink, SectionGroup } from "./stat-shared"
import { StatMuted, StatPageTitle } from "./stat-typography"
import {
  StatHero,
  HeadlineInsights,
  ChoroplethSection,
  ScoreMeaningSection,
  AccessibilityGapSection,
} from "./hero-section"
import { LorenzSection, GiniSection } from "./lorenz-gini-section"
import {
  DensityScatterSection,
  TramSection,
  HzTrainSection,
} from "./density-tram-train-sections"
import {
  TransitDesertSection,
  StopDistanceSection,
  PeakOffPeakSection,
  WeekendSection,
} from "./desert-time-sections"
import {
  BajsImpactSection,
  VarianceSection,
  FrequencySection,
  LineSpeedSection,
} from "./bajs-variance-freq-speed-sections"
import {
  RouteStatsSection,
  TravelMatrixSection,
  TransferDependencySection,
  CentralitySection,
} from "./route-matrix-centrality-sections"
import { DistrictBandsSection, MethodologySection } from "./district-sections"

/**
 * The legacy deep-dive dashboard (network, route stats, centrality, BAJS, travel
 * matrix, peak/weekend, density, etc.) — now served at /statistika/podaci. The
 * editorial /statistika links here for the full analysis.
 */
export function PodaciDashboard() {
  const data = loadScores()
  return (
    <EditorialShell>
      <Hero active="statistika" />
      {data ? <StatistikaContent data={data} /> : <NoDataMessage />}
      <Footer updated={data ? formatHrDate(data.generatedAt) : ""} />
    </EditorialShell>
  )
}

function PodaciBreadcrumb() {
  return (
    <Breadcrumb
      trail={[
        { label: "doseg.hr", href: "/" },
        { label: "statistika", href: "/statistika" },
        { label: "podaci" },
      ]}
    />
  )
}

function NoDataMessage() {
  return (
    <div className="mx-auto w-full max-w-[620px] px-4 py-14 sm:px-8 sm:py-20">
      <PodaciBreadcrumb />
      <StatPageTitle className="mt-4">Povezanost kvartova</StatPageTitle>
      <div className="mt-6 flex flex-col gap-1 border-l-2 border-ink bg-surface p-5">
        <StatMuted>
          Nije moguće generirati podatke. Provjeri je li OTP pokrenut.
        </StatMuted>
        <p className="text-body text-ink-muted">
          Pokreni{" "}
          <code className="font-mono text-label text-ink">
            docker compose up otp
          </code>{" "}
          pa osvježi stranicu.
        </p>
      </div>
      <div className="mt-4">
        <BackLink />
      </div>
    </div>
  )
}

function StatistikaContent({ data }: { data: ScoreData }) {
  const all = loadAllData(data)
  return (
    <>
      <div className="mx-auto w-full max-w-[620px] px-4 pt-14 sm:px-8 sm:pt-16">
        <PodaciBreadcrumb />
        <StatHero
          best={all.base.best}
          bestPct={all.base.bestPct}
          departureTime={all.base.displayDepartureTime}
          maxMinutes={data.maxMinutes}
          ratio={all.base.ratio}
          worst={all.base.worst}
        />
        <div className="mt-4">
          <BackLink />
        </div>
      </div>
      <StatSectionTabs />
      <div className="mx-auto w-full max-w-[840px] px-4 pb-20 sm:px-8">
        <HeadlineInsights data={data} base={all.base} bajs={all.bajs} />
        <ChoroplethSection />
        <InsightsSection connectivityGaps={all.connectivityGaps} />
        <StatistikaContentSections data={data} all={all} />
      </div>
    </>
  )
}

function StatistikaContentSections({
  data,
  all,
}: {
  data: ScoreData
  all: AllData
}) {
  return (
    <>
      <RealTimeGroup all={all} />
      <ReliabilityGroup routeStats={all.routeStats} />
      <AccessibilityGroup data={data} all={all} />
      <BajsGroup data={data} bajs={all.bajs} />
      <DeepDiveGroup data={data} all={all} />
      <DistrictBandsSection
        data={data}
        bands={all.bands}
        districtEmblems={all.districtEmblems}
        base={all.base}
      />
      <MethodologySection data={data} base={all.base} bajs={all.bajs} />
    </>
  )
}

function RealTimeGroup({ all }: { all: AllData }) {
  const routes = sortRoutesByName(
    all.routeStats?.routes.filter((r: RouteInfo) => r.mode !== "RAIL") ?? []
  )
  return (
    <SectionGroup
      id="promet-danas"
      number={1}
      eyebrow="Promet uživo"
      title="Radi li promet danas?"
      description="Stvarni podaci iz ZET-ovog sustava praćenja vozila u realnom vremenu."
    >
      {all.routeStats && (
        <PunctualitySection
          routes={routes.map((r) => ({ name: r.name, mode: r.mode }))}
        />
      )}
      {all.routeStats && (
        <DelayPropagationSection routes={routes.map((r) => r.name)} />
      )}
    </SectionGroup>
  )
}

function ReliabilityGroup({
  routeStats,
}: {
  routeStats: AllData["routeStats"]
}) {
  return (
    <SectionGroup
      id="pouzdanost"
      number={2}
      eyebrow="Kvaliteta usluge"
      title="Pouzdanost i brzina linija"
      description="Koliko su pouzdane pojedine linije - iz voznog reda i stvarnih mjerenja."
    >
      <RouteStatsSection routeStats={routeStats} />
      <FleetDeploymentSection />
      <OccupancySection />
    </SectionGroup>
  )
}

function AccessibilityGroup({ data, all }: { data: ScoreData; all: AllData }) {
  return (
    <SectionGroup
      id="povezanost"
      number={3}
      eyebrow="Dostupnost"
      title="Povezanost kvartova"
      description="Koliko je grada dostupno iz vašeg kvarta u 30 minuta javnim prijevozom."
    >
      <AccessibilityProfileSection />
      <ScoreMeaningSection data={data} base={all.base} bajs={all.bajs} />
      <AccessibilityGapSection base={all.base} />
      <PeakOffPeakSection data={data} base={all.base} evening={all.evening} />
      <WeekendSection weekend={all.weekend} />
      <TravelMatrixSection
        travelMatrix={all.travelMatrix}
        matrix={all.matrix}
      />
      <TransferDependencySection travelMatrix={all.travelMatrix} />
    </SectionGroup>
  )
}

function BajsGroup({ data, bajs }: { data: ScoreData; bajs: AllData["bajs"] }) {
  return (
    <SectionGroup
      id="bajs"
      number={4}
      eyebrow="Mikromobilnost"
      title="BAJS bicikli"
      description="Dijeljeni bicikli kao nadopuna javnom prijevozu - dostupnost i utjecaj na povezanost."
    >
      <BajsUtilizationSection />
      <BajsImpactSection data={data} bajs={bajs} />
    </SectionGroup>
  )
}

function DeepDiveGroup({ data, all }: { data: ScoreData; all: AllData }) {
  return (
    <SectionGroup
      id="analiza"
      number={5}
      eyebrow="Dublja analiza"
      title="Struktura mreže"
      description="Detaljnija analiza za one koji žele razumjeti sustav u dubinu."
    >
      <NetworkStatsSection />
      <CentralitySection />
      <DensityScatterSection scatter={all.scatter} />
      <TransitDesertSection data={data} desert={all.desert} />
      <StopDistanceSection desert={all.desert} />
      <TramSection freq={all.freq} />
      <HzTrainSection data={data} />
      <LorenzSection giniData={all.giniData} />
      <GiniSection giniData={all.giniData} />
      <VarianceSection data={data} variance={all.variance} />
      <FrequencySection freq={all.freq} />
      <LineSpeedSection lineSpeed={all.lineSpeed} />
    </SectionGroup>
  )
}
