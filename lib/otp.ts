import type { FeatureCollection } from "geojson"

export interface IsochroneParams {
  lat: number
  lon: number
}

export async function fetchIsochrone(
  params: IsochroneParams,
  signal?: AbortSignal
): Promise<FeatureCollection> {
  const { lat, lon } = params
  const response = await fetch(`/api/isochrone?lat=${lat}&lon=${lon}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Isochrone request failed: ${response.status}`)
  }
  return response.json()
}

export interface PlanParams {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
}

export interface Itinerary {
  duration: number
  walkDistance: number
  transfers: number
  legs: Leg[]
}

export interface Leg {
  mode: string
  from: Place
  to: Place
  duration: number
  distance: number
  route?: string
  legGeometry: {
    points: string
  }
}

export interface Place {
  name: string
  lat: number
  lon: number
}

// Use the deprecated `plan` query (simpler args than `planConnection`)
const PLAN_QUERY = `
  query Plan(
    $from: InputCoordinates!
    $to: InputCoordinates!
    $date: String!
    $time: String!
  ) {
    plan(
      from: $from
      to: $to
      date: $date
      time: $time
      transportModes: [{ mode: TRANSIT }, { mode: WALK }]
      numItineraries: 3
    ) {
      itineraries {
        duration
        walkDistance
        numberOfTransfers
        legs {
          mode
          from { name lat lon }
          to { name lat lon }
          duration
          distance
          route { shortName }
          legGeometry { points }
        }
      }
    }
  }
`

function nextWeekday(): { date: string; time: string } {
  const now = new Date()
  const day = now.getDay()
  const daysUntilWeekday = day === 0 ? 1 : day === 6 ? 2 : 0
  const target = new Date(now)
  target.setDate(target.getDate() + daysUntilWeekday)
  return {
    date: target.toISOString().split("T")[0],
    time: "08:00",
  }
}

export async function fetchPlan(
  params: PlanParams,
  signal?: AbortSignal
): Promise<{ itineraries: Itinerary[] }> {
  const { fromLat, fromLon, toLat, toLon } = params
  const { date, time } = nextWeekday()

  const response = await fetch("/otp/gtfs/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: PLAN_QUERY,
      variables: {
        from: { lat: fromLat, lon: fromLon },
        to: { lat: toLat, lon: toLon },
        date,
        time,
      },
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Plan request failed: ${response.status}`)
  }

  const json = await response.json()
  const itineraries = (json.data?.plan?.itineraries ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (it: any) => ({
      duration: it.duration,
      walkDistance: it.walkDistance,
      transfers: it.numberOfTransfers,
      legs: it.legs.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (leg: any) => ({
          mode: leg.mode,
          from: leg.from,
          to: leg.to,
          duration: leg.duration,
          distance: leg.distance,
          route: leg.route?.shortName,
          legGeometry: leg.legGeometry,
        })
      ),
    })
  )

  return { itineraries }
}
