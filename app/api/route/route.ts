import type { NextRequest } from "next/server"

import { apiErrorResponse, jsonResponse } from "@/lib/api-response"
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

function parseCoord(value: string | null): number {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- Number("") is 0, parseFloat("") is NaN; the NaN is what rejects a missing coordinate
  return Number.parseFloat(value ?? "")
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const originLat = parseCoord(searchParams.get("originLat"))
  const originLon = parseCoord(searchParams.get("originLon"))
  const destLat = parseCoord(searchParams.get("destLat"))
  const destLon = parseCoord(searchParams.get("destLon"))

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

    const { response } = jsonResponse(itinerary, request, "private, max-age=5")
    return response
  } catch (err) {
    return apiErrorResponse("route route error", err, 502)
  }
}
