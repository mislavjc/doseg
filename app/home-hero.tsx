import { SiteNav } from "@/app/statistika/editorial/site-nav"
import type { HomeHeroData } from "@/lib/home-hero"

import { HomeHeroVariant, type HeroFocus } from "./home-hero-variant"

/**
 * City banner (Paper "Home v2.0 — banner, cijela stranica"): the kvart hero
 * grammar zoomed out to the whole city — baked dither band, the Zagreb
 * boundary outlined with the shared white-halo-under-blue stroke, and the
 * city-name badge sitting on the border. SiteNav floats on top exactly like
 * on the kvart/line/stop pages. With a `focus` point (the /adresa page) the
 * band renders zoomed 4.5× to that address instead, marker on the point.
 */
export function HomeHero({
  hero,
  focus,
}: {
  hero: HomeHeroData | null
  focus?: HeroFocus | null
}) {
  return (
    <header className="relative bg-white">
      {hero ? (
        <>
          <HomeHeroVariant
            hero={hero}
            crop={hero.desktop}
            src="/hero-zagreb.png"
            variant="desktop"
            focus={focus}
            className="hidden sm:block"
          />
          <HomeHeroVariant
            hero={hero}
            crop={hero.mobile}
            src="/hero-zagreb-m.png"
            variant="mobile"
            focus={focus}
            className="sm:hidden"
          />
        </>
      ) : (
        // No baked banner (fresh checkout before the hero bake) — plain nav row.
        <div className="h-[120px]" />
      )}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_18px)] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav />
      </div>
    </header>
  )
}
