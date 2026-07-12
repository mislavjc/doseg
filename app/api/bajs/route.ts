import type { NextRequest } from "next/server"

import { apiErrorResponse, jsonResponse } from "@/lib/api-response"
import { buildBajsFeatureCollection, getBajsData } from "@/lib/bajs"

export async function GET(request: NextRequest) {
  try {
    const data = await getBajsData()

    const { response } = jsonResponse(
      {
        ...buildBajsFeatureCollection(data.stations),
        updatedAt: data.updatedAt,
        ttl: data.ttlSeconds,
      },
      request,
      `private, max-age=${data.ttlSeconds}`
    )
    return response
  } catch (err) {
    return apiErrorResponse("bajs route error", err, 502)
  }
}
