import { UPSTREAM_URL } from "./env"

/** A reused local server keeps its miss log between runs; start each run clean. */
export default async function setup() {
  await fetch(`${UPSTREAM_URL}/__misses`, { method: "DELETE" })
}
