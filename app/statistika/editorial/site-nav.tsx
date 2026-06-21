import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Site nav — contained ~640px white bar that sits over the hero map, framed by
 * ASCII corner brackets. Logo mark + "Doseg" wordmark left, mono links right
 * (active = ink, rest = muted). Mobile collapses the links into an "izbornik"
 * disclosure (native <details>, no client JS). Matches Paper node 1O6-0.
 */

export const NAV_LINKS = [
  { label: "karta", href: "/" },
  { label: "statistika", href: "/statistika" },
  { label: "linije", href: "/linije" },
  { label: "promjene", href: "/promjene" },
  { label: "o projektu", href: "/o-projektu" },
] as const

export function NavLink({
  label,
  href,
  active,
  className,
}: {
  label: string
  href: string
  active: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap font-mono text-label transition-colors duration-150",
        active ? "text-ink" : "text-ink-muted hover:text-ink",
        className
      )}
    >
      {label}
    </Link>
  )
}

const Bracket = ({ char, className }: { char: string; className: string }) => (
  <span
    aria-hidden
    className={cn(
      "pointer-events-none absolute font-mono text-base leading-4 text-ink-faint",
      className
    )}
  >
    {char}
  </span>
)

export function SiteNav({
  active,
  className,
}: {
  active?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex w-[640px] max-w-[calc(100%-1rem)] items-center bg-white px-[18px] py-1.5",
        className
      )}
    >
      <Bracket char="⌜" className="left-1.5 top-[3px]" />
      <Bracket char="⌝" className="right-1.5 top-[3px]" />
      <Bracket char="⌞" className="bottom-[1px] left-1.5" />
      <Bracket char="⌟" className="bottom-[1px] right-1.5" />

      <div className="flex w-full items-center justify-between gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/doseg-mark.png"
            alt=""
            width={28}
            height={21}
            className="h-[21px] w-7 object-contain"
            priority
          />
          <span className="font-mono text-[14px] font-medium leading-[18px] tracking-[-0.01em]">
            <span className="text-ink">doseg</span>
            <span className="text-zg-blue">.hr</span>
          </span>
        </Link>

        {/* Desktop: inline links */}
        <nav className="hidden items-center gap-5 sm:flex">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.href}
              label={l.label}
              href={l.href}
              active={active === l.label}
            />
          ))}
        </nav>

        {/* Mobile: izbornik disclosure */}
        <details className="group relative sm:hidden">
          <summary className="flex cursor-pointer list-none items-center font-mono text-label text-ink-muted [&::-webkit-details-marker]:hidden">
            izbornik
          </summary>
          <nav className="absolute right-0 top-full z-20 mt-2 flex min-w-32 flex-col gap-2.5 bg-white px-3.5 py-3 shadow-soft ring-1 ring-hairline-strong">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.href}
                label={l.label}
                href={l.href}
                active={active === l.label}
              />
            ))}
          </nav>
        </details>
      </div>
    </div>
  )
}
