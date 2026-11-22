import { findPixels, settle } from "./helpers"
import { expect, test } from "./test"

/** The reach ramp is pure blue over a grey basemap: blue well above red. */
const isReachBlue = ([r, g, b]: [number, number, number]) => b - r > 40 && b > g

test("/karta: a map click paints an isochrone and fills the reach panel", async ({
  page,
  problems,
}) => {
  await page.goto("/karta?t=08:00")
  const map = page.getByRole("region", {
    name: "Interaktivna karta dosega javnog prijevoza",
  })
  await expect(map.locator("canvas")).toBeVisible()
  await settle(page)
  const before = await findPixels(map, isReachBlue)

  const box = await map.boundingBox()
  if (!box) {
    throw new Error("map has no box")
  }
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)

  const panel = page.locator("aside")
  await expect(panel.getByText(/\d+ km² dohvatljivo/u)).toBeVisible()
  await expect(
    panel.getByText(/\d+% površine grada · \d+ od 17 kvartova/u)
  ).toBeVisible()
  await expect(panel.getByText("tvoj kvart na ljestvici")).toBeVisible()
  await expect(page).toHaveURL(/lat=45\.\d+&lon=15\.\d+/u)

  // MapLibre paints a frame after the panel text lands. The bands are
  // translucent, so count the blue they add over the basemap.
  await expect
    .poll(async () => (await findPixels(map, isReachBlue)).length)
    .toBeGreaterThan(before.length + 3000)
  expect(problems).toEqual([])
})

test("/karta: the minutes toggle refetches a smaller reach", async ({
  page,
  problems,
}) => {
  await page.goto("/karta?lat=45.81310&lon=15.97750&t=08:00&m=30")
  const reach = page.locator("aside").getByText(/\d+ km² dohvatljivo/u)
  const km2 = async () => Number.parseInt(await reach.innerText(), 10)
  await expect(reach).toBeVisible()
  const at30 = await km2()
  await page
    .locator("aside")
    .getByRole("button", { name: "15", exact: true })
    .click()
  await expect.poll(km2).toBeLessThan(at30)
  expect(problems).toEqual([])
})

/** BAJS station pins: the saturated blue of a filled pin head. */
const isPinHead = ([r, g, b]: [number, number, number]) =>
  r < 40 && g > 50 && g < 110 && b > 170

test("/bajs: clicking a station opens its popup", async ({
  page,
  problems,
}) => {
  await page.goto("/bajs")
  const map = page.getByLabel("Karta Bajs stanica u Zagrebu")
  await expect(map.locator("canvas")).toBeVisible()
  await settle(page)
  const pins = await findPixels(map, isPinHead)
  expect(pins.length).toBeGreaterThan(100)
  // A pin pixel whose 3px neighbourhood is also pin: the middle of a head.
  const pinSet = new Set(pins.map((p) => `${p.x},${p.y}`))
  const head = pins.find((p) =>
    [-3, 0, 3].every((dx) =>
      [-3, 0, 3].every((dy) => pinSet.has(`${p.x + dx},${p.y + dy}`))
    )
  )
  if (!head) {
    throw new Error("no station pin found on the bajs map")
  }
  await map.click({ position: head })
  const popup = page.locator(".bajs-hero-popup")
  await expect(popup).toBeVisible()
  await expect(popup).toContainText(
    /\d+ bajs(a)? · \d+ (slobodno mjesto|slobodna mjesta|slobodnih mjesta)/u
  )
  expect(problems).toEqual([])
})

test("/karta-tramvaja: legend highlights a line and zoom scales the diagram", async ({
  page,
  problems,
}) => {
  await page.goto("/karta-tramvaja")
  const line6 = page.getByRole("button", { name: "6 Črnomerec – Sopot" })
  const line2 = page.getByRole("button", { name: "2 Črnomerec – Savišće" })
  await line6.click()
  await expect(line6).toHaveCSS("opacity", "1")
  await expect(line2).toHaveCSS("opacity", "0.35")
  await line6.click()
  await expect(line2).toHaveCSS("opacity", "1")

  const diagram = page.getByRole("main").getByRole("img").first()
  const width = async () => (await diagram.boundingBox())?.width ?? 0
  const before = await width()
  await page.getByRole("button", { name: "Zoom in" }).click()
  await expect.poll(width).toBeGreaterThan(before)
  await page.getByRole("button", { name: "Zoom out" }).click()
  await expect.poll(width).toBeCloseTo(before, 0)
  expect(problems).toEqual([])
})
