/**
 * Serialize `data` to JSON and return a `Response` with cache headers.
 * Compression is handled by the reverse proxy (Caddy); doing it here
 * wastes CPU on the single-core app container.
 */
/**
 * Log the real error server-side and return a generic JSON error body -
 * internal messages (upstream URLs, timeouts, library details) must never
 * reach clients.
 */
export function apiErrorResponse(context: string, err: unknown, status: number): Response {
  console.error(`${context}:`, err)
  return Response.json({ error: "Upstream service unavailable" }, { status })
}

export function jsonResponse(
  data: unknown,
  _request: { headers: { get(name: string): string | null } },
  cacheControl: string
): { response: Response; serializeMs: number } {
  const t0 = performance.now()
  const json = JSON.stringify(data)

  return {
    response: new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
      },
    }),
    serializeMs: performance.now() - t0,
  }
}
