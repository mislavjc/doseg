/**
 * Canonical /karta deep link — the one place outside the map client that
 * knows its URL schema (components/home/client.tsx parses these params back
 * into origin/dest state). 5-decimal coords (~1 m) match what the client
 * writes when sharing.
 */
export function kartaUrl(
  origin: { lat: number; lon: number },
  dest?: { lat: number; lon: number }
): string {
  const c = (n: number) => n.toFixed(5)
  const base = `/karta?lat=${c(origin.lat)}&lon=${c(origin.lon)}`
  return dest ? `${base}&dlat=${c(dest.lat)}&dlon=${c(dest.lon)}` : base
}
