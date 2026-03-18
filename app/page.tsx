"use client"

import dynamic from "next/dynamic"
import { NuqsAdapter } from "nuqs/adapters/next/app"

const TransitMap = dynamic(
  () => import("@/components/transit-map").then((m) => m.TransitMap),
  { ssr: false }
)

export default function Page() {
  return (
    <main id="main-content">
      <h1 className="sr-only">
        Doseg — karta dosega javnog prijevoza u Zagrebu
      </h1>
      <NuqsAdapter>
        <TransitMap />
      </NuqsAdapter>
    </main>
  )
}
