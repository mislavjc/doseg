// Loaded into the Next build and server processes with `node --import` during
// e2e runs (see e2e/serve.ts). Two jobs, both so a run never depends on the
// outside world:
// 1. Every server-side fetch to a non-loopback host is sent to the fixture
//    server instead, which replays a recorded response (or records one).
// 2. Date is frozen at E2E_NOW, so "today", the GTFS service day and every
//    printed clock match the recorded fixtures and the screenshots. Timers are
//    untouched; only wall-clock reads stop.

const upstream = process.env.E2E_UPSTREAM
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"])

if (upstream) {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (loopback.has(url.hostname)) {
      return realFetch(request)
    }
    const hasBody = request.method !== "GET" && request.method !== "HEAD"
    return realFetch(
      `${upstream}/__upstream?url=${encodeURIComponent(url.href)}`,
      {
        method: request.method,
        headers: request.headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
        signal: request.signal,
      }
    )
  }
}

const fakeNow = process.env.E2E_NOW
if (fakeNow) {
  const RealDate = Date
  const frozen = RealDate.parse(fakeNow)
  class FrozenDate extends RealDate {
    constructor(
      ...args:
        | []
        | [number | string | Date]
        | [number, number, number?, number?, number?, number?, number?]
    ) {
      if (args.length === 0) {
        super(frozen)
      } else if (args.length === 1) {
        super(args[0])
      } else {
        super(...args)
      }
    }

    static override now() {
      return frozen
    }

    // Own statics, not inherited ones: Next wraps Date during prerendering by
    // copying the constructor's own properties.
    static override UTC = RealDate.UTC
    static override parse = RealDate.parse
  }
  Object.defineProperty(globalThis, "Date", { value: FrozenDate })
}
