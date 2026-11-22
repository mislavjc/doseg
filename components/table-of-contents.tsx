"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const groups = [
  {
    id: "trenutno-stanje",
    title: "Trenutno stanje",
    links: ["promet-danas", "pouzdanost"],
  },
  {
    id: "mreza-i-dostupnost",
    title: "Mreža i dostupnost",
    links: ["povezanost", "analiza"],
  },
  {
    id: "mikromobilnost",
    title: "Mikromobilnost",
    links: ["bajs"],
  },
  {
    id: "dodatno",
    title: "Dodatno",
    links: ["metodologija"],
  },
]

const allSectionIds = groups.flatMap((g) => g.links)

export default function StatSectionTabs() {
  const [activeLinkId, setActiveLinkId] = useState<string>("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveLinkId(entry.target.id)
          }
        })
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.1, 0.25] }
    )

    allSectionIds.forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        observer.observe(el)
      }
    })

    return () => observer.disconnect()
  }, [])

  const activeGroupId =
    groups.find((g) => g.links.includes(activeLinkId))?.id ?? groups[0].id

  return (
    <nav
      aria-label="Odjeljci izvještaja"
      className="sticky top-0 z-40 mt-12 bg-ground"
    >
      <div className="scrollbar-hide mx-auto flex w-full max-w-[840px] gap-6 overflow-x-auto px-4 sm:px-8">
        {groups.map((group) => {
          const isActive = activeGroupId === group.id
          return (
            <a
              key={group.id}
              href={`#${group.links[0]}`}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 border-b-2 py-3 font-mono text-label whitespace-nowrap lowercase transition-colors duration-150 outline-none",
                isActive
                  ? "border-zg-blue text-ink"
                  : "border-transparent text-ink-muted hover:text-ink focus-visible:text-ink"
              )}
            >
              {group.title}
            </a>
          )
        })}
      </div>
      <div className="mx-auto w-full max-w-[840px] px-4 sm:px-8">
        <div className="h-px bg-hairline-strong" />
      </div>
    </nav>
  )
}
