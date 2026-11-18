/**
 * Canonical /karta deep link — the one place outside the map client that
 * knows its URL schema (components/home/client.tsx parses these params back
 * into origin/dest state). 5-decimal coords (~1 m) match what the client
 * writes when sharing.
 */
const coord = (n: number) => n.toFixed(5)

export function kartaUrl(
  origin: { lat: number; lon: number },
  dest?: { lat: number; lon: number }
): string {
  const base = `/karta?lat=${coord(origin.lat)}&lon=${coord(origin.lon)}`
  return dest ? `${base}&dlat=${coord(dest.lat)}&dlon=${coord(dest.lon)}` : base
}
