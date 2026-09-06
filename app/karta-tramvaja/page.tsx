import type { Metadata } from "next"

import { inter } from "@/app/fonts/inter"
import { TramMap } from "./tram-map"

export const metadata: Metadata = {
  title: "Karta tramvajskih linija | Doseg",
  description:
    "Interaktivna shematska karta svih tramvajskih linija u Zagrebu, u stilu londonskog metroa.",
  alternates: { canonical: "/karta-tramvaja" },
  openGraph: {
    title: "Karta tramvajskih linija | Doseg",
    description:
      "Interaktivna shematska karta svih tramvajskih linija u Zagrebu.",
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
}

export default function KartaTramvajaPage() {
  return (
    <main id="main-content" className={`h-svh ${inter.variable}`}>
      <TramMap />
    </main>
  )
}
