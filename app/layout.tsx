import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14141c",
}

export const metadata: Metadata = {
  title: "Doseg — Zagreb Transit Reachability",
  description:
    "See how far you can get in Zagreb by tram and bus in 15, 30, and 45 minutes.",
  openGraph: {
    title: "Doseg — Zagreb Transit Reachability",
    description:
      "See how far you can get in Zagreb by tram and bus in 15, 30, and 45 minutes.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`antialiased ${inter.variable} font-sans`}>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
