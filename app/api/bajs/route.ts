import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
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
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
