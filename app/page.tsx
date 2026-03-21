import type { Metadata } from "next"

import { HomeClient } from "./home-client"

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
  const ogUrl = ogQuery ? `/api/og?${ogQuery}` : "/api/og"

  const title = "Doseg | Zagreb Transit Reachability"
  const description =
    "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle mozes stici tramvajem i busom u 15, 30 ili 45 minuta."

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  }
}

export default function Page() {
  return <HomeClient />
}
