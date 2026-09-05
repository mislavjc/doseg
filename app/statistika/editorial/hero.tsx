import { SiteNav } from "./site-nav"

/**
 * Shared header band — full-bleed dithered edge-map of central Zagreb with a
 * pixel-cloud fade dissolving into the page, and the contained site nav on top.
 * One band for every page (Paper "Nav unifikacija — U3"): 400px desktop /
 * 340px mobile, nav 56px from the top. Pages keep their identity via the map
 * crop (`mapPosition` — statistika shows Donji grad, o projektu the park belt).
 * Both layers are static brand assets (public/hero-map.png, hero-cloud.png).
 */
export function Hero({
  active = "statistika",
  mapPosition = "center 46%",
}: {
  active?: string
  mapPosition?: string
}) {
  return (
    <header className="relative flex h-[340px] flex-col items-center overflow-clip bg-white pt-14 sm:h-[400px]">
      {/* Dither map (decorative; aria-hidden — nav carries the page identity).
          The <picture> wrapper keeps React from emitting a preload hint for
          it: the hint rides along in every prefetched RSC payload, so without
          it each line/stop/kvart page fetched this 112K map it never shows. */}
      <picture>
        <img
          src="/hero-map.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: mapPosition }}
        />
      </picture>
      {/* Pixel-cloud fade to white */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />

      <div className="relative z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav active={active} />
      </div>
    </header>
  )
}
