// ---------------------------------------------------------------------------
// Zagreb tram network – schematic data for tube-map display.
// Station names and route sequences come from the ZET GTFS feed.
// Only key interchange / terminus stations are included (~50 of 120 real stops).
// Coordinates are schematic (Beck-style), not geographic.
// ---------------------------------------------------------------------------

export interface TramStation {
  id: string
  name: string
  x: number
  y: number
}

export interface TramLine {
  number: string
  label: string
  color: string
  stationIds: string[]
}

// ---- Official ZET line-colour groups ----------------------------------------

export const LINE_COLORS = {
  blue: "#0072CE",
  darkGreen: "#00843D",
  yellow: "#FFB81C",
  pink: "#E4258F",
  purple: "#7B2D8E",
  green: "#4CB848",
} as const

// ---- Stations ---------------------------------------------------------------
// Layout: Beck-style schematic on an 80 px grid.
// Every segment between consecutive stations on a line is at exactly 0°, 45°, or 90°.
//   Upper corridor (y=320): Jelačić line (Ilica → Jelačić → east)
//   Borongaj branch (y=240): NE diagonal from upper corridor
//   North branch (x=640): Mihaljevac, vertical spine through Draškovićeva
//   Connector row (y=400): Zrinjevac, Sheraton, Zapadni kolodvor
//   Lower corridor (y=480): GK line (Ljubljanica → Savišće)
//   Lower-west junction (y=640): Prečko / Knežija / St. dom Radić
//   South loop (y=720): Savski most / Savski gaj → Zapruđe

const stationList: TramStation[] = [
  // ── UPPER CORRIDOR (y=320) ─────────────────────────────────────────────
  { id: "crnomerec", name: "Črnomerec", x: 80, y: 320 },
  { id: "trg-tudjmana", name: "Trg dr. F. Tuđmana", x: 240, y: 320 },
  { id: "frankopanska", name: "Frankopanska", x: 400, y: 320 },
  { id: "trg-jelacica", name: "Trg bana J. Jelačića", x: 560, y: 320 },
  { id: "draskovic", name: "Draškovićeva", x: 640, y: 320 },
  { id: "kvaternikov-trg", name: "Kvaternikov trg", x: 800, y: 320 },
  { id: "park-maksimir", name: "Park Maksimir", x: 880, y: 320 },
  { id: "ravnice", name: "Ravnice", x: 960, y: 320 },
  { id: "dubrava", name: "Dubrava", x: 1040, y: 320 },
  { id: "dubec", name: "Dubec", x: 1200, y: 320 },

  // ── CONNECTOR ROW (y=400, between corridors) ──────────────────────────
  { id: "zapadni-kolodvor", name: "Zapadni kolodvor", x: 160, y: 400 },
  { id: "zrinjevac", name: "Zrinjevac", x: 480, y: 400 },
  { id: "sheraton", name: "Sheraton", x: 640, y: 400 },

  // ── BORONGAJ BRANCH (y=240, NE from upper corridor) ───────────────────
  { id: "trg-zrtava-fasizma", name: "Trg žrt. fašizma", x: 640, y: 240 },
  { id: "subiceva", name: "Šubićeva", x: 720, y: 240 },
  { id: "heinzelova-sjever", name: "Heinzelova-sjever", x: 800, y: 240 },
  { id: "svetice", name: "Svetice", x: 880, y: 240 },
  { id: "borongaj", name: "Borongaj", x: 960, y: 240 },

  // ── NORTH BRANCH (vertical spine at x=640) ────────────────────────────
  { id: "gupceva-zvijezda", name: "Gupčeva zvijezda", x: 640, y: 160 },
  { id: "mihaljevac", name: "Mihaljevac", x: 640, y: 80 },
  { id: "gracansko-dolje", name: "Gračansko dolje", x: 720, y: 80 },

  // ── LOWER CORRIDOR (y=480) ────────────────────────────────────────────
  { id: "ljubljanica", name: "Ljubljanica", x: 80, y: 480 },
  { id: "tehnicki-muzej", name: "Tehnički muzej", x: 160, y: 480 },
  { id: "studentski-centar", name: "Studentski centar", x: 240, y: 480 },
  { id: "zagrepčanka", name: "Zagrepčanka", x: 320, y: 480 },
  { id: "vodnikova", name: "Vodnikova", x: 400, y: 480 },
  { id: "botanicki-vrt", name: "Botanički vrt", x: 480, y: 480 },
  { id: "glavni-kolodvor", name: "Glavni kolodvor", x: 560, y: 480 },
  { id: "branimir-centar", name: "Branimir centar", x: 640, y: 480 },
  { id: "autobusni-kolodvor", name: "Autobusni kol.", x: 720, y: 480 },
  { id: "drziceva", name: "Držićeva", x: 800, y: 480 },
  { id: "heinzelova", name: "Heinzelova", x: 880, y: 480 },
  { id: "getaldic", name: "Getaldićeva", x: 960, y: 480 },
  { id: "zitnjak", name: "Žitnjak", x: 1040, y: 480 },
  { id: "savisce", name: "Savišće", x: 1200, y: 480 },

  // ── WEST TERMINI & LOWER-WEST JUNCTION ────────────────────────────────
  { id: "precko", name: "Prečko", x: 80, y: 640 },
  { id: "knezija", name: "Knežija", x: 160, y: 640 },
  { id: "st-dom-radic", name: "St. dom S. Radić", x: 320, y: 640 },
  { id: "savski-most", name: "Savski most", x: 240, y: 720 },

  // ── SOUTH LOOP — east side (vertical from Držićeva) ───────────────────
  { id: "drziceva-petlja", name: "Držićeva-petlja", x: 800, y: 560 },
  { id: "most-mladosti", name: "Most mladosti", x: 800, y: 640 },
  { id: "zaprudje", name: "Zapruđe", x: 720, y: 720 },

  // ── SOUTH LOOP — bottom (y=720, horizontal) ───────────────────────────
  { id: "sredisce", name: "Središće", x: 640, y: 720 },
  { id: "sopot", name: "Sopot", x: 560, y: 720 },
  { id: "trnsko", name: "Trnsko", x: 480, y: 720 },
  { id: "savski-gaj", name: "Savski gaj", x: 400, y: 720 },
]

