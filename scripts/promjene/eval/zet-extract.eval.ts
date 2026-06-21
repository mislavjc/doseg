/** evalite suite: benchmark models at extracting a faithful structured record from a
 * ZET notice body. Run: bunx evalite watch scripts/promjene/eval  (UI at :3006).
 * Scores each model vs a verified gold set (permanence/category/line-roles/date) and an
 * independent opus judge for title faithfulness-to-body (overclaim = the trust failure). */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { evalite, createScorer } from "evalite"
import { generateObject } from "ai"
import { z } from "zod"
import { extractNotice, loadEnvLocal, type Notice } from "../extract"

loadEnvLocal() // vitest/evalite don't auto-load .env.local — needed for AI_GATEWAY_API_KEY

const DIR = join(process.cwd(), "scripts/promjene/eval")
const bodies: Record<string, string> = JSON.parse(readFileSync(join(DIR, "bodies.json"), "utf8"))
const cands: { id: string; date: string | null }[] = JSON.parse(readFileSync(join(process.cwd(), "data/promjene/candidates.json"), "utf8")).candidates
const pub = (id: string): string | undefined => cands.find((c) => c.id === id)?.date ?? undefined
const gold: Record<string, Notice> = JSON.parse(readFileSync(join(DIR, "gold.json"), "utf8"))

// The contenders that cleared the sweep (all do structured output reliably) + a cheap
// floor (nano) to confirm the eval actually discriminates. Gold is the agent panel.
const MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-3-flash", "alibaba/qwen3-max", "openai/gpt-5.4-nano"]
const JUDGE = "anthropic/claude-opus-4.8"

type In = { id: string; body: string; published?: string }
const fold = (s: string) => s.toLowerCase().replace(/\s/g, "")

const permanence = createScorer<In, Notice, Notice>({ name: "permanence", description: "keep/drop decision matches gold", scorer: ({ output, expected }) => (output.permanence === expected.permanence ? 1 : 0) })
const category = createScorer<In, Notice, Notice>({ name: "category", scorer: ({ output, expected }) => (output.category === expected.category ? 1 : 0) })
const date = createScorer<In, Notice, Notice>({ name: "effectiveDate", scorer: ({ output, expected }) => (output.effectiveDate === expected.effectiveDate ? 1 : 0) })
const roleF1 = createScorer<In, Notice, Notice>({
  name: "line-roles-F1",
  scorer: ({ output, expected }) => {
    const A = new Set(output.lines.map((x) => fold(x.number) + ":" + x.role)), B = new Set(expected.lines.map((x) => fold(x.number) + ":" + x.role))
    let tp = 0; for (const x of A) if (B.has(x)) tp++
    const p = A.size ? tp / A.size : 1, r = B.size ? tp / B.size : 1
    return p + r ? (2 * p * r) / (p + r) : 1
  },
})
const judgeSchema = z.object({ overclaims: z.boolean().describe("true if the title asserts a change the body does NOT support"), note: z.string() })
const faithful = createScorer<In, Notice, Notice>({
  name: "title-faithful",
  description: "independent opus judge: does the title overclaim vs the source body",
  scorer: async ({ input, output }) => {
    const { object } = await generateObject({ model: JUDGE, schema: judgeSchema, prompt: `ZET obavijest:\n${input.body}\n\nNaslov: "${output.cleanTitle}"\n\nTvrdi li naslov promjenu koju tekst NE podupire? overclaims=true ako da.` })
    return { score: object.overclaims ? 0 : 1, metadata: object }
  },
})

evalite.each(MODELS.map((m) => ({ name: m, input: m })))("ZET notice extraction", {
  data: () => Object.keys(gold).map((id) => ({ input: { id, body: bodies[id], published: pub(id) }, expected: gold[id] })),
  task: async (input, model) => extractNotice(model, input.body, input.published),
  scorers: [permanence, category, roleF1, date, faithful],
})
