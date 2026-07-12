import { Breadcrumb } from "./blocks"
import { Body, Hook, PageTitle, Section } from "./primitives"
import { SectionNav } from "./section-nav"

/**
 * Intro / "Sadržaj" (Paper node 1PU-0): page title, lead, the in-page section
 * nav, then the "Što znači bod" score primer. Dynamic numbers (window length,
 * district count, departure time) are wired so the copy tracks live data; the
 * "7,4×" punchline is deliberately held back for the Nejednakost section.
 */

const SECTIONS = [
  { label: "povezanost", id: "povezanost" },
  { label: "nejednakost", id: "nejednakost" },
  { label: "matrica", id: "matrica" },
  { label: "metodologija", id: "metodologija" },
]

export function Intro({
  maxMinutes = 30,
  districtCount = 17,
  departureWindow = "07:30-08:30",
}: {
  maxMinutes?: number
  districtCount?: number
  departureWindow?: string
}) {
  const windowLabel = departureWindow.replace("-", " do ")
  return (
    <Section>
      <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "statistika" }]} />
      <PageTitle className="mt-4">Statistika dostupnosti zagrebačkog prijevoza</PageTitle>
      <Body className="mt-4.5">
        Koliko je grada dostupno iz vašeg kvarta u {maxMinutes} minuta javnim
        prijevozom? Doseg mjeri stvarni doseg svakog od {districtCount} zagrebačkih
        gradskih kvartova: tramvajem, autobusom, vlakom i BAJS biciklom.
      </Body>

      <SectionNav items={SECTIONS} className="mt-6" />

      <Hook className="mt-8">Što znači bod</Hook>
      <Body className="mt-4.5">
        Svakom kvartu dodjeljujemo bod od 0 do 100 prema udjelu površine grada
        dostupnom u {maxMinutes} minuta, s polascima radnim danom u prozoru od{" "}
        {windowLabel}. Veći bod znači da je iz tog kvarta dostupno više grada.
      </Body>
      <Body className="mt-4.5">
        Razlika među kvartovima je golema: iz najbolje povezanih dosegnete
        višestruko više grada nego iz najslabijih.
      </Body>
    </Section>
  )
}
