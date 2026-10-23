import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const pagesDir = path.join(repoRoot, "src/pages");

describe("production routes integrity", () => {
  const allowedProductionPages = new Set([
    "before-start.astro",
    "faq.astro",
    "index.astro",
    "survey.astro",
    "thanks.astro"
  ]);

  it("ensures no unauthorized dev pages are tracked in src/pages/", () => {
    // Only check files tracked or visible to git in src/pages
    const files = fs.readdirSync(pagesDir).filter(f => f.endsWith(".astro") && f !== "playground.astro");
    for (const file of files) {
      expect(
        allowedProductionPages.has(file),
        `Unexpected page found in src/pages/: ${file}. Dev test pages must not be added to production routes.`
      ).toBe(true);
    }
  });

  it("ensures thanks.astro has strict session protection without dev bypasses", () => {
    const thanksPath = path.join(pagesDir, "thanks.astro");
    const content = fs.readFileSync(thanksPath, "utf-8");

    // Must check getSessionUserId
    expect(content).toContain("getSessionUserId(Astro.cookies)");

    // Must NOT contain dev bypasses in session check
    expect(content).not.toContain("!import.meta.env.DEV && !(await getSessionUserId");
    expect(content).not.toContain("import.meta.env.DEV &&");
  });

  it("ensures survey.astro has strict session protection without dev bypasses", () => {
    const surveyPath = path.join(pagesDir, "survey.astro");
    const content = fs.readFileSync(surveyPath, "utf-8");

    // Must check getSessionUserId
    expect(content).toContain("getSessionUserId(Astro.cookies)");

    // Must NOT contain dev bypasses in session check
    expect(content).not.toContain("!import.meta.env.DEV");
  });
});
