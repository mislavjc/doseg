import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
import { fetchPOIs } from "@/lib/overpass"
import type { POICategory } from "@/lib/overpass"

const ALL_CATEGORIES: Array<POICategory> = [
  "hospital",
  "school",
  "park",
  "supermarket",
  "pharmacy",
]

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  try {
    const categoriesParam = searchParams.get("categories")
    // Validate against the allow-list: an unknown category would otherwise build
    // a malformed Overpass query (OSM_TAGS[bogus] === undefined).
    let categories: Array<POICategory>
    if (categoriesParam) {
      const requested = new Set(categoriesParam.split(",").filter(Boolean))
      categories = ALL_CATEGORIES.filter((c) => requested.has(c))
    } else {
      categories = ALL_CATEGORIES
    }

    if (categories.length === 0) {
      const { response } = jsonResponse([], "public, max-age=86400")
      return response
    }

    const pois = await fetchPOIs(categories)

    const { response } = jsonResponse(pois, "public, max-age=86400")
    return response
  } catch (error) {
    console.error("POI fetch failed:", error)
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
