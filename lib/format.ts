/** Format seconds as "X min" or "X s", handling negatives. */
export function fmtDelaySec(seconds: number): string {
  const abs = Math.abs(seconds)
  const sign = seconds < 0 ? "-" : ""
  if (abs >= 60) return `${sign}${Math.round(abs / 60)} min`
  return `${sign}${Math.round(abs)} s`
}

/** Format number with Croatian decimal comma. */
export function fmtHR(n: number, decimals = 0): string {
  return decimals > 0
    ? n.toFixed(decimals).replace(".", ",")
    : Math.round(n).toString()
}

/** Preferred tram routes for default selection (most frequent service). */
const PREFERRED_ROUTES = ["6", "12", "11", "4", "5", "7", "9", "14", "17"]

/** Pick the first route from the preferred list, or fall back to the first available. */
export function pickPreferredRoute(routeNames: string[]): string {
  for (const name of PREFERRED_ROUTES) {
    if (routeNames.includes(name)) return name
  }
  return routeNames[0] ?? ""
}
