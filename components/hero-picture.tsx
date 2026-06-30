import { TRANSPARENT_PX } from "@/lib/constants"

/**
 * Art-directed hero bitmap shared by the line / stop / kvart pages. Fetches only
 * the crop matching the current breakpoint (a phone never downloads the desktop
 * PNG and vice versa) and flags it high priority since the hero is the pSEO
 * page's LCP element. Each page renders its own overlay/label SVG on top.
 */
export function HeroPicture({
  src,
  alt,
  variant,
}: {
  src: string
  alt: string
  variant: "desktop" | "mobile"
}) {
  return (
    <picture>
      <source
        media={
          variant === "mobile" ? "(max-width: 639.98px)" : "(min-width: 640px)"
        }
        srcSet={src}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={TRANSPARENT_PX}
        alt={alt}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </picture>
  )
}
