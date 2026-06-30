const OTP_URL = process.env.OTP_URL || "http://localhost:8080"

/**
 * Readiness probe. The deploy pipeline polls this for two minutes and rolls
 * back if it never goes green (.github/workflows/deploy.yml), so a blind 200
 * would let a deploy that cannot reach OTP pass. We confirm OTP is reachable
 * and has a feed loaded, with a timeout under the 5s healthcheck window
 * (docker-compose.yml). Compose only reports (never restarts) on unhealthy, so
 * coupling liveness to OTP here cannot cause a restart loop.
 */
export async function GET() {
  try {
    const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ feeds { feedId } }" }),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) throw new Error(`OTP responded ${res.status}`)
    const json = (await res.json()) as { data?: { feeds?: unknown[] } }
    if (!json.data?.feeds?.length) throw new Error("OTP has no feed loaded")
    return Response.json({ status: "ok" })
  } catch (err) {
    // Log the detail server-side; keep the public body generic.
    console.error("health check failed:", err)
    return Response.json({ status: "degraded" }, { status: 503 })
  }
}
