import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { Client } from "@/components/home/client"
import { pseoMetadata } from "@/lib/pseo-metadata"

/**
 * /karta — the interactive reachability map, moved off the homepage so `/`
 * can be the imenik (directory) landing page. Shared map links carry
 * ?lat&lon here; old /?lat= URLs 301 to this route (next.config redirects).
 */

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const params = await searchParams
  const lat = typeof params.lat === "string" ? params.lat : undefined
  const lon = typeof params.lon === "string" ? params.lon : undefined
  const time = typeof params.t === "string" ? params.t : undefined

  const ogParams = new URLSearchParams()
  if (lat && lon) {
    ogParams.set("lat", lat)
    ogParams.set("lon", lon)
    if (time) ogParams.set("time", time)
  }
  const ogQuery = ogParams.toString()
  // Static Paper export for the plain map page; satori render only for
  // shared map links where the card shows the clicked district.
  const ogUrl = ogQuery ? `/api/og?${ogQuery}` : "/og.jpg"

  return pseoMetadata({
    title: "Doseg: karta dosega javnog prijevoza u Zagrebu",
    description:
      "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15 ili 30 minuta.",
    path: "/karta",
    ogType: "website",
    ogImage: ogUrl,
  })
}

/**
 * The ground under the map while MapLibre boots (Paper "Karta · učitavanje
 * (placeholder)"): the dithered figure-ground of central Zagreb, baked by
 * scripts/build-karta-placeholder.ts on the map's opening view and drawn at
 * the map's scale, centred like the map. The map's canvas is transparent until
 * its style loads, so this is what paints first, and it is the page's LCP.
 *
 * The box stops where the sidebar (md up) or the sheet's resting bar (phones)
 * will sit: Chrome never counts an image that fills the whole viewport as LCP,
 * and nothing under those panels shows anyway. The image stays centred on the
 * viewport, where the map's centre is.
 */
function MapPlaceholder() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 bottom-14 overflow-hidden bg-ground md:bottom-0 md:left-[380px]"
    >
      <picture>
        <source media="(min-width: 768px)" srcSet="/karta-placeholder.png" />
        <img
          src="/karta-placeholder-m.png"
          alt=""
          fetchPriority="high"
          className="absolute left-1/2 top-[50dvh] w-[480px] max-w-none -translate-x-1/2 -translate-y-1/2 [image-rendering:pixelated] md:left-[calc(50vw-380px)] md:w-[1921px]"
        />
      </picture>
    </div>
  )
}

/** The OG card reads searchParams, which only exist per request. This marker
 * tells Cache Components that the metadata is meant to be dynamic, so the page
 * body still prerenders as a static shell and the metadata streams in. */
async function RequestMarker() {
  await connection()
  return null
}

export default function Page() {
  return (
    <>
      <MapPlaceholder />
      <Client />
      <Suspense>
        <RequestMarker />
      </Suspense>
    </>
  )
}
