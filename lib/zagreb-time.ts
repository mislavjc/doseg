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
