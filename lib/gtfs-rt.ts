import GtfsRealtimeBindings from "gtfs-realtime-bindings"

const ZET_RT_URL = "https://www.zet.hr/gtfs-rt-protobuf"
const CACHE_TTL_MS = 30_000

// ---------------------------------------------------------------------------
// Trip update types (existing)
// ---------------------------------------------------------------------------

export interface StopTimeRT {
  stopSequence: number
  arrivalDelay: number // seconds, positive = late
}

export interface TripRT {
  stopTimes: StopTimeRT[] // sorted by stopSequence
}

// ---------------------------------------------------------------------------
// Vehicle position types
// ---------------------------------------------------------------------------

export interface VehiclePosition {
  tripId: string
  routeId: string | null
  lat: number
  lon: number
  bearing: number | null
  speed: number | null
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO"
  occupancyStatus: string | null
}

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export interface AlertActivePeriod {
  start: number | null // unix seconds
  end: number | null
}

export interface Alert {
  activePeriods: AlertActivePeriod[]
  affectedRouteIds: string[]
  affectedStopIds: string[]
  cause: string
  effect: string
  headerText: string | null
  descriptionText: string | null
}

// ---------------------------------------------------------------------------
// Enum reverse-lookups
// ---------------------------------------------------------------------------

const VehicleStopStatus =
  GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus
const VehicleStopStatusName: Record<number, VehiclePosition["status"]> = {
  [VehicleStopStatus.INCOMING_AT]: "INCOMING_AT",
  [VehicleStopStatus.STOPPED_AT]: "STOPPED_AT",
  [VehicleStopStatus.IN_TRANSIT_TO]: "IN_TRANSIT_TO",
}

const OccupancyStatus =
  GtfsRealtimeBindings.transit_realtime.VehiclePosition.OccupancyStatus
const OccupancyStatusName: Record<number, string> = {
  [OccupancyStatus.EMPTY]: "EMPTY",
  [OccupancyStatus.MANY_SEATS_AVAILABLE]: "MANY_SEATS_AVAILABLE",
  [OccupancyStatus.FEW_SEATS_AVAILABLE]: "FEW_SEATS_AVAILABLE",
  [OccupancyStatus.STANDING_ROOM_ONLY]: "STANDING_ROOM_ONLY",
  [OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY]: "CRUSHED_STANDING_ROOM_ONLY",
  [OccupancyStatus.FULL]: "FULL",
  [OccupancyStatus.NOT_ACCEPTING_PASSENGERS]: "NOT_ACCEPTING_PASSENGERS",
  [OccupancyStatus.NO_DATA_AVAILABLE]: "NO_DATA_AVAILABLE",
  [OccupancyStatus.NOT_BOARDABLE]: "NOT_BOARDABLE",
}

const AlertCause = GtfsRealtimeBindings.transit_realtime.Alert.Cause
const AlertCauseName: Record<number, string> = {
  [AlertCause.UNKNOWN_CAUSE]: "UNKNOWN_CAUSE",
  [AlertCause.OTHER_CAUSE]: "OTHER_CAUSE",
  [AlertCause.TECHNICAL_PROBLEM]: "TECHNICAL_PROBLEM",
  [AlertCause.STRIKE]: "STRIKE",
  [AlertCause.DEMONSTRATION]: "DEMONSTRATION",
  [AlertCause.ACCIDENT]: "ACCIDENT",
  [AlertCause.HOLIDAY]: "HOLIDAY",
  [AlertCause.WEATHER]: "WEATHER",
  [AlertCause.MAINTENANCE]: "MAINTENANCE",
  [AlertCause.CONSTRUCTION]: "CONSTRUCTION",
  [AlertCause.POLICE_ACTIVITY]: "POLICE_ACTIVITY",
  [AlertCause.MEDICAL_EMERGENCY]: "MEDICAL_EMERGENCY",
}

