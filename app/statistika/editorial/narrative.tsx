import { Body, BodyMuted, Eyebrow, Hook, Section } from "./primitives"

/**
 * Anatomija jaza (Paper node GD9-0) — kicker that pivots from "the gap is a
 * score" to "the gap is walk + cross-town + evening service". Left-aligned to
 * match every other section.
 */
export function Anatomija() {
  return (
    <Section>
      <div className="flex flex-col gap-5">
        <Eyebrow>anatomija jaza</Eyebrow>
        <Hook>Jaz nije samo bod.</Hook>
        <BodyMuted className="max-w-[520px]">
          Krije se u hodu do stanice, u putu preko grada i u večernjem redu vožnje.
        </BodyMuted>
      </div>
    </Section>
  )
}

/**
 * Zaključak (Paper node GDE-0) — the closing argument, ending on the blue
 * one-liner. District count is data-wired.
 */
export function Zakljucak({ districtCount = 17 }: { districtCount?: number }) {
  return (
    <Section id="zakljucak">
      <div className="flex flex-col gap-5">
        <Eyebrow>zaključak</Eyebrow>
        <Hook>Doseg je vrijeme, ne udaljenost.</Hook>
        <Body>
          Svih {districtCount} kvartova plaća istu kartu, ali za pola sata ne
          dosegnu isti grad. Gdje je doseg manji, manji je i izbor: gdje raditi,
          gdje se liječiti, gdje provesti večer.
        </Body>
        <Hook className="pt-1 text-zg-blue">
          Bolji vozni red ne dodaje grad, vraća vrijeme.
        </Hook>
      </div>
    </Section>
  )
}
