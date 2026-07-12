import { describe, expect, it } from "vitest"

import type { StopLine } from "@/lib/generated/StopLine"
import type { StopPageData } from "@/lib/generated/StopPageData"

import { dosegCopy, lineHeadway, lineModeNoun } from "./copy"

// ---------------------------------------------------------------------------
// lineHeadway()
// ---------------------------------------------------------------------------

describe("lineHeadway()", () => {
  it("returns null when both headway fields are null", () => {
    const line = {
      peakRangeMin: null,
      peakHeadwayMin: null,
      allDayHeadwayMin: null,
    } as unknown as StopLine
    expect(lineHeadway(line)).toBeNull()
  })

  it("uses peakRangeMin when present (range branch)", () => {
    const line = {
      peakRangeMin: [5, 8] as [number, number],
      peakHeadwayMin: null,
      allDayHeadwayMin: null,
    } as unknown as StopLine
    const result = lineHeadway(line)
    expect(result).not.toBeNull()
    expect(result!.startsWith("svakih ")).toBe(true)
    expect(result).toBe("svakih 5-8 min")
  })

  it("uses peakRangeMin equal range → single number", () => {
    const line = {
      peakRangeMin: [7, 7] as [number, number],
      peakHeadwayMin: null,
      allDayHeadwayMin: null,
    } as unknown as StopLine
    expect(lineHeadway(line)).toBe("svakih 7 min")
  })

  it("uses allDayHeadwayMin when peakRangeMin is null", () => {
    const line = {
      peakRangeMin: null,
      peakHeadwayMin: null,
      allDayHeadwayMin: 7.4,
    } as unknown as StopLine
    // Math.round(7.4) = 7
    expect(lineHeadway(line)).toBe("svakih 7 min")
  })

  it("rounds allDayHeadwayMin (7.6 → 8)", () => {
    const line = {
      peakRangeMin: null,
      peakHeadwayMin: null,
      allDayHeadwayMin: 7.6,
    } as unknown as StopLine
    expect(lineHeadway(line)).toBe("svakih 8 min")
  })
})

// ---------------------------------------------------------------------------
// lineModeNoun()
// ---------------------------------------------------------------------------

describe("lineModeNoun()", () => {
  it("tram → 'tramvaj'", () => {
    const line = { mode: "tram" } as unknown as StopLine
    expect(lineModeNoun(line)).toBe("tramvaj")
  })

  it("bus → 'autobus'", () => {
    const line = { mode: "bus" } as unknown as StopLine
    expect(lineModeNoun(line)).toBe("autobus")
  })
})

// ---------------------------------------------------------------------------
// dosegCopy()
// ---------------------------------------------------------------------------

// Minimal StopPageData with just the reach field
function makeStopData(reach: { stations15: number; stations30: number; stations45: number } | undefined): StopPageData {
  return {
    reach,
  } as unknown as StopPageData
}

describe("dosegCopy()", () => {
  it("returns null when reach is undefined", () => {
    expect(dosegCopy(makeStopData(undefined))).toBeNull()
  })

  it("stations30: 1 → hook contains '1 stanicu'", () => {
    const result = dosegCopy(makeStopData({ stations15: 1, stations30: 1, stations45: 3 }))
    expect(result).not.toBeNull()
    expect(result!.hook).toContain("1 stanicu")
  })

  it("stations30: 2 → hook contains '2 stanice'", () => {
    const result = dosegCopy(makeStopData({ stations15: 1, stations30: 2, stations45: 5 }))
    expect(result).not.toBeNull()
    expect(result!.hook).toContain("2 stanice")
  })

  it("stations30: 5 → hook contains '5 stanica'", () => {
    const result = dosegCopy(makeStopData({ stations15: 2, stations30: 5, stations45: 10 }))
    expect(result).not.toBeNull()
    expect(result!.hook).toContain("5 stanica")
  })

  it("hook starts with 'Za pola sata dosegneš'", () => {
    const result = dosegCopy(makeStopData({ stations15: 3, stations30: 8, stations45: 15 }))
    expect(result!.hook.startsWith("Za pola sata dosegneš")).toBe(true)
  })

  it("lede mentions all three time bands", () => {
    const result = dosegCopy(makeStopData({ stations15: 3, stations30: 8, stations45: 15 }))
    expect(result!.lede).toContain("15 minuta")
    expect(result!.lede).toContain("pola sata")
    expect(result!.lede).toContain("45 minuta")
  })

  it("stations15: 4 → lede contains '4 stanice' (paucal)", () => {
    const result = dosegCopy(makeStopData({ stations15: 4, stations30: 8, stations45: 20 }))
    expect(result!.lede).toContain("4 stanice")
  })

  it("stations45: 11 → lede contains '11 stanica' (11-14 exception)", () => {
    const result = dosegCopy(makeStopData({ stations15: 3, stations30: 7, stations45: 11 }))
    expect(result!.lede).toContain("11 stanica")
  })
})
