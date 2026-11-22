/**
 * ZET's official tram line colours, as tokens (app/globals.css, --tram-*).
 * GTFS ships every route as white, so the colours are data kept here.
 */
const DAY = {
  "1": "tram-blue",
  "2": "tram-green-dark",
  "3": "tram-green-dark",
  "4": "tram-green-dark",
  "5": "tram-green-dark",
  "6": "tram-yellow",
  "7": "tram-yellow",
  "8": "tram-pink",
  "9": "tram-pink",
  "11": "tram-purple",
  "12": "tram-purple",
  "13": "tram-green",
  "14": "tram-yellow",
  "15": "tram-green",
  "17": "tram-green-dark",
} as const satisfies Record<string, string>

type Token = (typeof DAY)[keyof typeof DAY] | "navy"
const isDayLine = (broj: string): broj is keyof typeof DAY => broj in DAY

/** Token name for a line's colour; night lines share navy. */
export const tramLineToken = (broj: string): Token =>
  isDayLine(broj) ? DAY[broj] : "navy"

export const tramLineColor = (broj: string) => `var(--${tramLineToken(broj)})`
