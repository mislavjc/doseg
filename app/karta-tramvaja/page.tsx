import type { Metadata } from "next"

import { loadTramMap } from "@/lib/tram-map-data"
import { TramMap } from "./tram-map"

export const metadata: Metadata = {
  title: "Karta tramvajskih linija | Doseg",
  description:
    "Shematska karta svih tramvajskih linija i stanica u Zagrebu, u stilu londonskog metroa.",
  alternates: { canonical: "/karta-tramvaja" },
  openGraph: {
    title: "Karta tramvajskih linija | Doseg",
    description: "Shematska karta svih tramvajskih linija i stanica u Zagrebu.",
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
}

export const ensureStatic = "navigation"

export default function KartaTramvajaPage() {
  return (
    <main id="main-content" className="h-svh">
      <TramMap data={loadTramMap()} />
    </main>
  )
}
