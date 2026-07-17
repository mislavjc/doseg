import type { FeatureCollection, Point } from "geojson"

const GBFS_BASE_URL = "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr"
const STATION_INFORMATION_URL = `${GBFS_BASE_URL}/station_information.json`
const STATION_STATUS_URL = `${GBFS_BASE_URL}/station_status.json`
const FALLBACK_TTL_SECONDS = 60

interface StationInformationFeed {
  ttl?: number
  data?: {
    stations?: Array<{
      station_id: string
      name: string
      short_name?: string
      lat: number
      lon: number
      is_virtual_station?: boolean
      capacity?: number
    }>
  }
}

interface StationStatusFeed {
  ttl?: number
  data?: {
    stations?: Array<{
      station_id: string
      num_bikes_available: number
      num_docks_available: number
      is_installed: boolean
      is_renting: boolean
      is_returning: boolean
      last_reported: number
    }>
  }
}

export interface BajsStation {
  key: string
  stationId: string
  shortName: string
  name: string
  lat: number
  lon: number
  capacity: number
  bikesAvailable: number
  docksAvailable: number
  isInstalled: boolean
  isRenting: boolean
  isReturning: boolean
  lastReported: number
}

export interface BajsData {
  ttlSeconds: number
  updatedAt: number
  stations: BajsStation[]
  stationMap: Map<string, BajsStation>
}

type BajsStationProperties = {
  stationId: string
  shortName: string
  name: string
  capacity: number
  bikesAvailable: number
  docksAvailable: number
  isInstalled: boolean
  isRenting: boolean
  isReturning: boolean
  lastReported: number
}

let cachedData: BajsData | null = null
let cacheExpiresAt = 0
let pendingLoad: Promise<BajsData> | null = null

function clampTtl(ttl: number | undefined): number {
  if (!ttl || Number.isNaN(ttl)) return FALLBACK_TTL_SECONDS
  return Math.max(15, Math.min(ttl, FALLBACK_TTL_SECONDS))
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    throw new Error(`BAJS feed request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

/** The GBFS feed shouts station names ("TRATINSKA UL. - SAVSKA UL."); the
 *  design system bans all-caps, so normalize once here for every consumer.
 *  Capitalize words, keep abbreviations like "ul." lowercase, preserve
 *  single-letter person initials ("R. Kolaka"). */
function unshout(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\p{L}\p{M}]+\.?/gu, (w) =>
      w.length === 3 && w.endsWith(".") ? w : w[0].toUpperCase() + w.slice(1)
    )
}

function bajsStationKey(stationId: string): string {
  return `bajs:${stationId}`
}

function isBajsKey(key: string): boolean {
  return key.startsWith("bajs:")
}

async function loadBajsData(): Promise<BajsData> {
  const [infoFeed, statusFeed] = await Promise.all([
    fetchJson<StationInformationFeed>(STATION_INFORMATION_URL),
    fetchJson<StationStatusFeed>(STATION_STATUS_URL),
  ])

  const stationsInfo = infoFeed.data?.stations
  const stationsStatus = statusFeed.data?.stations

  if (!stationsInfo || !stationsStatus) {
    throw new Error("BAJS feed returned no station data")
  }

  const statusById = new Map(
    stationsStatus.map((station) => [station.station_id, station])
  )

  const stations: BajsStation[] = []
  for (const stationInfo of stationsInfo) {
    if (stationInfo.is_virtual_station) continue

    const stationStatus = statusById.get(stationInfo.station_id)
    if (!stationStatus) continue

    stations.push({
      key: bajsStationKey(stationInfo.station_id),
      stationId: stationInfo.station_id,
      shortName: stationInfo.short_name ?? "",
      name: unshout(stationInfo.name),
      lat: stationInfo.lat,
      lon: stationInfo.lon,
      capacity:
        stationInfo.capacity ??
        stationStatus.num_bikes_available + stationStatus.num_docks_available,
      bikesAvailable: stationStatus.num_bikes_available,
      docksAvailable: stationStatus.num_docks_available,
      isInstalled: stationStatus.is_installed,
      isRenting: stationStatus.is_renting,
      isReturning: stationStatus.is_returning,
      lastReported: stationStatus.last_reported,
    })
  }

  const ttlSeconds = Math.min(clampTtl(infoFeed.ttl), clampTtl(statusFeed.ttl))
  const stationMap = new Map(stations.map((station) => [station.key, station]))

  return {
    ttlSeconds,
    updatedAt: Math.floor(Date.now() / 1000),
    stations,
    stationMap,
  }
}

function startRefresh(): Promise<BajsData> {
  if (!pendingLoad) {
    pendingLoad = loadBajsData()
      .then((data) => {
        cachedData = data
        cacheExpiresAt = Date.now() + data.ttlSeconds * 1000
        return data
      })
      .finally(() => {
        pendingLoad = null
      })
  }
  return pendingLoad
}

export async function getBajsData(): Promise<BajsData> {
  // Same stale-while-revalidate shape as lib/gtfs-rt.ts: an expired snapshot
  // is served immediately while a deduped refresh lands in the background, so
  // only the first request of a process lifetime waits on the GBFS feed. A
  // refresh failure keeps the last-good snapshot in place.
  if (cachedData) {
    if (Date.now() >= cacheExpiresAt) startRefresh().catch(() => {})
    return cachedData
  }
  return startRefresh()
}

export function buildBajsFeatureCollection(
  stations: readonly BajsStation[]
): FeatureCollection<Point, BajsStationProperties> {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      properties: {
        stationId: station.stationId,
        shortName: station.shortName,
        name: station.name,
        capacity: station.capacity,
        bikesAvailable: station.bikesAvailable,
        docksAvailable: station.docksAvailable,
        isInstalled: station.isInstalled,
        isRenting: station.isRenting,
        isReturning: station.isReturning,
        lastReported: station.lastReported,
      },
      geometry: {
        type: "Point",
        coordinates: [station.lon, station.lat],
      },
    })),
  }
}
