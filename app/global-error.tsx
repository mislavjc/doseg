"use client"

import { geistMono, heros } from "@/app/fonts/root"
import { ErrorMessage, ErrorShell, RouteBreak } from "@/components/error-page"

import "./globals.css"

/**
 * Last-resort boundary — renders only when the ROOT layout itself crashes, so
 * it must provide its own <html>/<body>, styles, and fonts (the root layout's
 * are gone). Same route-line 500 design as app/error.tsx.
 */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html
      lang="hr"
      className={`antialiased ${geistMono.variable} ${heros.variable}`}
    >
      <body>
        <ErrorShell>
          <ErrorMessage code="500" title="Veza je u prekidu.">
            Poslužitelj nije odgovorio. Obično se riješi za koju minutu.
          </ErrorMessage>
          <RouteBreak />
          <button
            type="button"
            onClick={reset}
            className="font-mono text-body leading-6 text-zg-blue transition-colors hover:text-navy"
          >
            pokušaj ponovno →
          </button>
        </ErrorShell>
      </body>
    </html>
  )
}
