import { Body, BodyMuted, Chip, Eyebrow, Hook, MonoLabel, Section } from "./primitives"

/**
 * Metodologija (Paper node FTP-0) — how the score is computed, the parameter
 * chips, and the "uz oprez" caveats. Downloads + deep-dive link live in the footer.
 */

export function Metodologija({
  departureWindow = "07:30-08:30",
}: {
  departureWindow?: string
}) {
  const caveats = [
    "bod je relativan: najbolje povezani kvart (danas Donji grad) je 100, ostali se mjere prema njemu.",
    `jedan snimak: radni dan, jutarnji špic (${departureWindow}); navečer i vikendom slika je drukčija.`,
  ]
  const chips = [
    "30 min",
    "raster 200 m",
    `radni dan ${departureWindow}`,
    "OSM + GTFS",
    "ZET + HŽPP",
    "0–100",
  ]
  return (
    <Section id="metodologija">
      <div className="flex flex-col gap-5">
        <Eyebrow>metodologija</Eyebrow>
        <Hook>Kako računamo doseg</Hook>
        <Body>
          Iz svake točke u gradu računamo koliko se površine može dohvatiti
          javnim prijevozom za pola sata, pa to svedemo na bod od 0 do 100.
        </Body>

        <div className="flex flex-wrap gap-1.75 pt-0.5">
          {chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2.25">
          <MonoLabel className="text-[11px]">uz oprez</MonoLabel>
          {caveats.map((c) => (
            <div key={c} className="flex items-baseline gap-2.5">
              <span className="shrink-0 font-mono text-label text-zg-blue">·</span>
              <BodyMuted>{c}</BodyMuted>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
