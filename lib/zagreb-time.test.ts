import { describe, expect, it, vi } from "vitest"

import { formatTime, secondsOfDay } from "./zagreb-time"

// ---------------------------------------------------------------------------
// zagreb-time helpers — pin real instants to avoid DST surprises
// ---------------------------------------------------------------------------

// CET: UTC+1, Zagreb in winter (no DST)
// 2025-01-15T10:30:00Z → Zagreb local 11:30:00 (CET, UTC+1)
const WINTER_UTC_MS = Date.UTC(2025, 0, 15, 10, 30, 0)

// CEST: UTC+2, Zagreb in summer (DST active)
// 2025-07-15T10:30:00Z → Zagreb local 12:30:00 (CEST, UTC+2)
const SUMMER_UTC_MS = Date.UTC(2025, 6, 15, 10, 30, 0)

describe("secondsOfDay()", () => {
  it("returns correct Zagreb seconds for a winter (CET) instant", () => {
    vi.setSystemTime(WINTER_UTC_MS)
    const sod = secondsOfDay()
    // Zagreb CET = UTC+1 → local time is 11:30:00 → 11*3600 + 30*60 = 41400
    expect(sod).toBe(11 * 3600 + 30 * 60)
    vi.useRealTimers()
  })

  it("returns correct Zagreb seconds for a summer (CEST) instant", () => {
    vi.setSystemTime(SUMMER_UTC_MS)
    const sod = secondsOfDay()
    // Zagreb CEST = UTC+2 → local time is 12:30:00 → 12*3600 + 30*60 = 45000
    expect(sod).toBe(12 * 3600 + 30 * 60)
    vi.useRealTimers()
  })
})

describe("formatTime()", () => {
  it("returns 'HH:MM' string for a winter (CET) instant", () => {
    vi.setSystemTime(WINTER_UTC_MS)
    const result = formatTime()
    // Zagreb CET → 11:30
    expect(result).toBe("11:30")
    vi.useRealTimers()
  })

  it("returns 'HH:MM' string for a summer (CEST) instant", () => {
    vi.setSystemTime(SUMMER_UTC_MS)
    const result = formatTime()
    // Zagreb CEST → 12:30
    expect(result).toBe("12:30")
    vi.useRealTimers()
  })

  it("format is always HH:MM (two-digit hour and minute)", () => {
    // Use a time where hour < 10: 2025-01-15T05:00:00Z → Zagreb CET 06:00
    vi.setSystemTime(Date.UTC(2025, 0, 15, 5, 0, 0))
    const result = formatTime()
    expect(result).toMatch(/^\d{2}:\d{2}$/)
    vi.useRealTimers()
  })
})
