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
    // Validate against the allow-list: an unknown category would otherwise build
    // a malformed Overpass query (OSM_TAGS[bogus] === undefined).
    let categories: POICategory[]
    if (categoriesParam) {
      const requested = new Set(categoriesParam.split(",").filter(Boolean))
      categories = ALL_CATEGORIES.filter((c) => requested.has(c))
    } else {
      categories = ALL_CATEGORIES
    }

    if (categories.length === 0) {
      const { response } = jsonResponse([], request, "public, max-age=86400")
      return response
    }

    const pois = await fetchPOIs(categories)

    const { response } = jsonResponse(pois, request, "public, max-age=86400")
    return response
  } catch (err) {
    console.error("POI fetch failed:", err)
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
