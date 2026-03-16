"use client"

import dynamic from "next/dynamic"

const TransitMap = dynamic(
  () => import("@/components/transit-map").then((m) => m.TransitMap),
  { ssr: false }
)

export default function Page() {
  return <TransitMap />
}
