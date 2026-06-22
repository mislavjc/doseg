import type { Metadata } from "next"

import { Client } from "@/components/home/client"

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
  // Static Paper export for the plain homepage; satori render only for
  // shared map links where the card shows the clicked district.
  const ogUrl = ogQuery ? `/api/og?${ogQuery}` : "/og.jpg"

  const title = "Doseg: karta dosega javnog prijevoza u Zagrebu"
  const description =
    "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15, 30 ili 45 minuta."

  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  }
}

export default function Page() {
  return <Client />
}
