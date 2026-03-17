import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "./globals.css"

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14141c",
}

export const metadata: Metadata = {
  metadataBase: new URL("https://doseg.mislavjc.com"),
  title: "Doseg — Zagreb Transit Reachability",
  description:
    "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15, 30 ili 45 minuta.",
  openGraph: {
    title: "Doseg — Zagreb Transit Reachability",
    description:
      "Interaktivna karta dosega javnog prijevoza u Zagrebu. Pogledaj dokle možeš stići tramvajem i busom u 15, 30 ili 45 minuta.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="hr" className={`dark antialiased ${inter.variable} font-sans`}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:outline-none"
        >
          Preskoči na sadržaj
        </a>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
