/** Generate evenly spaced Date ticks between two Unix timestamps. */
export function computeXTicks(tsMin: number, tsMax: number, count: number): Date[] {
  const ticks: Date[] = []
  for (let i = 0; i <= count; i++) {
    ticks.push(new Date((tsMin + (i / count) * (tsMax - tsMin)) * 1000))
  }
  return ticks
}
