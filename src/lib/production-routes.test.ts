import { execSync } from "node:child_process";
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

  it("never tracks local-only dev bypass files (they stay untracked like the playground)", () => {
    // git ls-files lists only tracked files, so local untracked copies pass here while
    // an accidental commit fails in CI - exactly the policy: local-only, never on origin
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    // src/middleware.ts is tracked since it sets the security headers: the marker scan
    // below keeps bypass code out of it instead
    const forbidden = [
      "src/pages/playground.astro",
      "src/lib/dev-bypass.ts",
      ".env.local",
      ".dev.vars"
    ];
    for (const file of forbidden) {
      expect(
        tracked.includes(file),
        `${file} is local-only tooling and must never be committed to origin`
      ).toBe(false);
    }
  });

  it("keeps bypass markers out of the tracked server code", () => {
    const trackedPaths = [
      "src/actions/init-session.ts",
      "src/actions/submit-answers.ts",
      "astro.config.mjs",
      "src/lib/firebase/server.ts",
      "src/middleware.ts",
      "src/lib/security-headers.ts"
    ];
    for (const rel of trackedPaths) {
      const full = path.join(repoRoot, rel);
      if (!fs.existsSync(full))
        continue;
      const content = fs.readFileSync(full, "utf-8");
      expect(
        content.includes("DEV_AUTH_BYPASS") || content.includes("isDevAuthBypass"),
        `${rel} must not contain dev-auth bypass code (local-only pattern)`
      ).toBe(false);
    }
  });
});
