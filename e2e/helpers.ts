import type { Locator, Page, Request } from "@playwright/test"
import sharp from "sharp"

/** Resolves once the DOM has gone 500ms without a mutation (10s cap). */
function domQuiet() {
  return new Promise<void>((resolve) => {
    let timer = setTimeout(done, 500)
    const cap = setTimeout(done, 10_000)
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(done, 500)
    })
    function done() {
      clearTimeout(cap)
      observer.disconnect()
      resolve()
    }
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    })
  })
}

/** Let a page finish everything it does after load: deferred fetches, lazy
 * sections that mount on the way down and unmount on the way back up (code
 * split chunks included), web fonts and images. Ends when the network is idle
 * and the DOM has been still for half a second, in that order, at the top. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
  const inflight = new Set<Request>()
  const track = (request: Request) => inflight.add(request)
  const untrack = (request: Request) => inflight.delete(request)
  page.on("request", track)
  page.on("requestfinished", untrack)
  page.on("requestfailed", untrack)
  await page.evaluate(async () => {
    // A viewport per step and two frames per stop: an IntersectionObserver
    // only sees positions that survive into a rendered frame, and a loaded
    // runner drops frames. Missing one leaves a MountWhenNear unmounted.
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      // oxlint-disable-next-line no-await-in-loop -- each stop must render before the next
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })
    }
    window.scrollTo(0, 0)
    await document.fonts.ready
  })
  // Bounded: a page that polls forever still gets captured, just later.
  const deadline = Date.now() + 20_000
  do {
    // oxlint-disable-next-line no-await-in-loop -- poll until both are quiet
    await page.evaluate(domQuiet)
  } while (inflight.size > 0 && Date.now() < deadline)
  page.off("request", track)
  page.off("requestfinished", untrack)
  page.off("requestfailed", untrack)
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
