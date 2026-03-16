import type { Metadata } from "next"
import { Inter } from "next/font/google"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "Doseg — Zagreb Transit Reachability",
  description:
    "See how far you can get in Zagreb by tram and bus in 15, 30, and 45 minutes.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`antialiased ${inter.variable} font-sans`}>
      <body>{children}</body>
    </html>
  )
}
