"use client"

import { useEffect, useState } from "react"
import { m } from "motion/react"

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
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  const activeGroupId =
    groups.find((g) => g.links.includes(activeLinkId))?.id ?? groups[0].id

  return (
    <m.div 
      className="sticky top-4 sm:top-6 z-40 flex w-full justify-center px-4 pointer-events-none mb-6 sm:mb-8"
      initial={{ y: -20, opacity: 0, filter: "blur(4px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <nav
        aria-label="Odjeljci izvještaja"
        className="island island-compact pointer-events-auto flex items-center gap-0.5 sm:gap-1.5 overflow-x-auto scrollbar-hide max-w-full"
      >
        {groups.map((group) => {
          const isActive = activeGroupId === group.id
          const targetId = group.links[0]

          return (
            <a
              key={group.id}
              href={`#${targetId}`}
              className={[
                "relative flex h-8 sm:h-9 shrink-0 items-center justify-center rounded-full px-3.5 sm:px-4 text-[12px] sm:text-[13px] font-medium transition-colors outline-none",
                isActive
                  ? "text-white"
                  : "text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-900 active:bg-neutral-200/60",
              ].join(" ")}
            >
              <span className="relative z-10">{group.title}</span>
              {isActive && (
                <m.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 z-0 rounded-full bg-neutral-900 shadow-sm"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
            </a>
          )
        })}
      </nav>
    </m.div>
  )
}

