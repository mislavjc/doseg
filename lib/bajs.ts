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
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`BAJS feed request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function bajsStationKey(stationId: string): string {
  return `bajs:${stationId}`
}

export function isBajsKey(key: string): boolean {
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
      name: stationInfo.name,
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

export async function getBajsData(): Promise<BajsData> {
  if (cachedData && Date.now() < cacheExpiresAt) return cachedData

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
