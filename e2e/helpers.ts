import type { Locator, Page } from "@playwright/test"
import sharp from "sharp"

/** Let a page finish everything it does after load: deferred fetches, lazy
 * sections that mount on scroll, web fonts and images. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      // oxlint-disable-next-line no-await-in-loop -- each step must paint before the next
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    }
    window.scrollTo(0, 0)
    await document.fonts.ready
  })
  await page.waitForLoadState("networkidle")
  await page.waitForFunction(() =>
    [...document.images].every((img) => img.complete)
  )
}

type Rgb = [number, number, number]

/** Pixel coordinates (in css px of the element) where `match` holds. */
export async function findPixels(
  target: Locator,
  match: (rgb: Rgb) => boolean
): Promise<Array<{ x: number; y: number }>> {
  const png = await target.screenshot({ scale: "css", animations: "disabled" })
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const hits: Array<{ x: number; y: number }> = []
  for (let i = 0; i < data.length; i += 3) {
    if (match([data[i], data[i + 1], data[i + 2]])) {
      const pixel = i / 3
      hits.push({ x: pixel % info.width, y: Math.floor(pixel / info.width) })
    }
  }
  return hits
}
