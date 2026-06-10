import Image from "next/image"
import type { EditorialFacts } from "./facts"
import { Body, BodyMuted, Eyebrow, Hook, Section } from "./primitives"

/**
 * Nejednakost (Paper node C84-0) — the equity reveal. A tilted ZET ticket photo
 * over the "pola sata, i nigdje" punchline: the same 0,53 € / 30-min fare buys
 * wildly different reach. km²/ratio are data-wired; the fare is a literal.
 */
export function Nejednakost({ facts }: { facts: EditorialFacts }) {
  return (
    <Section id="nejednakost">
      <div className="flex flex-col gap-5">
        <div className="self-center">
          <Image
            src="/zet-ticket.jpg"
            alt="ZET papirnata karta"
            width={280}
            height={90}
            className="-rotate-[2.5deg] object-contain shadow-ticket"
          />
        </div>
        <Eyebrow>nejednakost</Eyebrow>
        <Hook>Pola sata. I nigdje.</Hook>
        <Body>
          Za 0,53 € dobiješ 30 minuta vožnje. Iz centra je to skoro cijeli grad,{" "}
          {facts.bestKm2} km². S ruba te tih istih 30 minuta jedva izvuče iz
          kvarta: {facts.worstKm2} km². {facts.ratio}× manje, za istu kartu.
        </Body>
        <BodyMuted>
          I najslabije povezan dio Donjeg grada doseže više od prosjeka svakog
          drugog kvarta, a u njemu živi tek {facts.bestPopPct}% Zagrepčana.
        </BodyMuted>
      </div>
    </Section>
  )
}
