import { describe, expect, it } from "vitest"

import { fmtDelaySec, fmtHR, pickPreferredRoute } from "./format"

// ---------------------------------------------------------------------------
// fmtDelaySec()
// ---------------------------------------------------------------------------

describe("fmtDelaySec()", () => {
  it("positive seconds under 60 → 's' unit", () => {
    expect(fmtDelaySec(30)).toBe("30 s")
  })

  it("exactly 60 seconds → '1 min'", () => {
    expect(fmtDelaySec(60)).toBe("1 min")
  })

  it("seconds above 60 → minutes", () => {
    expect(fmtDelaySec(120)).toBe("2 min")
  })

  it("rounds partial minutes", () => {
    expect(fmtDelaySec(90)).toBe("2 min")
    expect(fmtDelaySec(89)).toBe("1 min")
  })

  it("zero → '0 s'", () => {
    expect(fmtDelaySec(0)).toBe("0 s")
  })

  it("negative value under -60 → '-1 min'", () => {
    expect(fmtDelaySec(-60)).toBe("-1 min")
  })

  it("negative value above -60 → '-30 s'", () => {
    expect(fmtDelaySec(-30)).toBe("-30 s")
  })

  it("large value → minutes", () => {
    expect(fmtDelaySec(3600)).toBe("60 min")
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
