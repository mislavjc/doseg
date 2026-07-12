import { describe, expect, it } from "vitest"

import { fmtDelaySec, fmtHR, pickPreferredRoute } from "./format"

// ---------------------------------------------------------------------------
// fmtDelaySec()
// ---------------------------------------------------------------------------

describe("fmtDelaySec()", () => {
  // Seconds under a minute keep the 's' unit; from 60 s up it rounds to
  // whole minutes; negatives mirror the same rules.
  it.each([
    [30, "30 s"],
    [60, "1 min"],
    [89, "1 min"],
    [90, "2 min"],
    [120, "2 min"],
    [0, "0 s"],
    [-30, "-30 s"],
    [-60, "-1 min"],
    [3600, "60 min"],
  ])("fmtDelaySec(%i) → %s", (input, expected) => {
    expect(fmtDelaySec(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// fmtHR()
// ---------------------------------------------------------------------------

describe("fmtHR()", () => {
  it("no decimals rounds to integer string", () => {
    expect(fmtHR(3.7)).toBe("4")
    expect(fmtHR(3.2)).toBe("3")
  })

  it("decimals > 0 uses Croatian comma separator", () => {
    const result = fmtHR(3.14, 2)
    // Croatian format uses comma as decimal separator
    expect(result).toContain(",")
    expect(result).toBe("3,14")
  })

  it("zero decimals returns integer", () => {
    expect(fmtHR(0, 0)).toBe("0")
  })

  it("1 decimal with a round number", () => {
    expect(fmtHR(5, 1)).toBe("5,0")
  })
})

// ---------------------------------------------------------------------------
// pickPreferredRoute()
// ---------------------------------------------------------------------------

describe("pickPreferredRoute()", () => {
  it("picks tram 6 when available (highest priority)", () => {
    expect(pickPreferredRoute(["14", "9", "6", "2"])).toBe("6")
  })

  it("falls back to first from preferred list present", () => {
    // "12" is second in PREFERRED_ROUTES after "6"
    expect(pickPreferredRoute(["14", "12", "3"])).toBe("12")
  })

  it("falls back to first element when no preferred match", () => {
    expect(pickPreferredRoute(["100", "200"])).toBe("100")
  })

  it("empty array → empty string", () => {
    expect(pickPreferredRoute([])).toBe("")
  })

  it("exact single preferred match", () => {
    expect(pickPreferredRoute(["17"])).toBe("17")
  })
})
