import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib"

const BROTLI_QUALITY = 6

/**
 * Serialize `data` to JSON, compress with Brotli/gzip when the client
 * supports it, and return a `Response` with the correct headers.
 *
 * Returns the Response together with `serializeMs` so callers that
 * care about timing (e.g. the isochrone endpoint) can include it in
 * Server-Timing without duplicating the compression logic.
 */
export function jsonResponse(
  data: unknown,
  request: { headers: { get(name: string): string | null } },
  cacheControl: string
): { response: Response; serializeMs: number } {
  const t0 = performance.now()
  const json = JSON.stringify(data)

  const acceptEncoding = request.headers.get("accept-encoding") || ""
  const prefersBrotli = acceptEncoding.includes("br")
  const acceptsGzip = acceptEncoding.includes("gzip")

  const body = prefersBrotli
    ? brotliCompressSync(json, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
        },
      })
    : acceptsGzip
      ? gzipSync(json)
      : json

  return {
    response: new Response(body, {
      headers: {
        "Content-Type": "application/json",
        ...(prefersBrotli
          ? { "Content-Encoding": "br" }
          : acceptsGzip
            ? { "Content-Encoding": "gzip" }
            : {}),
        "Cache-Control": cacheControl,
      },
    }),
    serializeMs: performance.now() - t0,
  }
}
