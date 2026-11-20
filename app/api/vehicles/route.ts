import { connection } from "next/server"

import { apiErrorResponse, jsonResponse } from "@/lib/api-response"
import { getVehiclePositions } from "@/lib/gtfs-rt"

export async function GET() {
  await connection()
  try {
    const vehicles = getVehiclePositions()

    const { response } = jsonResponse(vehicles, "public, max-age=15")
    return response
  } catch (error) {
    return apiErrorResponse("vehicles route error", error, 500)
  }
}
