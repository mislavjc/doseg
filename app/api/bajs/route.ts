import { buildBajsFeatureCollection, getBajsData } from "@/lib/bajs"

export async function GET() {
  try {
    const data = await getBajsData()

    return Response.json(
      {
        ...buildBajsFeatureCollection(data.stations),
        updatedAt: data.updatedAt,
        ttl: data.ttlSeconds,
      },
      {
        headers: {
          "Cache-Control": `private, max-age=${data.ttlSeconds}`,
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
