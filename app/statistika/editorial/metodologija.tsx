import { Body, BodyMuted, Chip, Eyebrow, Hook, MonoLabel, Section } from "./primitives"

/**
 * Metodologija (Paper node FTP-0) — how the score is computed, the parameter
 * chips, and the "uz oprez" caveats. Downloads + deep-dive link live in the footer.
 */

const CHIPS = [
  "30 min",
  "raster 200 m",
  "radni dan 08:00",
  "OSM + GTFS",
  "ZET + HŽPP",
  "0–100",
]

const CAVEATS = [
  "bod je relativan: Donji grad je 100 po definiciji, ostali se mjere prema njemu.",
  "jedan snimak: radni dan, jutarnji špic oko 8 h; navečer i vikendom slika je drukčija.",
]

export function Metodologija() {
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
          {CHIPS.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2.25">
          <MonoLabel className="text-[11px]">uz oprez</MonoLabel>
          {CAVEATS.map((c) => (
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
