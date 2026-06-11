"use client"

import { ErrorMessage, ErrorShell, RouteBreak } from "@/components/error-page"

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell>
      <ErrorMessage code="500" title="Veza je u prekidu.">
        Poslužitelj nije odgovorio. Obično se riješi za koju minutu.
      </ErrorMessage>
      <RouteBreak />
      <button
        onClick={reset}
        className="font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy"
      >
        pokušaj ponovno →
      </button>
    </ErrorShell>
  )
}
