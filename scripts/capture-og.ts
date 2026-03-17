/**
 * Capture OG social image: tilted product shot of the live app
 * with isochrone + sample route from Jelačić square.
 *
 * Usage: bun run capture:og   (dev server must be running)
 */
import { chromium } from "playwright"

const URL = "http://doseg.localhost:1355/?lat=45.8131&lon=15.9775"
const OUTPUT = "public/og.png"
const W = 1200
const H = 630

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=metal",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  })

  // ── Step 1: capture the live map with a route ──
  const map = await browser.newPage({ viewport: { width: W, height: H } })

  // Skip onboarding dialog
  await map.goto("http://doseg.localhost:1355", { waitUntil: "domcontentloaded" })
  await map.evaluate(() => localStorage.setItem("doseg-onboarded", "1"))

  console.log("1/4  Loading map...")
  await map.goto(URL, { waitUntil: "domcontentloaded" })
  await map.waitForSelector("canvas.maplibregl-canvas", { timeout: 30_000 })
  await map.waitForSelector(".loading-bar", { timeout: 15_000 })
  await map.waitForFunction(() => !document.querySelector(".loading-bar"), {
    timeout: 60_000,
  })
  await map.waitForTimeout(2500)

  console.log("2/4  Triggering sample route...")
  await map.mouse.move(800, 420)
  await map
    .waitForSelector("div.panel [role='list']", { timeout: 5_000 })
    .catch(() => {})
  await map.waitForTimeout(800)

  // Hide dev-overlay & about link only
  await map.evaluate(() => {
    for (const el of document.querySelectorAll(
      "nextjs-portal, a[href='/o-projektu']",
    )) {
      ;(el as HTMLElement).style.display = "none"
    }
  })

  const raw = await map.screenshot({ type: "png" })
  console.log("3/4  Composing final image...")

  // ── Step 2: compose tilted product shot ──
  const comp = await browser.newPage({ viewport: { width: W, height: H } })
  const b64 = raw.toString("base64")

  await comp.setContent(`<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
<style>* { margin:0; padding:0; box-sizing:border-box; }</style>
</head>
<body style="
  width:${W}px; height:${H}px;
  background:#08080f;
  overflow:hidden;
  perspective:2200px;
  display:flex; align-items:center; justify-content:center;
  font-family:Inter,-apple-system,sans-serif;
">
  <!-- subtle color glow behind card -->
  <div style="
    position:fixed; z-index:0;
    width:700px; height:450px; left:250px; top:90px;
    background:radial-gradient(ellipse, rgba(22,163,106,0.13) 0%, rgba(8,145,178,0.05) 40%, transparent 75%);
    filter:blur(50px);
  "></div>

  <!-- tilted map screenshot -->
  <img
    src="data:image/png;base64,${b64}"
    width="${W}" height="${H}"
    style="
      position:relative; z-index:1;
      transform: rotateY(-4.5deg) rotateX(2.5deg) scale(0.84);
      border-radius:14px;
      box-shadow:
        0 40px 100px rgba(0,0,0,0.55),
        0 0 0 1px rgba(255,255,255,0.07);
    "
  />

  <!-- branding — bottom right -->
  <div style="
    position:fixed; z-index:2;
    bottom:28px; right:40px;
    text-align:right;
  ">
    <div style="
      font-size:44px; font-weight:700; color:white;
      letter-spacing:-1.5px; line-height:1;
      text-shadow:0 2px 16px rgba(0,0,0,0.4);
    ">Doseg</div>
    <div style="
      font-size:13px; color:rgba(148,163,184,0.65);
      margin-top:6px; line-height:1.4;
    ">Karta dosega javnog prijevoza u Zagrebu</div>
    <div style="
      width:100px; height:2.5px; border-radius:2px;
      margin-top:10px; margin-left:auto;
      background:linear-gradient(to right,#16a34a,#0891b2,#2563eb,#9333ea);
    "></div>
  </div>
</body></html>`)

  await comp
    .waitForFunction(() => document.fonts.ready.then(() => true), {
      timeout: 5_000,
    })
    .catch(() => {})
  await comp.waitForTimeout(600)

  await comp.screenshot({ path: OUTPUT, type: "png" })
  console.log("4/4  Saved", OUTPUT)
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
