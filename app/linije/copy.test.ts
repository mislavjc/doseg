import { describe, expect, it } from "vitest"

import {
  clockTime,
  numberWord,
  numberWordF,
  peakRange,
  plural,
  serviceHistogram,
} from "./copy"

// ---------------------------------------------------------------------------
// plural() — Croatian paukal / genitive rules
// ---------------------------------------------------------------------------

describe("plural()", () => {
  describe("with 'minuta/minute/minuta'", () => {
    it("0 → genitive plural", () => {
      expect(plural(0, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("1 → singular", () => {
      expect(plural(1, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("2 → paucal", () => {
      expect(plural(2, "minuta", "minute", "minuta")).toBe("minute")
    })
    it("3 → paucal", () => {
      expect(plural(3, "minuta", "minute", "minuta")).toBe("minute")
    })
    it("4 → paucal", () => {
      expect(plural(4, "minuta", "minute", "minuta")).toBe("minute")
    })
    it("5 → genitive plural", () => {
      expect(plural(5, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("6 → genitive plural", () => {
      expect(plural(6, "minuta", "minute", "minuta")).toBe("minuta")
    })
    // 11–14 exception: NOT paucal even though last digit is 1–4
    it("11 → genitive plural (not singular)", () => {
      expect(plural(11, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("12 → genitive plural (not paucal)", () => {
      expect(plural(12, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("13 → genitive plural (not paucal)", () => {
      expect(plural(13, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("14 → genitive plural (not paucal)", () => {
      expect(plural(14, "minuta", "minute", "minuta")).toBe("minuta")
    })
    // Back to normal after 14
    it("21 → singular (last digit 1, not in 11-14)", () => {
      expect(plural(21, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("22 → paucal (last digit 2, not in 11-14)", () => {
      expect(plural(22, "minuta", "minute", "minuta")).toBe("minute")
    })
    // Three-digit values
    it("101 → singular", () => {
      expect(plural(101, "minuta", "minute", "minuta")).toBe("minuta")
    })
    it("102 → paucal", () => {
      expect(plural(102, "minuta", "minute", "minuta")).toBe("minute")
    })
    it("111 → genitive plural (11-14 exception at three digits)", () => {
      expect(plural(111, "minuta", "minute", "minuta")).toBe("minuta")
    })
  })

  describe("with 'polazak/polaska/polazaka'", () => {
    it("1 → singular", () => {
      expect(plural(1, "polazak", "polaska", "polazaka")).toBe("polazak")
    })
    it("2 → paucal", () => {
      expect(plural(2, "polazak", "polaska", "polazaka")).toBe("polaska")
    })
    it("5 → genitive plural", () => {
      expect(plural(5, "polazak", "polaska", "polazaka")).toBe("polazaka")
    })
    it("11 → genitive plural (exception)", () => {
      expect(plural(11, "polazak", "polaska", "polazaka")).toBe("polazaka")
    })
    it("14 → genitive plural (exception)", () => {
      expect(plural(14, "polazak", "polaska", "polazaka")).toBe("polazaka")
    })
    it("21 → singular", () => {
      expect(plural(21, "polazak", "polaska", "polazaka")).toBe("polazak")
    })
  })

  describe("with 'stanicu/stanice/stanica'", () => {
    it("1 → stanicu", () => {
      expect(plural(1, "stanicu", "stanice", "stanica")).toBe("stanicu")
    })
    it("2 → stanice", () => {
      expect(plural(2, "stanicu", "stanice", "stanica")).toBe("stanice")
    })
    it("5 → stanica", () => {
      expect(plural(5, "stanicu", "stanice", "stanica")).toBe("stanica")
    })
    it("11 → stanica (exception)", () => {
      expect(plural(11, "stanicu", "stanice", "stanica")).toBe("stanica")
    })
  })
})

// ---------------------------------------------------------------------------
// numberWord() and numberWordF()
// ---------------------------------------------------------------------------

describe("numberWord()", () => {
  it("0 → 'nula'", () => expect(numberWord(0)).toBe("nula"))
  it("1 → 'jedan' (masculine)", () => expect(numberWord(1)).toBe("jedan"))
  it("2 → 'dva' (masculine)", () => expect(numberWord(2)).toBe("dva"))
  it("3 → 'tri'", () => expect(numberWord(3)).toBe("tri"))
  it("4 → 'četiri'", () => expect(numberWord(4)).toBe("četiri"))
  it("5 → 'pet'", () => expect(numberWord(5)).toBe("pet"))
  it("10 → 'deset'", () => expect(numberWord(10)).toBe("deset"))
  it("20 → 'dvadeset'", () => expect(numberWord(20)).toBe("dvadeset"))
  it("21 → '21' (beyond word list)", () => expect(numberWord(21)).toBe("21"))
  it("100 → '100' (beyond word list)", () => expect(numberWord(100)).toBe("100"))
})

describe("numberWordF()", () => {
  it("0 → 'nula'", () => expect(numberWordF(0)).toBe("nula"))
  it("1 → 'jedna' (feminine differs)", () => expect(numberWordF(1)).toBe("jedna"))
  it("2 → 'dvije' (feminine differs)", () => expect(numberWordF(2)).toBe("dvije"))
  it("3 → 'tri' (same as masculine)", () => expect(numberWordF(3)).toBe("tri"))
  it("10 → 'deset'", () => expect(numberWordF(10)).toBe("deset"))
  it("21 → '21' (beyond word list)", () => expect(numberWordF(21)).toBe("21"))
})

// ---------------------------------------------------------------------------
// clockTime()
// ---------------------------------------------------------------------------

describe("clockTime()", () => {
  it('"04:55" → "4:55"', () => expect(clockTime("04:55")).toBe("4:55"))
  it('"24:11" → "0:11" (GTFS past-midnight wraps)', () => {
    expect(clockTime("24:11")).toBe("0:11")
  })
  it('"00:00" → "0:00"', () => expect(clockTime("00:00")).toBe("0:00"))
  it('"12:05" → "12:05"', () => expect(clockTime("12:05")).toBe("12:05"))
  it("invalid string passes through", () => {
    expect(clockTime("bad")).toBe("bad")
  })
})

// ---------------------------------------------------------------------------
// peakRange() — using minimal synthetic LinePageData
// ---------------------------------------------------------------------------

type MinimalLinePageData = {
  timetable: {
    radniDan: Array<{ hour: number; minutes: number[] }>[]
    subota: Array<{ hour: number; minutes: number[] }>[]
    nedjelja: Array<{ hour: number; minutes: number[] }>[]
  }
  // peakRange only reads timetable.radniDan[0]
}

function makeLinePageData(
  radniDanDir0: Array<{ hour: number; minutes: number[] }>
): MinimalLinePageData {
  return {
    timetable: {
      radniDan: [radniDanDir0],
      subota: [],
      nedjelja: [],
    },
  }
}

describe("peakRange()", () => {
  it("returns null when fewer than 4 departures in peak window", () => {
    // 3 departures in 06:30–09:30 window
    const data = makeLinePageData([
      { hour: 7, minutes: [0, 20, 40] },
    ])
    // @ts-expect-error partial type for testing
    expect(peakRange(data)).toBeNull()
  })

  it("returns [lo, hi] tuple for regular peak service", () => {
    // Departures every ~10 minutes during the 07:xx hour → gaps all 10
    const data = makeLinePageData([
      { hour: 7, minutes: [0, 10, 20, 30, 40, 50] },
    ])
    // @ts-expect-error partial type for testing
    const result = peakRange(data)
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    // gaps are all 10, so both p20 and p80 should be 10
    expect(result).toEqual([10, 10])
  })

  it("returns null when no departures in peak window (06:30–09:30)", () => {
    // Departures only in the evening
    const data = makeLinePageData([
      { hour: 17, minutes: [0, 15, 30, 45] },
      { hour: 18, minutes: [0, 15, 30, 45] },
    ])
    // @ts-expect-error partial type for testing
    expect(peakRange(data)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// serviceHistogram()
// ---------------------------------------------------------------------------

describe("serviceHistogram()", () => {
  it("returns 24-element array", () => {
    const data = makeLinePageData([
      { hour: 8, minutes: [0, 30] },
      { hour: 12, minutes: [0] },
    ])
    // @ts-expect-error partial type for testing
    const hist = serviceHistogram(data)
    expect(hist).toHaveLength(24)
  })

  it("picks the busier direction", () => {
    // Two directions: dir0 has 3 departures in hour 8; dir1 has 1
    const data = {
      timetable: {
        radniDan: [
          [{ hour: 8, minutes: [0, 20, 40] }],
          [{ hour: 8, minutes: [0] }],
        ],
        subota: [],
        nedjelja: [],
      },
    }
    // @ts-expect-error partial type for testing
    const hist = serviceHistogram(data)
    expect(hist[8]).toBe(3)
  })

  it("returns all-zero histogram for no service", () => {
    const data = {
      timetable: { radniDan: [], subota: [], nedjelja: [] },
    }
    // @ts-expect-error partial type for testing
    const hist = serviceHistogram(data)
    expect(hist).toHaveLength(24)
    expect(hist.every((v) => v === 0)).toBe(true)
  })
})
