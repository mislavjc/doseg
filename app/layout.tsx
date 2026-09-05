import type { Metadata, Viewport } from "next"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"

import { JsonLd } from "@/app/statistika/editorial/json-ld"
import { PlausibleProvider } from "@/components/plausible-provider"
import { Agentation } from "@/components/agentation"
import SwrProvider from "@/lib/swr-config"

import "./globals.css"

// Geist Mono — labels, eyebrows, nav, data cells (statistika editorial system).
const geistMono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
})

// TeX Gyre Heros (self-hosted) — prose, hooks, stat numbers (statistika editorial system).
const heros = localFont({
  src: [
    {
      path: "./fonts/TeXGyreHeros-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/TeXGyreHeros-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-heros",
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
}

export const metadata: Metadata = {
  metadataBase: new URL("https://doseg.hr"),
  title: "Doseg | Zagreb Transit Reachability",
  description:
    "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15 ili 30 minuta.",
  openGraph: {
    title: "Doseg | Zagreb Transit Reachability",
    description:
      "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15 ili 30 minuta.",
    type: "website",
    url: "/",
    siteName: "Doseg",
    locale: "hr_HR",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
  },
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Doseg",
  alternateName: "doseg.hr",
  url: "https://doseg.hr",
  description:
    "Vozni red svake ZET linije, imenik svih stanica i dostupnost po kvartu. Uz interaktivnu kartu dosega javnog prijevoza u Zagrebu.",
  inLanguage: "hr",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="hr"
      className={`antialiased ${geistMono.variable} ${heros.variable} font-sans`}
    >
      <body>
        <JsonLd data={websiteJsonLd} />
        <PlausibleProvider />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-slate-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:outline-none"
        >
          Preskoči na sadržaj
        </a>
        <SwrProvider>{children}</SwrProvider>
        <Agentation />
      </body>
    </html>
  )
}
