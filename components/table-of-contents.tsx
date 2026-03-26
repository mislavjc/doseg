"use client"

import { useEffect, useState } from "react"

const links = [
  { 
    id: "promet-danas", 
    label: "Promet danas", 
    description: "Kašnjenja u stvarnom vremenu",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    )
  },
  { 
    id: "pouzdanost", 
    label: "Pouzdanost linija", 
    description: "Brzina, točnost i vozila",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M2 12h4l3-9 5 18 3-9h5" />
      </svg>
    )
  },
  { 
    id: "povezanost", 
    label: "Povezanost kvartova", 
    description: "Doseg i matrice putovanja",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    )
  },
  { 
    id: "bajs", 
    label: "BAJS bicikli", 
    description: "Integracija s mikromobilnosti",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>
      </svg>
    )
  },
  { 
    id: "analiza", 
    label: "Struktura mreže", 
    description: "Dubinski uvid u sustav",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    )
  },
]

export default function TableOfContents({
  isMobile,
  className = "",
}: {
  isMobile?: boolean
  className?: string
} = {}) {
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: "0px 0px -60% 0px" }
    )

    links.forEach((link) => {
      const element = document.getElementById(link.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  if (isMobile) {
    return <MobileTableOfContents activeId={activeId} className={className} />
  }

  return (
    <nav className={`flex flex-col gap-2 ${className}`}>
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Sadržaj izvješća
      </div>
      <div className="flex flex-col gap-1 border-l border-slate-200 dark:border-white/10">
        {links.map((link) => (
          <TocLink key={link.id} link={link} isActive={activeId === link.id} />
        ))}
      </div>
    </nav>
  )
}

function MobileTableOfContents({
  activeId,
  className = "",
}: {
  activeId: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [progress, setProgress] = useState(0)

  const activeLink = links.find((l) => l.id === activeId) || links[0]

  useEffect(() => {
    const handleScroll = () => {
      const winScroll = document.documentElement.scrollTop || document.body.scrollTop
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight
      setProgress(height > 0 ? (winScroll / height) * 100 : 0)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity dark:bg-black/40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div className={`sticky top-6 z-50 flex flex-col lg:hidden ${className}`}>
        <MobilePill activeLink={activeLink} isOpen={isOpen} progress={progress} onClick={() => setIsOpen(!isOpen)} />
        <MobileDropdown isOpen={isOpen} activeId={activeId} onClose={() => setIsOpen(false)} />
      </div>
    </>
  )
}

function MobilePill({ 
  activeLink, 
  isOpen, 
  progress, 
  onClick 
}: { 
  activeLink: typeof links[0]; 
  isOpen: boolean; 
  progress: number; 
  onClick: () => void 
}) {
  return (
    <div className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-full border border-border bg-background/80 p-1.5 shadow-lg shadow-black/5 backdrop-blur-xl transition-all">
      <div 
        className="absolute bottom-0 left-0 h-full bg-muted/80 transition-all duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
      <div className="relative z-10 flex cursor-pointer items-center justify-between px-3 py-1.5" onClick={onClick}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
            {activeLink.icon}
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
              {Math.round(progress)}% pročitano
            </span>
            <span className="mt-1 font-medium leading-none tracking-tight text-foreground">
              {activeLink.label}
            </span>
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <svg 
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" 
            className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function MobileDropdown({ isOpen, activeId, onClose }: { isOpen: boolean; activeId: string; onClose: () => void }) {
  return (
    <div 
      className={`absolute left-0 right-0 top-full mt-3 overflow-hidden rounded-3xl border border-border bg-background/95 shadow-xl shadow-black/10 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"
      }`}
    >
      <div className="flex max-h-[60vh] flex-col overflow-y-auto p-2">
        {links.map((link) => (
          <MobileDropdownItem key={link.id} link={link} isActive={activeId === link.id} onClick={onClose} />
        ))}
      </div>
    </div>
  )
}

function MobileDropdownItem({ link, isActive, onClick }: { link: typeof links[0]; isActive: boolean; onClick: () => void }) {
  return (
    <a
      href={`#${link.id}`}
      onClick={onClick}
      className={`group flex items-center gap-4 rounded-2xl p-3 transition-all ${
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${isActive ? "bg-foreground text-background shadow-sm" : "bg-muted text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"}`}>
        {link.icon}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{link.label}</span>
        <span className={`mt-0.5 text-[12px] ${isActive ? "text-muted-foreground" : "text-muted-foreground/80"}`}>
          {link.description}
        </span>
      </div>
    </a>
  )
}

function TocLink({
  link,
  isActive,
}: {
  link: typeof links[0]
  isActive: boolean
}) {
  return (
    <a
      href={`#${link.id}`}
      className={`group flex items-center gap-3 border-l-[3px] py-2.5 pl-4 pr-3 text-sm transition-all hover:bg-muted/50 ${
        isActive
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
          isActive
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
        }`}
      >
        {link.icon}
      </div>
      <div className="flex flex-col">
        <span className="font-medium">{link.label}</span>
        <span
          className="text-[11px] text-muted-foreground/80"
        >
          {link.description}
        </span>
      </div>
    </a>
  )
}
