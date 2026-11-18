import { apiErrorResponse, jsonResponse } from "@/lib/api-response"
import { getVehiclePositions } from "@/lib/gtfs-rt"

export const dynamic = "force-dynamic"

export function GET() {
  try {
    const vehicles = getVehiclePositions()

    const { response } = jsonResponse(vehicles, "public, max-age=15")
    return response
  } catch (err) {
    return apiErrorResponse("vehicles route error", err, 500)
  }
}
