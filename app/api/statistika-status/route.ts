import { existsSync, readFileSync } from "fs"
import { join } from "path"

export const dynamic = "force-dynamic"

export async function GET() {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data")
  const scorePath = join(dataDir, "district-scores.json")
  const geoPath = join(dataDir, "districts.geojson")

  const scoreExists = existsSync(scorePath)
  let scoreError: string | null = null
  if (scoreExists) {
    try {
      JSON.parse(readFileSync(scorePath, "utf-8"))
    } catch (e) {
      scoreError = e instanceof Error ? e.message : String(e)
    }
  }

  return Response.json({
    dataDir,
    cwd: process.cwd(),
    scorePath,
    scoreExists,
    scoreError,
    geoExists: existsSync(geoPath),
  })
}
