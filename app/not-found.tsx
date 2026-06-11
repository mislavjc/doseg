import type { Metadata } from "next"

import { ErrorMessage, ErrorShell, RouteDeadEnd } from "@/components/error-page"

export const metadata: Metadata = {
  title: "Stranica ne postoji | Doseg",
  robots: { index: false },
}

export default function NotFound() {
  return (
    <ErrorShell>
      <ErrorMessage code="404" title="Ova stanica ne postoji.">
        Stranica je premještena ili nikad nije postojala. Trasa ide dalje,
        izaberi stanicu koja postoji.
      </ErrorMessage>
      <RouteDeadEnd />
    </ErrorShell>
  )
}
