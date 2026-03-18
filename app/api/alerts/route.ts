import { jsonResponse } from "@/lib/api-response"
import { getAlerts } from "@/lib/gtfs-rt"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const alerts = getAlerts()
    const now = Math.floor(Date.now() / 1000)

    const active = alerts.filter((a) => {
      if (a.activePeriods.length === 0) return true
      return a.activePeriods.some((p) => {
        const afterStart = p.start == null || p.start <= now
        const beforeEnd = p.end == null || p.end >= now
        return afterStart && beforeEnd
      })
    })

    const { response } = jsonResponse(
      active,
      req,
      "public, max-age=60"
    )
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
