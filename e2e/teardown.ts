import { UPSTREAM_URL } from "./env"

/** Fail the run if anything asked the fixture upstream for a response it has
 * not recorded: the suite is only hermetic while this list stays empty. */
export default async function teardown() {
  const res = await fetch(`${UPSTREAM_URL}/__misses`)
  const misses: unknown = await res.json()
  if (Array.isArray(misses) && misses.length > 0) {
    throw new Error(
      `Unrecorded upstream requests (re-record with \`bun run e2e:record\`):\n${misses.join("\n")}`
    )
  }
}
