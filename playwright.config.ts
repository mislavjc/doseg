import { defineConfig, devices } from "@playwright/test"

import { BASE_URL } from "./e2e/env"

const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate:
    "e2e/__screenshots__/{testFileName}/{arg}-{projectName}{ext}",
  fullyParallel: true,
  forbidOnly: CI,
  // No retries: a flaky test should fail loudly, not pass on its second try.
  retries: 0,
  workers: CI ? 4 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/setup.ts",
  globalTeardown: "./e2e/teardown.ts",
  use: {
    baseURL: BASE_URL,
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "mobile.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      testMatch: ["visual.spec.ts", "mobile.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "bun e2e/serve.ts",
    url: `${BASE_URL}/robots.txt`,
    timeout: 240_000,
    // Reuse a running server only when asked to skip the build, so a normal run
    // never tests a stale build or a server started in the other fixture mode.
    reuseExistingServer: !CI && process.env.E2E_SKIP_BUILD === "1",
    stdout: "pipe",
  },
})
