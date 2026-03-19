/**
 * Serialize `data` to JSON and return a `Response` with cache headers.
 * Compression is handled by the reverse proxy (Caddy) — doing it here
 * wastes CPU on the single-core app container.
 */
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
