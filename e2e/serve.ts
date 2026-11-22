// Playwright's webServer: start the fixture upstream, build the app against it
// (unless E2E_SKIP_BUILD=1), then serve it with `next start`.
import { spawn } from "node:child_process"
import { rmSync } from "node:fs"
import { join } from "node:path"

import { APP_PORT, E2E_NOW, UPSTREAM_PORT, UPSTREAM_URL } from "./env"
import { startUpstream } from "./upstream/server"

const root = join(import.meta.dirname, "..")
const next = join(root, "node_modules", ".bin", "next")

const appEnv = {
  ...process.env,
  ISOCHRONE_URL: `${UPSTREAM_URL}/isochrone`,
  OTP_URL: `${UPSTREAM_URL}/otp`,
  E2E_UPSTREAM: UPSTREAM_URL,
  E2E_NOW,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `--import ${join(import.meta.dirname, "upstream", "preload.ts")}`,
}

function run(
  command: string,
  args: Array<string>,
  env: NodeJS.ProcessEnv = appEnv
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" })
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    )
  })
}

// Next's fetch data cache outlives builds and servers. A cached answer would
// skip the fixture server (so a recording run would miss it), and a stale one
// would make a run depend on the last.
rmSync(join(root, ".next", "cache", "fetch-cache"), {
  recursive: true,
  force: true,
})
startUpstream(UPSTREAM_PORT)
if (process.env.E2E_SKIP_BUILD !== "1") {
  await run("bun", ["scripts/build-district-map-svg.ts"], process.env)
  await run(next, ["build"])
}
await run(next, ["start", "-H", "127.0.0.1", "-p", String(APP_PORT)])
