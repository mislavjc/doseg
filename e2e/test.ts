import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test as base } from "@playwright/test"
import type { Page } from "@playwright/test"

import { BASE_URL, E2E_NOW, UPSTREAM_URL } from "./env"

// next start sends no CSP; Caddy adds it in production. Read it from the
// Caddyfile so the browser enforces exactly what prod enforces.
function readCsp(): string {
  const caddyfile = readFileSync(
    join(import.meta.dirname, "..", "Caddyfile"),
    "utf8"
  )
  const csp = /Content-Security-Policy "([^"]+)"/u.exec(caddyfile)?.[1]
  if (!csp) {
    throw new Error("No Content-Security-Policy header found in the Caddyfile")
  }
  return csp
}
const CSP = readCsp()

const appOrigin = new URL(BASE_URL).origin

/** Third parties that must never be recorded or reached: analytics. */
const SILENCED = new Set(["plausible.io"])

async function routeThroughFixtures(page: Page) {
  await page.context().route(
    (url) => url.origin !== appOrigin,
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (SILENCED.has(url.hostname)) {
        await route.fulfill({ status: 202, body: "" })
        return
      }
      const post = request.postDataBuffer()
      const res = await fetch(
        `${UPSTREAM_URL}/__upstream?url=${encodeURIComponent(url.href)}`,
        {
          method: request.method(),
          body: post ? new Uint8Array(post) : undefined,
        }
      )
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      })
    }
  )
  await page.route(
    (url) => url.origin === appOrigin,
    async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.fallback()
        return
      }
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": CSP },
      })
    }
  )
}

/** Console errors, uncaught page errors and CSP violations seen by a page. */
export type PageProblems = Array<string>

export const test = base.extend<{ problems: PageProblems }>({
  // Auto: every test is hermetic and clock-pinned, whether it reads problems or not.
  problems: [
    async ({ page }, use) => {
      const problems: PageProblems = []
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          problems.push(`console: ${msg.text()}`)
        }
      })
      page.on("pageerror", (error) => {
        problems.push(`pageerror: ${error.message}`)
      })
      // Chrome logs most violations itself; this also catches report-only ones
      // and names the directive. Both land in the console listener above.
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(
            `CSP violation: ${event.effectiveDirective} blocked ${event.blockedURI}`
          )
        })
      })
      await page.clock.setFixedTime(new Date(E2E_NOW))
      await routeThroughFixtures(page)
      await use(problems)
    },
    { auto: true },
  ],
})

export { expect }
