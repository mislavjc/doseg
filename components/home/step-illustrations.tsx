import Image from "next/image"

/**
 * Step-card previews — real screenshots of the live map (reach bands after
 * the first click, a routed itinerary after the second), captured from /new
 * itself. Static, ~2x density for the 336×118 card. Recapture after any map
 * restyle so the preview never drifts from reality.
 */

export function ReachIllustration() {
  return (
    <Image
      src="/new/step-reach.png"
      alt=""
      aria-hidden
      fill
      priority
      sizes="336px"
      className="object-cover"
    />
  )
}

export function RouteIllustration() {
  return (
    <Image
      src="/new/step-route.png"
      alt=""
      aria-hidden
      fill
      sizes="336px"
      className="object-cover"
    />
  )
}
