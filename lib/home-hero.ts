import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import type { Ring } from "@/lib/geo"
import type { LineHeroMeta } from "@/lib/line-data"

import { readJsonCached } from "./page-data"

/**
 * Homepage banner data baked by scripts/build-home-hero.ts: the city-wide
 * dither crops (public/hero-zagreb*.png) plus the whole-Zagreb boundary ring
 * (districts.geojson dissolved), drawn over the banner like a kvart border.
 */
export interface HomeHeroData extends LineHeroMeta {
  boundary: Ring
}

export function loadHomeHero(): HomeHeroData | null {
  return readJsonCached<HomeHeroData>(join(getDataDir(), "home-hero.json"))
}
