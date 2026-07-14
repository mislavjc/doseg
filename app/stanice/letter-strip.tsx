import Link from "next/link"

import { cn } from "@/lib/utils"

import { HR_LETTERS, letterId } from "./letters"

/**
 * A–Ž jump strip into the /stanice letter anchors — shared by the /stanice
 * directory (same-page anchors) and the homepage (cross-page via hrefBase).
 * Letters not in `present` render greyed; keep `present` derived from the
 * promoted stop set so every link lands on an anchor that exists.
 */
export function LetterStrip({
  present,
  hrefBase = "",
  className,
}: {
  present: { has(letter: string): boolean }
  hrefBase?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-2", className)}>
      {HR_LETTERS.map((L) =>
        present.has(L) ? (
          <Link
            key={L}
            href={`${hrefBase}#${letterId(L)}`}
            className="font-mono text-label text-zg-blue transition-colors hover:text-navy"
          >
            {L}
          </Link>
        ) : (
          <span key={L} className="font-mono text-label text-ink-ghost">
            {L}
          </span>
        )
      )}
    </div>
  )
}
