import { Inter } from "next/font/google"

// Inter is the pre-Paper UI face. Only the tram map labels and the data
// dashboard still render it, so it is scoped to those routes instead of the
// root layout: everywhere else it was ~107K of preloaded fonts with no
// visible text, competing with the hero image for bandwidth. Put
// `inter.variable` on a route's wrapper and --font-sans becomes Inter beneath
// it (globals.css keeps --font-sans out of the inline theme for this).
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
})
