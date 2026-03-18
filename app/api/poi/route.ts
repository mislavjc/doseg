import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
import { fetchPOIs, type POICategory } from "@/lib/overpass"

const ALL_CATEGORIES: POICategory[] = [
  "hospital",
  "school",
  "park",
  "supermarket",
  "pharmacy",
]

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const categoriesParam = searchParams.get("categories")
    const categories: POICategory[] = categoriesParam
      ? (categoriesParam.split(",").filter(Boolean) as POICategory[])
      : ALL_CATEGORIES

    const pois = await fetchPOIs(categories)

    const { response } = jsonResponse(
      pois,
      request,
      "public, max-age=86400"
    )
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 500 })
  }
}
