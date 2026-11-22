// Fixture upstream for e2e runs. It stands in for every service the app talks
// to that is not the Next server itself:
//   /isochrone/*  the Rust isochrone + RT service (ISOCHRONE_URL)
//   /otp/*        OpenTripPlanner (OTP_URL)
//   /__upstream?url=...  any third-party host, from the Next server (via
//                 e2e/upstream/preload.ts) or from the browser (via page routes)
//
// Replay (default): answer from e2e/fixtures/upstream/, and log anything
// unrecorded as a miss, which fails the run in global teardown.
// Record (E2E_RECORD=1): forward to the real upstream and save the response.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "upstream")
const RECORD = process.env.E2E_RECORD === "1"
const ISOCHRONE_UPSTREAM =
  process.env.E2E_ISOCHRONE_UPSTREAM ?? "https://doseg.hr"
const OTP_UPSTREAM = process.env.E2E_OTP_UPSTREAM ?? "http://localhost:8080"

/** Hosts that always answer 503, in both modes. A successful Overpass answer
 * makes lib/overpass.ts rewrite data/poi-snapshot.json, and the committed
 * snapshot it falls back to is deterministic anyway. */
const UNAVAILABLE = new Set(["overpass-api.de", "overpass.kumi.systems"])

type Recorded = { key: string; status: number; contentType: string | null }

const misses = new Set<string>()
/** Keys recorded in this run: a request seen twice replays the first answer,
 * so every page in one recording run sees the same data. */
const recorded = new Set<string>()

function resolveTarget(path: string): string | null {
  const url = new URL(path, "http://fixture")
  if (url.pathname === "/__upstream") {
    return url.searchParams.get("url")
  }
  if (url.pathname.startsWith("/isochrone/")) {
    return ISOCHRONE_UPSTREAM + path.slice("/isochrone".length)
  }
  if (url.pathname.startsWith("/otp/")) {
    return OTP_UPSTREAM + path.slice("/otp".length)
  }
  return null
}

function fixturePaths(key: string, target: string) {
  const host = new URL(target).host.replaceAll(":", "_")
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 20)
  const base = join(FIXTURE_DIR, host, hash)
  return {
    dir: join(FIXTURE_DIR, host),
    meta: `${base}.json`,
    body: `${base}.body`,
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Array<Buffer> = []
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks)
}

function requestKey(method: string, target: string, body: Buffer): string {
  const bodyHash =
    body.length > 0
      ? ` ${createHash("sha256").update(body).digest("hex").slice(0, 20)}`
      : ""
  return `${method} ${target}${bodyHash}`
}

function requestHeaders(contentType: string | undefined) {
  const headers = new Headers({
    "user-agent": "Doseg/1.0 e2e fixture recorder (https://doseg.hr)",
  })
  if (contentType) {
    headers.set("content-type", contentType)
  }
  return headers
}

async function record(
  req: { method: string; target: string; body: Buffer; contentType?: string },
  paths: ReturnType<typeof fixturePaths>,
  key: string
) {
  let status = 503
  let contentType: string | null = "text/plain"
  let payload: Buffer
  try {
    const res = await fetch(req.target, {
      method: req.method,
      body: req.body.length > 0 ? new Uint8Array(req.body) : undefined,
      headers: requestHeaders(req.contentType),
      signal: AbortSignal.timeout(30_000),
    })
    status = res.status
    contentType = res.headers.get("content-type")
    payload = Buffer.from(await res.arrayBuffer())
  } catch (error) {
    payload = Buffer.from(String(error))
  }
  mkdirSync(paths.dir, { recursive: true })
  const meta: Recorded = { key, status, contentType }
  writeFileSync(paths.meta, `${JSON.stringify(meta, null, 2)}\n`)
  writeFileSync(paths.body, payload)
  return { meta, payload }
}

/** MapLibre's tile set depends on frame timing while the camera moves, so a
 * run can ask for a tile no recording run did. An empty tile just paints no
 * basemap there; no test reads the basemap. */
function isBasemapTile(target: string) {
  const url = new URL(target)
  return url.hostname.endsWith("cartocdn.com") && url.pathname.endsWith(".mvt")
}

function isRecorded(value: unknown): value is Recorded {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "number"
  )
}

function replay(paths: ReturnType<typeof fixturePaths>) {
  try {
    const meta: unknown = JSON.parse(readFileSync(paths.meta, "utf8"))
    return isRecorded(meta) ? { meta, payload: readFileSync(paths.body) } : null
  } catch {
    return null
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = req.url ?? "/"
  if (path === "/__misses") {
    if (req.method === "DELETE") {
      misses.clear()
    }
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify([...misses]))
    return
  }
  const target = resolveTarget(path)
  if (!target) {
    res.writeHead(404).end()
    return
  }
  res.setHeader("access-control-allow-origin", "*")
  if (UNAVAILABLE.has(new URL(target).hostname)) {
    res.writeHead(503).end()
    return
  }
  const method = req.method ?? "GET"
  const body = await readBody(req)
  const key = requestKey(method, target, body)
  const paths = fixturePaths(key, target)
  const hit =
    RECORD && !recorded.has(key)
      ? await record(
          { method, target, body, contentType: req.headers["content-type"] },
          paths,
          key
        )
      : replay(paths)
  if (RECORD) {
    recorded.add(key)
  }
  if (!hit && isBasemapTile(target)) {
    res.writeHead(200, { "content-type": "application/x-protobuf" }).end()
    return
  }
  if (!hit) {
    misses.add(key)
    res.writeHead(504, { "content-type": "text/plain" })
    res.end(`no e2e fixture for ${key}`)
    return
  }
  if (hit.meta.contentType) {
    res.setHeader("content-type", hit.meta.contentType)
  }
  res.writeHead(hit.meta.status).end(hit.payload)
}

export function startUpstream(port: number) {
  const server = createServer((req, res) => {
    void handle(req, res)
  })
  server.listen(port, "127.0.0.1")
  return server
}
