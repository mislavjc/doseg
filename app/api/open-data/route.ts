import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"

export async function GET() {
  try {
    const data = readFileSync(
      join(getDataDir(), "district-scores.json"),
      "utf-8"
    )
    return new Response(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="doseg-district-scores.json"',
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return Response.json({ error: "Data not available" }, { status: 404 })
  }
}
