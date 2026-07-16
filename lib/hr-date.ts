/** hr-HR long date with trailing periods, e.g. "20. ožujka 2026.". UTC-pinned
 *  so data timestamps ("...T00:00:00.000Z") never drift a day. Lives in lib
 *  with zero node deps: the Footer is bundled client-side via app/error.tsx. */
export function formatHrDate(value: string): string {
  return new Date(value).toLocaleDateString("hr-HR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}
