import type { Metadata } from "next"

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
      "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15, 30 ili 45 minuta.",
    path: "/karta",
    ogType: "website",
    ogImage: ogUrl,
  })
}

export default function Page() {
  return <Client />
}
