// Shared by playwright.config.ts, e2e/serve.ts and the test fixtures. Ports sit
// clear of 3000 (another app), 3002 (isochrone server) and 3100 (verify-doseg's
// next dev fallback).
export const APP_PORT = 3200
export const UPSTREAM_PORT = 3202
export const BASE_URL = `http://127.0.0.1:${APP_PORT}`
export const UPSTREAM_URL = `http://127.0.0.1:${UPSTREAM_PORT}`

/** Every e2e run, server and browser, believes it is this instant: a weekday
 * morning inside the committed GTFS window (data/linije/index.json). */
export const E2E_NOW = "2026-11-24T08:00:00+01:00"
