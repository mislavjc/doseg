import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
import { getVehiclePositions } from "@/lib/gtfs-rt"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const vehicles = getVehiclePositions()

    const { response } = jsonResponse(
      vehicles,
      request,
      "public, max-age=15"
    )
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 500 })
  }
}
