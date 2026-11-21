import { responseJson } from "../../lib/json"

const STATION_INFORMATION_URL =
  "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json"

type Station = { lat: number; lon: number; is_virtual_station?: boolean }

/** The physical Bajs stations from the live GBFS feed (virtual ones dropped). */
export async function fetchStations(): Promise<Array<Station>> {
  const feed = await responseJson<{ data: { stations: Array<Station> } }>(
    await fetch(STATION_INFORMATION_URL)
  )
  const stations = feed.data.stations.filter((s) => !s.is_virtual_station)
  if (stations.length === 0) {
    throw new Error("GBFS returned no stations")
  }
  return stations
}
