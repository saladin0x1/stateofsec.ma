import { existsSync } from "node:fs";
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

// Browser tests that walk the real survey UI. They drive the dev-only playground page
// (src/pages/playground.astro), which is gitignored and never committed: copy it in
// before running. See tests/e2e/README.md.

const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;

if (!existsSync(new URL("./src/pages/playground.astro", import.meta.url))) {
  throw new Error(
    "tests/e2e needs the local-only src/pages/playground.astro (gitignored). "
    + "Copy it in from a maintainer's checkout before running pnpm test:e2e."
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  // *.e2e.ts, so Vitest (which picks up *.test.ts and *.spec.ts) never runs these
  testMatch: "**/*.e2e.ts",
  outputDir: "tests/e2e/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002
    }
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      // channel "chromium" runs the full Chromium build in headless mode, so only the
      // chromium-<rev> browser is needed (not the separate headless shell)
      use: { ...devices["Desktop Chrome"], channel: "chromium" }
    }
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe"
  }
});
