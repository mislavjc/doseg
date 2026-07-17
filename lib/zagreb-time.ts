const TZ = "Europe/Zagreb"

/** Current time in Zagreb as seconds since midnight. */
export function secondsOfDay(): number {
  const [h, m, s] = new Date()
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false })
    .split(":")
    .map(Number)
  return h * 3600 + m * 60 + s
}

/** Current time in Zagreb as "HH:MM" string. */
export function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Current date in Zagreb as a GTFS service date, "YYYY-MM-DD". Matches the
 * plain-calendar-date rule the Rust isochrone server uses to pick its service
 * day, so both engines route on the same schedule. */
export function serviceDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ })
}

const ISOCHRONE_URL = process.env.ISOCHRONE_URL || "http://localhost:3002"
const HEALTH_TTL_MS = 10 * 60_000

let cachedHealthDate: { value: string; expiresAt: number } | null = null

/** Service date resolved by the Rust isochrone server (its /health reports
 * the date it actually built its graph for, including the lapsed-feed
 * fallback to an older same-weekday date). Using it keeps the TS route-panel
 * engine on the SAME schedule as the painted isochrone — if each side picks
 * its own date, a lapsed feed leaves the panel with an empty graph while the
 * paint keeps working. Falls back to today's Zagreb date if /health is
 * unreachable. */
export async function engineServiceDate(): Promise<string> {
  const now = Date.now()
  if (cachedHealthDate && cachedHealthDate.expiresAt > now) {
    return cachedHealthDate.value
  }
  try {
    const res = await fetch(`${ISOCHRONE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    const date = (await res.json())?.feed?.serviceDate
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      cachedHealthDate = { value: date, expiresAt: now + HEALTH_TTL_MS }
      return date
    }
  } catch {
    // fall through to the local date
  }
  return serviceDate()
}
