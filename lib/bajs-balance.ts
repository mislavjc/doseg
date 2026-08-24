import { districtAt } from "@/lib/district-at"
import { getBajsData } from "@/lib/bajs"
import type { BajsRanking } from "@/lib/bajs-rides"

/**
 * The two ends of the same imbalance, on one axis: stations holding more bikes
 * than they have docks for, and stations that spend their time with none.
 *
 * The two sides are measured differently on purpose. Surplus is a reading of
 * right now, because a pile-up is a live condition. Emptiness is a share of
 * observed time, because a station that is empty every morning matters more
 * than one that happens to be empty this minute.
 */

export type BalanceRow = {
  stationId: string
  name: string
  kvart: string | null
  /** Bikes over capacity right now. Only set on the surplus side. */
  surplus?: number
  /** Share of observed samples with no bike, 0-1. Only set on the empty side. */
  emptyShare?: number
}

export type BajsBalance = {
  surplus: BalanceRow[]
  empty: BalanceRow[]
  /** Stations currently holding more bikes than docks. */
  overCapacity: number
  totalStations: number
  observedDays: number
}

export async function loadBajsBalance(
  ranking: BajsRanking | null,
  limit = 5
): Promise<BajsBalance | null> {
  if (!ranking) return null

  let live
  try {
    live = await getBajsData()
  } catch {
    return null
  }

  const over = live.stations
    .filter((s) => s.capacity > 0 && s.bikesAvailable > s.capacity)
    .map((s) => ({
      stationId: s.stationId,
      name: s.name,
      kvart: districtAt(s.lat, s.lon),
      surplus: s.bikesAvailable - s.capacity,
    }))
    .sort((a, b) => b.surplus - a.surplus)

  // No sample-count filter: every station is polled on the same minute tick,
  // so they all carry the same number of samples and none is noisier than the
  // rest. Stations the ranking never saw simply are not in the list.
  //
  // Temporary installations are dropped though. They carry an end date in the
  // name ("Tuškanac - Privremena do 31.8."), they top the empty ranking because
  // they are barely stocked, and naming one says nothing about demand.
  const byId = new Map(live.stations.map((s) => [s.stationId, s]))
  const empty = ranking.all
    .filter((s) => s.emptyShare > 0 && !/privremen/i.test(s.name))
    .sort((a, b) => b.emptyShare - a.emptyShare)
    .slice(0, limit)
    .map((s) => {
      const info = byId.get(s.stationId)
      return {
        stationId: s.stationId,
        name: s.name,
        kvart: info ? districtAt(info.lat, info.lon) : districtAt(s.lat, s.lon),
        emptyShare: s.emptyShare,
      }
    })

  if (over.length === 0 && empty.length === 0) return null

  return {
    surplus: over.slice(0, limit),
    empty,
    overCapacity: over.length,
    totalStations: live.stations.length,
    observedDays: ranking.observedDays,
  }
}
