/**
 * The GBFS feed publishes station names in caps ("TRG KRALJA TOMISLAVA").
 * The site never renders caps, so names are re-cased for display.
 *
 * Croatian street names capitalise the proper noun and leave the appellative
 * lowercase ("Trg kralja Tomislava", "Ul. grada Vukovara"), which no general
 * rule can derive. So: capitalise every word, then push a closed list of
 * appellatives and function words back down unless they open the name. The
 * list is tuned against the ~200 Zagreb station names, not the language.
 */

const LOWERCASE = new Set([
  // appellatives
  "ul.",
  "ulica",
  "trg",
  "cesta",
  "put",
  "aleja",
  "park",
  "most",
  "prilaz",
  "šetalište",
  "obala",
  "avenija",
  "okretište",
  "kolodvor",
  "remiza",
  "naselje",
  "učilište",
  "dvorana",
  "bolnica",
  "zdravlja",
  "fakultet",
  "otvoreno",
  "pučko",
  "škola",
  "groblje",
  "tržnica",
  "centar",
  "stajalište",
  "terminal",
  "sveučilište",
  "sveučilišna",
  "knjižnica",
  "velesajam",
  "breg",
  "dol",
  "gaj",
  // genitives that read as part of an appellative, not as a proper name
  "žrtava",
  "fašizma",
  "velikana",
  "hrvatskih",
  "hrvatskog",
  "katoličko",
  "sokola",
  "brigade",
  // titles
  "dr.",
  "sv.",
  "prof.",
  "kralja",
  "kraljice",
  "kneza",
  "bana",
  "braće",
  "grada",
  "sestara",
  // function words
  "i",
  "na",
  "od",
  "za",
  "pri",
  "kod",
  "do",
  "u",
])

/**
 * Kept in caps. Listed rather than detected by length: "DOM", "TRG" and "MOST"
 * are three-letter words, and "DO" is a preposition, so no length rule
 * separates an abbreviation from a short word here.
 */
const ACRONYMS = new Set([
  "hak",
  "kb",
  "kbc",
  "mup",
  "rsc",
  "rtl",
  "sc",
  "tc",
  "vmd",
  "oš",
  "žs",
  "nsk",
  "hnk",
  "xiii",
])

/** A single-letter initial in a person's name, e.g. "V. Heinzela". */
function isInitial(word: string) {
  return /^\p{L}\.$/u.test(word)
}

function caseWord(word: string, first: boolean) {
  if (!word) return word

  if (isInitial(word)) return word.toLocaleUpperCase("hr")

  const lower = word.toLocaleLowerCase("hr")
  if (ACRONYMS.has(lower)) return lower.toLocaleUpperCase("hr")

  const capitalised = lower.charAt(0).toLocaleUpperCase("hr") + lower.slice(1)
  if (!first && LOWERCASE.has(lower)) return lower
  return capitalised
}

export function formatStationName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ")
  if (!trimmed) return trimmed
  // Anything that is not already caps is left alone: the feed occasionally
  // carries a properly-cased name and re-casing it would only lose detail.
  if (trimmed !== trimmed.toLocaleUpperCase("hr")) return trimmed

  let atStart = true
  return trimmed
    .split(" ")
    .map((word) => {
      const cased = caseWord(word, atStart)
      // A separator resets the sentence, so the next segment opens fresh.
      atStart = /^[-–—/]$/.test(word)
      return cased
    })
    .join(" ")
}
