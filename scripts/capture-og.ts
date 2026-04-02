/**
 * Capture static OG image from the /api/og route.
 *
 * Usage: bun run capture:og   (dev server must be running)
 */

const BASE = process.env.BASE_URL || "https://doseg.localhost"
const OUTPUT = "public/og.jpg"

async function main() {
  console.log("Fetching OG image from", `${BASE}/api/og`)
  const res = await fetch(`${BASE}/api/og`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

  const sharp = require("sharp")
  const buf = Buffer.from(await res.arrayBuffer())
  await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toFile(OUTPUT)

  console.log("Saved", OUTPUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
