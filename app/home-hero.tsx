import { HeroBand } from "@/components/dither-hero"
import type { HomeHeroData } from "@/lib/home-hero"

import { HomeHeroVariant } from "./home-hero-variant"
import type { HeroFocus } from "./home-hero-variant"

/**
 * City banner (Paper "Home v2.0 — banner, cijela stranica"): the kvart hero
 * grammar zoomed out to the whole city — baked dither band, the Zagreb
 * boundary outlined with the shared white-halo-under-blue stroke, and the
 * city-name badge sitting on the border. SiteNav floats on top exactly like
 * on the kvart/line/stop pages. With a `focus` point (the /adresa page) the
 * band renders zoomed 4.5× to that address instead, marker on the point.
 * Without a baked banner (fresh checkout before the hero bake) it is a plain
 * nav row.
 */
export function HomeHero({
  hero,
  focus,
}: {
  hero: HomeHeroData | null
  focus?: HeroFocus | null
}) {
  return (
    <HeroBand meta={hero} emptyClassName="h-[120px]">
      {(slice) =>
        hero && <HomeHeroVariant hero={hero} slice={slice} focus={focus} />
      }
    </HeroBand>
  )
}
