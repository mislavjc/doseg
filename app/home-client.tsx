"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { AlertsBanner } from "@/components/alerts-banner"

const TransitMap = dynamic(
  () => import("@/components/transit-map").then((m) => m.TransitMap),
  { ssr: false }
)

export function HomeClient() {
  return (
    <main id="main-content" className="relative">
      <h1 className="sr-only">
        Doseg: karta dosega javnog prijevoza u Zagrebu
      </h1>
      <nav aria-label="Navigacija" className="sr-only">
        <Link href="/o-projektu">O projektu</Link>
        <Link href="/statistika">Statistika</Link>
      </nav>
      <NuqsAdapter>
        <TransitMap />
      </NuqsAdapter>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
        <AlertsBanner />
      </div>
    </main>
  )
}
