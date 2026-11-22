/**
 * Display names for the map. The GTFS feed abbreviates long stop names to
 * fit ZET's displays; the map writes the official names out in full, in the
 * nominative. Keyed by the feed's name.
 */

const FULL = new Map(
  Object.entries({
    "Autobusni kol.": "Autobusni kolodvor",
    "Branim. tržnica": "Branimirova tržnica",
    "Grač. Mihaljevac": "Gračanski Mihaljevac",
    "Muzej suv.umjetnosti": "Muzej suvremene umjetnosti",
    "Radić. šetalište": "Radićevo šetalište",
    "St. dom S. Radić": "Studentski dom Stjepan Radić",
    "Sveučilišna al.": "Sveučilišna aleja",
    "Trg P. Krešimira": "Trg Petra Krešimira IV.",
    "Trg Rep. Hrvatske": "Trg Republike Hrvatske",
    "Trg bana J. Jelačića": "Trg bana Josipa Jelačića",
    "Trg dr. F. Tuđmana": "Trg dr. Franje Tuđmana",
    "Trg hr. velikana": "Trg hrvatskih velikana",
    "Trg žrt. fašizma": "Trg žrtava fašizma",
    "Učit. fakultet": "Učiteljski fakultet",
  })
)

export const fullName = (name: string) => FULL.get(name) ?? name
