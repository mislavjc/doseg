import { expect, test } from "./test"

// One or more pages per route family. Line pages cover a tram, a day bus and a
// night bus; stop and kvart pages a central and an outlying example.
const PAGES = [
  "/",
  "/karta",
  "/karta?lat=45.81310&lon=15.97750&t=08:00&m=30",
  "/statistika",
  "/statistika/podaci",
  "/linije",
  "/linije/1",
  "/linije/6",
  "/linije/109",
  "/linije/31",
  "/stanice",
  "/stanice/trg-bana-j-jelacica",
  "/stanice/jalsevec",
  "/kvartovi",
  "/kvartovi/donji-grad",
  "/kvartovi/trnje",
  "/promjene",
  "/bajs",
  "/karta-tramvaja",
  "/o-projektu",
]

const IMAGES = [
  "/api/og?naslovnica",
  "/api/og?linija=1",
  "/api/og?stanica=jalsevec",
  "/api/og?lat=45.81310&lon=15.97750",
  "/statistika/opengraph-image.jpg",
]

for (const path of PAGES) {
  test(`${path} loads cleanly`, async ({ page, problems }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.locator("main, h1").first()).toBeVisible()
    // Hydration, deferred fetches and map boot all log their failures late.
    await page.waitForLoadState("networkidle")
    expect(problems).toEqual([])
  })
}

for (const path of IMAGES) {
  test(`${path} renders an image`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toMatch(/^image\//u)
    expect((await response.body()).length).toBeGreaterThan(10_000)
  })
}

test("/?lat= redirects to /karta", async ({ request }) => {
  const response = await request.get("/?lat=45.8131&lon=15.9775", {
    maxRedirects: 0,
  })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toMatch(/^\/karta\?lat=45\.8131/u)
})
