import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
import { buildAccurateItinerary } from "@/lib/accurate-itinerary"
import { getReachabilityState } from "@/lib/reachability-state"
import { secondsOfDay } from "@/lib/zagreb-time"

function parseDepartureTime(timeStr: string | null): number {
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number)
    if (!Number.isNaN(h) && !Number.isNaN(m)) return h * 3600 + m * 60
  }
  return secondsOfDay()
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const originLat = parseFloat(searchParams.get("originLat") || "")
  const originLon = parseFloat(searchParams.get("originLon") || "")
  const destLat = parseFloat(searchParams.get("destLat") || "")
  const destLon = parseFloat(searchParams.get("destLon") || "")

  if (
    Number.isNaN(originLat) ||
    Number.isNaN(originLon) ||
    Number.isNaN(destLat) ||
    Number.isNaN(destLon)
  ) {
    return Response.json(
      { error: "originLat, originLon, destLat and destLon are required" },
      { status: 400 }
    )
  }

  const departureTime = parseDepartureTime(searchParams.get("time"))
  const useBajs = searchParams.get("bajs") === "1"
  const preferredKey = searchParams.get("preferredKey")

  try {
    const state = await getReachabilityState({
      originLat,
      originLon,
      departureTime,
      useBajs,
    })
    const itinerary = buildAccurateItinerary(
      state,
      destLat,
      destLon,
      preferredKey
    )

    if (!itinerary) {
      return Response.json({ error: "Route not found" }, { status: 404 })
    }

    const { response } = jsonResponse(
      itinerary,
      request,
      "private, max-age=5"
    )
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