export const STATIONS: Record<string, TramStation> = Object.fromEntries(
  stationList.map((s) => [s.id, s]),
)

function ids(...list: (keyof typeof STATIONS)[]): string[] {
  return list as string[]
}

// ---- Line definitions (simplified to key stations) --------------------------

export const TRAM_LINES: TramLine[] = [
  {
    number: "1",
    label: "Zapadni kolodvor – Borongaj",
    color: LINE_COLORS.blue,
    stationIds: ids(
      "zapadni-kolodvor", "trg-tudjmana", "frankopanska",
      "trg-jelacica", "trg-zrtava-fasizma",
      "subiceva", "heinzelova-sjever", "svetice", "borongaj",
    ),
  },
  {
    number: "2",
    label: "Črnomerec – Savišće",
    color: LINE_COLORS.darkGreen,
    stationIds: ids(
      "crnomerec", "trg-tudjmana", "vodnikova",
      "botanicki-vrt", "glavni-kolodvor", "branimir-centar",
      "autobusni-kolodvor", "drziceva",
      "heinzelova", "getaldic", "zitnjak", "savisce",
    ),
  },
  {
    number: "3",
    label: "Ljubljanica – Savišće",
    color: LINE_COLORS.darkGreen,
    stationIds: ids(
      "ljubljanica", "tehnicki-muzej", "studentski-centar",
      "zagrepčanka", "drziceva",
      "heinzelova", "getaldic", "zitnjak", "savisce",
    ),
  },
  {
    number: "4",
    label: "Savski most – Dubec",
    color: LINE_COLORS.darkGreen,
    stationIds: ids(
      "savski-most", "st-dom-radic", "zagrepčanka",
      "studentski-centar", "vodnikova", "botanicki-vrt",
      "glavni-kolodvor", "branimir-centar", "sheraton",
      "draskovic", "kvaternikov-trg", "park-maksimir",
      "ravnice", "dubrava", "dubec",
    ),
  },
  {
    number: "5",
    label: "Prečko – Park Maksimir",
    color: LINE_COLORS.darkGreen,
    stationIds: ids(
      "precko", "knezija", "st-dom-radic", "zagrepčanka",
      "drziceva", "autobusni-kolodvor",
      "subiceva", "kvaternikov-trg", "park-maksimir",
    ),
  },
  {
    number: "6",
    label: "Črnomerec – Sopot",
    color: LINE_COLORS.yellow,
    stationIds: ids(
      "crnomerec", "trg-tudjmana", "frankopanska",
      "trg-jelacica", "zrinjevac", "glavni-kolodvor",
      "branimir-centar", "autobusni-kolodvor", "drziceva",
      "drziceva-petlja", "most-mladosti", "zaprudje",
      "sredisce", "sopot",
    ),
  },
  {
    number: "7",
    label: "Savski most – Dubrava",
    color: LINE_COLORS.yellow,
    stationIds: ids(
      "savski-most", "st-dom-radic", "savski-gaj",
      "trnsko", "sopot", "sredisce",
      "zaprudje", "most-mladosti", "drziceva-petlja",
      "drziceva", "autobusni-kolodvor",
      "subiceva", "kvaternikov-trg", "park-maksimir",
      "ravnice", "dubrava",
    ),
  },
  {
    number: "8",
    label: "Mihaljevac – Zapruđe",
    color: LINE_COLORS.pink,
    stationIds: ids(
      "mihaljevac", "gupceva-zvijezda", "draskovic",
      "sheraton", "branimir-centar", "autobusni-kolodvor",
      "drziceva", "drziceva-petlja", "most-mladosti", "zaprudje",
    ),
  },
  {
    number: "9",
    label: "Ljubljanica – Borongaj",
    color: LINE_COLORS.pink,
    stationIds: ids(
      "ljubljanica", "tehnicki-muzej",
      "vodnikova", "botanicki-vrt", "glavni-kolodvor",
      "branimir-centar", "sheraton", "trg-zrtava-fasizma",
      "subiceva", "heinzelova-sjever", "svetice", "borongaj",
    ),
  },
  {
    number: "11",
    label: "Črnomerec – Dubec",
    color: LINE_COLORS.purple,
    stationIds: ids(
      "crnomerec", "trg-tudjmana", "frankopanska",
      "trg-jelacica", "draskovic", "kvaternikov-trg",
      "park-maksimir", "ravnice", "dubrava", "dubec",
    ),
  },
  {
    number: "12",
    label: "Ljubljanica – Dubrava",
    color: LINE_COLORS.purple,
    stationIds: ids(
      "ljubljanica", "tehnicki-muzej",
      "vodnikova", "frankopanska",
      "trg-jelacica", "draskovic", "kvaternikov-trg",
      "park-maksimir", "ravnice", "dubrava",
    ),
  },
  {
    number: "13",
    label: "Žitnjak – Kvaternikov trg",
    color: LINE_COLORS.green,
    stationIds: ids(
      "zitnjak", "getaldic", "heinzelova", "drziceva",
      "studentski-centar", "vodnikova", "frankopanska",
      "trg-jelacica", "zrinjevac", "glavni-kolodvor",
      "branimir-centar", "sheraton", "trg-zrtava-fasizma",
      "subiceva", "kvaternikov-trg",
    ),
  },
  {
    number: "14",
    label: "Mihaljevac – Zapruđe",
    color: LINE_COLORS.yellow,
    stationIds: ids(
      "mihaljevac", "gupceva-zvijezda", "draskovic",
      "trg-jelacica", "frankopanska", "vodnikova",
      "studentski-centar", "zagrepčanka",
      "st-dom-radic", "savski-gaj", "trnsko",
      "sopot", "sredisce", "zaprudje",
    ),
  },
  {
    number: "15",
    label: "Mihaljevac – Gračansko dolje",
    color: LINE_COLORS.green,
    stationIds: ids("mihaljevac", "gracansko-dolje"),
  },
  {
    number: "17",
    label: "Prečko – Borongaj",
    color: LINE_COLORS.darkGreen,
    stationIds: ids(
      "precko", "knezija", "st-dom-radic", "zagrepčanka",
      "studentski-centar", "vodnikova", "frankopanska",
      "trg-jelacica", "trg-zrtava-fasizma",
      "subiceva", "heinzelova-sjever", "svetice", "borongaj",
    ),
  },
]