const AlertEffect = GtfsRealtimeBindings.transit_realtime.Alert.Effect
const AlertEffectName: Record<number, string> = {
  [AlertEffect.NO_SERVICE]: "NO_SERVICE",
  [AlertEffect.REDUCED_SERVICE]: "REDUCED_SERVICE",
  [AlertEffect.SIGNIFICANT_DELAYS]: "SIGNIFICANT_DELAYS",
  [AlertEffect.DETOUR]: "DETOUR",
  [AlertEffect.ADDITIONAL_SERVICE]: "ADDITIONAL_SERVICE",
  [AlertEffect.MODIFIED_SERVICE]: "MODIFIED_SERVICE",
  [AlertEffect.OTHER_EFFECT]: "OTHER_EFFECT",
  [AlertEffect.UNKNOWN_EFFECT]: "UNKNOWN_EFFECT",
  [AlertEffect.STOP_MOVED]: "STOP_MOVED",
  [AlertEffect.NO_EFFECT]: "NO_EFFECT",
  [AlertEffect.ACCESSIBILITY_ISSUE]: "ACCESSIBILITY_ISSUE",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick the first translation text from a TranslatedString, or null. */
function translatedText(
  ts: { translation?: { text: string }[] | null } | null | undefined
): string | null {
  return ts?.translation?.[0]?.text ?? null
}

/** Coerce a protobuf number|Long to a JS number, or null. */
function toNum(v: number | { toNumber(): number } | null | undefined): number | null {
  if (v == null) return null
  return typeof v === "number" ? v : v.toNumber()
}

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

let cachedTrips: Map<string, TripRT> = new Map()
let cachedVehicles: VehiclePosition[] = []
let cachedAlerts: Alert[] = []
let cacheTime = 0
let refreshPromise: Promise<void> | null = null

type FeedEntity = GtfsRealtimeBindings.transit_realtime.IFeedEntity

function parseTripUpdate(entity: FeedEntity, rt: Map<string, TripRT>) {
  const tu = entity.tripUpdate
  if (!tu?.trip?.tripId || !tu.stopTimeUpdate?.length) return

  const stopTimes: StopTimeRT[] = []
  for (const stu of tu.stopTimeUpdate) {
    const delay = stu.arrival?.delay ?? stu.departure?.delay ?? 0
    stopTimes.push({
      stopSequence: stu.stopSequence ?? 0,
      arrivalDelay: delay,
    })
  }
  stopTimes.sort((a, b) => a.stopSequence - b.stopSequence)
  rt.set(tu.trip.tripId, { stopTimes })
}

function parseVehiclePosition(entity: FeedEntity, vehicles: VehiclePosition[]) {
  const vp = entity.vehicle
  if (!vp?.trip?.tripId || !vp.position) return

  const statusNum = vp.currentStatus ?? VehicleStopStatus.IN_TRANSIT_TO
  const occNum = vp.occupancyStatus

  vehicles.push({
    tripId: vp.trip.tripId,
    routeId: vp.trip.routeId ?? null,
    lat: vp.position.latitude,
    lon: vp.position.longitude,
    bearing: vp.position.bearing ?? null,
    speed: vp.position.speed ?? null,
    status: VehicleStopStatusName[statusNum] ?? "IN_TRANSIT_TO",
    occupancyStatus:
      occNum != null ? (OccupancyStatusName[occNum] ?? null) : null,
  })
}

function parseAlert(entity: FeedEntity, alerts: Alert[]) {
  const al = entity.alert
  if (!al) return

  const activePeriods: AlertActivePeriod[] = (al.activePeriod ?? []).map(
    (p) => ({ start: toNum(p.start), end: toNum(p.end) })
  )

  const affectedRouteIds: string[] = []
  const affectedStopIds: string[] = []
  for (const ie of al.informedEntity ?? []) {
    if (ie.routeId) affectedRouteIds.push(ie.routeId)
    if (ie.stopId) affectedStopIds.push(ie.stopId)
  }

  const causeNum = al.cause ?? AlertCause.UNKNOWN_CAUSE
  const effectNum = al.effect ?? AlertEffect.UNKNOWN_EFFECT

  alerts.push({
    activePeriods,
    affectedRouteIds,
    affectedStopIds,
    cause: AlertCauseName[causeNum] ?? "UNKNOWN_CAUSE",
    effect: AlertEffectName[effectNum] ?? "UNKNOWN_EFFECT",
    headerText: translatedText(al.headerText),
    descriptionText: translatedText(al.descriptionText),
  })
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(ZET_RT_URL)
    if (!res.ok) throw new Error(`GTFS-RT fetch failed: ${res.status}`)

    const buf = await res.arrayBuffer()
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buf)
    )

    const rt = new Map<string, TripRT>()
    const vehicles: VehiclePosition[] = []
    const alerts: Alert[] = []

    for (const entity of feed.entity) {
      parseTripUpdate(entity, rt)
      parseVehiclePosition(entity, vehicles)
      parseAlert(entity, alerts)
    }

    cachedTrips = rt
    cachedVehicles = vehicles
    cachedAlerts = alerts
    cacheTime = Date.now()
  } catch {
    // Keep serving stale cache on failure
  } finally {
    refreshPromise = null
  }
}

/** Trigger a background refresh if the cache is stale. */
function ensureFresh(): void {
  if (Date.now() - cacheTime >= CACHE_TTL_MS && !refreshPromise) {
    refreshPromise = refresh()
  }
}

/** Returns cached RT trip-update data; triggers background refresh when stale. */
export function getRealtimeData(): Map<string, TripRT> {
  ensureFresh()
  return cachedTrips
}

/** Returns cached vehicle positions; triggers background refresh when stale. */
export function getVehiclePositions(): VehiclePosition[] {
  ensureFresh()
  return cachedVehicles
}

/** Returns cached service alerts; triggers background refresh when stale. */
export function getAlerts(): Alert[] {
  ensureFresh()
  return cachedAlerts
}

/**
 * Find the delay for a given stop index in a trip's RT data.
 * GTFS-RT stop_sequence is 1-based; pattern stopIdx is 0-based.
 * Per spec, delays propagate forward until overridden.
 */
export function getStopDelay(trip: TripRT, stopIdx: number): number {
  const seq = stopIdx + 1 // 0-based → 1-based
  let delay = 0
  for (const st of trip.stopTimes) {
    if (st.stopSequence > seq) break
    delay = st.arrivalDelay
  }
  return delay
}
