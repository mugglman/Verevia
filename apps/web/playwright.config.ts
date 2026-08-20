import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Serial, not parallel: multiple concurrent browser contexts hitting a
  // single `next start` instance intermittently triggered a Next.js
  // streaming-SSR error ("The destination stream closed early") under the
  // added latency of the SSH-tunneled dev database — reproducible with 3
  // workers, gone with 1, and each test passes reliably in isolation. Not
  // an application bug (see docs/PHASE_4_TEAM_MEMBERSHIP_REPORT.md); the
  // test suite is small enough that serial execution costs little.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    storageState: "./e2e/.auth/state.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: process.env.APP_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