// ---- Derived helpers --------------------------------------------------------

export function linesAtStation(stationId: string): TramLine[] {
  return TRAM_LINES.filter((l) => l.stationIds.includes(stationId))
}

export function isInterchange(stationId: string): boolean {
  return linesAtStation(stationId).length >= 2
}

// ---- Parallel-line edge geometry --------------------------------------------
// Precomputed once: for each pair of adjacent stations shared by multiple lines,
// stores the perpendicular offset direction and sorted list of lines.

export const LINE_W = 4
export const SPACING = LINE_W + 1.5

export interface EdgeInfo {
  lines: string[]
  px: number
  py: number
}

/** Canonical edge key: spatially ordered so perpendicular offset is consistent. */
export function edgeKey(a: string, b: string): string {
  const sA = STATIONS[a], sB = STATIONS[b]
  if (sA.x < sB.x || (sA.x === sB.x && sA.y < sB.y)) return `${a}|${b}`
  return `${b}|${a}`
}

export const EDGES: ReadonlyMap<string, EdgeInfo> = (() => {
  const m = new Map<string, EdgeInfo>()
  for (const line of TRAM_LINES) {
    for (let i = 0; i < line.stationIds.length - 1; i++) {
      const a = line.stationIds[i], b = line.stationIds[i + 1]
      const key = edgeKey(a, b)
      if (!m.has(key)) {
        const [fstId, sndId] = key.split("|")
        const sA = STATIONS[fstId], sB = STATIONS[sndId]
        const dx = sB.x - sA.x, dy = sB.y - sA.y, len = Math.hypot(dx, dy)
        m.set(key, { lines: [], px: -dy / len, py: dx / len })
      }
      const e = m.get(key)!
      if (!e.lines.includes(line.number)) e.lines.push(line.number)
    }
  }
  for (const e of m.values()) e.lines.sort((a, b) => +a - +b)
  return m
})()
