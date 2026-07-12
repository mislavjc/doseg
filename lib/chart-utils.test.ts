import { describe, expect, it } from "vitest"

import { computeXTicks } from "./chart-utils"

// ---------------------------------------------------------------------------
// computeXTicks()
// ---------------------------------------------------------------------------

describe("computeXTicks()", () => {
  it("returns count+1 ticks", () => {
    // count=4 → 5 ticks (0/4, 1/4, 2/4, 3/4, 4/4)
    const ticks = computeXTicks(0, 100, 4)
    expect(ticks).toHaveLength(5)
  })

  it("all ticks are Date instances", () => {
    const ticks = computeXTicks(0, 100, 3)
    for (const t of ticks) {
      expect(t).toBeInstanceOf(Date)
    }
  })

  it("first tick equals tsMin as Date", () => {
    const tsMin = 1_700_000_000
    const ticks = computeXTicks(tsMin, tsMin + 3600, 6)
    expect(ticks[0].getTime()).toBe(tsMin * 1000)
  })

  it("last tick equals tsMax as Date", () => {
    const tsMin = 1_700_000_000
    const tsMax = tsMin + 3600
    const ticks = computeXTicks(tsMin, tsMax, 6)
    expect(ticks[ticks.length - 1].getTime()).toBe(tsMax * 1000)
  })

  it("single-point range: all ticks equal tsMin", () => {
    const ts = 1_700_000_000
    const ticks = computeXTicks(ts, ts, 4)
    for (const t of ticks) {
      expect(t.getTime()).toBe(ts * 1000)
    }
  })

  it("count=0 → returns one tick (the start)", () => {
    const ticks = computeXTicks(1_000_000, 2_000_000, 0)
    // Loop: i=0 only → one tick
    expect(ticks).toHaveLength(1)
  })

  it("ticks are monotonically non-decreasing", () => {
    const ticks = computeXTicks(1_700_000_000, 1_700_003_600, 10)
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].getTime()).toBeGreaterThanOrEqual(ticks[i - 1].getTime())
    }
  })
})
