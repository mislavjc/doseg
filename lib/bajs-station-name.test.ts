import { describe, expect, it } from "vitest"

import { formatStationName } from "./bajs-station-name"

describe("formatStationName", () => {
  it("lowercases the appellative but keeps the proper noun", () => {
    expect(formatStationName("TRG KRALJA TOMISLAVA")).toBe("Trg kralja Tomislava")
    expect(formatStationName("UL. GRADA VUKOVARA")).toBe("Ul. grada Vukovara")
    expect(formatStationName("TRG DR. FRANJE TUĐMANA")).toBe(
      "Trg dr. Franje Tuđmana"
    )
  })

  it("keeps a name that is only proper nouns capitalised", () => {
    expect(formatStationName("TRG EUGENA KVATERNIKA")).toBe(
      "Trg Eugena Kvaternika"
    )
    expect(formatStationName("PARK KATE ŠOLJIĆ")).toBe("Park Kate Šoljić")
  })

  it("reopens capitalisation after a separator", () => {
    expect(
      formatStationName("UL. LJUDEVITA POSAVSKOG – UL. BALTAZARA BOGIŠIĆA")
    ).toBe("Ul. Ljudevita Posavskog – Ul. Baltazara Bogišića")
  })

  it("preserves initials and known acronyms", () => {
    expect(formatStationName("UL. V. HEINZELA")).toBe("Ul. V. Heinzela")
    expect(formatStationName("RSC JARUN - AQUARIUS")).toBe("RSC Jarun - Aquarius")
    expect(formatStationName("KBC ZAGREB")).toBe("KBC Zagreb")
  })

  it("does not mistake a short word for an acronym", () => {
    expect(formatStationName("SAVSKI MOST OKRETIŠTE")).toBe(
      "Savski most okretište"
    )
    expect(formatStationName("DOM ZDRAVLJA SIGET")).toBe("Dom zdravlja Siget")
    expect(formatStationName("PUČKO OTVORENO UČILIŠTE")).toBe(
      "Pučko otvoreno učilište"
    )
  })

  it("handles Croatian diacritics when changing case", () => {
    expect(formatStationName("ČRNOMEREC OKRETIŠTE")).toBe("Črnomerec okretište")
    expect(formatStationName("TREŠNJEVAČKI TRG")).toBe("Trešnjevački trg")
  })

  it("leaves an already-cased name untouched", () => {
    expect(formatStationName("Green Gold")).toBe("Green Gold")
  })

  it("collapses stray whitespace", () => {
    expect(formatStationName("  POINT CENTAR VRBANI ")).toBe(
      "Point centar Vrbani"
    )
  })

  it("lowercases an appellative that is not the first word", () => {
    expect(formatStationName("KULTURNI CENTAR DUBRAVA")).toBe(
      "Kulturni centar Dubrava"
    )
    expect(formatStationName("ŽELJEZNIČKO STAJALIŠTE VRAPČE")).toBe(
      "Željezničko stajalište Vrapče"
    )
    expect(formatStationName("AUTOBUSNI TERMINAL SESVETE")).toBe(
      "Autobusni terminal Sesvete"
    )
    expect(formatStationName("ZAGREBAČKI VELESAJAM")).toBe(
      "Zagrebački velesajam"
    )
  })

  it("keeps that same appellative capitalised when it opens the name", () => {
    expect(formatStationName("CENTAR BUNDEK")).toBe("Centar Bundek")
    expect(formatStationName("SVEUČILIŠTE ALGEBRA")).toBe("Sveučilište Algebra")
  })

  it("lowercases a genitive that belongs to the appellative", () => {
    expect(formatStationName("TRG ŽRTAVA FAŠIZMA")).toBe("Trg žrtava fašizma")
    expect(formatStationName("TRG HRVATSKIH VELIKANA")).toBe(
      "Trg hrvatskih velikana"
    )
    expect(formatStationName("UL. HRVATSKOG SOKOLA - JARUN")).toBe(
      "Ul. hrvatskog sokola - Jarun"
    )
    expect(formatStationName("TRG 101. BRIGADE")).toBe("Trg 101. brigade")
  })

  it("still capitalises a genitive that is somebody's name", () => {
    expect(formatStationName("TRG KRALJA TOMISLAVA")).toBe(
      "Trg kralja Tomislava"
    )
    expect(formatStationName("TRG EUGENA KVATERNIKA")).toBe(
      "Trg Eugena Kvaternika"
    )
  })
})
