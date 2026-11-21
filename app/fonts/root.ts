import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"

// Geist Mono — labels, eyebrows, nav, data cells (statistika editorial system).
export const geistMono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
})

// TeX Gyre Heros (self-hosted) — prose, hooks, stat numbers (statistika editorial system).
export const heros = localFont({
  src: [
    {
      path: "./TeXGyreHeros-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./TeXGyreHeros-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-heros",
  display: "swap",
})
