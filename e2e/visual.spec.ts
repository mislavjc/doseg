import { settle } from "./helpers"
import { expect, test } from "./test"

// Editorial pages and a sample of line pages (tram, day bus, night bus), full
// page, at desktop and Pixel 7 widths. Update the baselines with
// `bun run e2e:update` after an intended visual change.
const PAGES = {
  naslovnica: "/",
  statistika: "/statistika",
  podaci: "/statistika/podaci",
  promjene: "/promjene",
  "o-projektu": "/o-projektu",
  "linija-1": "/linije/1",
  "linija-109": "/linije/109",
  "linija-31": "/linije/31",
}

// settle() scrolls the whole page and waits for quiet; /statistika/podaci is
// 33,000px tall and a busy CI runner needs well over the default 30s.
test.describe.configure({ timeout: 90_000 })

for (const [name, path] of Object.entries(PAGES)) {
  test(`${path} looks unchanged`, async ({ page }) => {
    await page.goto(path)
    await settle(page)
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      // A full-page capture of /statistika/podaci takes a few seconds alone.
      timeout: 20_000,
      mask: [
        // Anything printing the wall clock.
        page.locator("time"),
        // MapLibre fades labels and tiles in on its own clock, which CSS
        // animation freezing cannot reach. Maps are covered by behaviour tests.
        page.locator(".maplibregl-map"),
        // Scrollspy navs: which section is marked depends on scroll history.
        page.getByRole("navigation", { name: "Sekcije izvještaja" }),
        page.getByRole("navigation", { name: "Odjeljci izvještaja" }),
      ],
    })
  })
}
