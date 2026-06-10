"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type SectionNavItem = { label: string; id: string }

/**
 * In-page mono nav (povezanost · nejednakost · …). Anchor links with a light
 * scrollspy that marks the section currently in view. Replaces the old
 * `table-of-contents` pill tabs for the editorial page.
 */
export function SectionNav({
  items,
  className,
}: {
  items: SectionNavItem[]
  className?: string
}) {
  const [active, setActive] = useState("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id)
        })
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.5, 1] }
    )
    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Sekcije izvještaja"
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", className)}
    >
      {items.map(({ label, id }) => {
        const isActive = active === id
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "font-mono text-label lowercase transition-colors duration-150",
              isActive
                ? "text-ink"
                : "text-ink-faint hover:text-ink-2"
            )}
          >
            {label}
          </a>
        )
      })}
    </nav>
  )
}
