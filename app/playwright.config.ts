import { defineConfig } from "@playwright/test";

/**
 * Browser tests run against a local validator + a running app (see e2e/README.md).
 * They use the localnet-only test wallet, so they never touch devnet.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
