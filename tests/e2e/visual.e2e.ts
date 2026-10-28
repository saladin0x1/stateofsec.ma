import type { Page } from "@playwright/test";
import type { Persona } from "./support/walker";
import { expect, test } from "@playwright/test";
import { persona, Q } from "./personas";
import { openPlayground, preparePage } from "./support/page-setup";
import { currentQuestion, walk } from "./support/walker";

// Screenshot diffs of the screens most likely to break on a structural change (phase 7,
// M7: group headers once broke the two-column grid). Baselines are per platform; update
// them on purpose with `pnpm test:e2e visual.e2e.ts --update-snapshots`.

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 }
];

async function pick(page: Page, text: string) {
  const question = await currentQuestion(page);
  const choice = question.choices.find(c => c.text === text);
  if (!choice)
    throw new Error(`"${text}" is not shown on ${question.id}`);
  await page.locator(`label[for="${choice.id}"]`).click();
}

async function snap(page: Page, name: string) {
  // No hover shift on the last clicked row, fonts loaded, no smooth scroll in flight
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect(page.locator("#survey-form main")).toHaveScreenshot(`${name}.png`);
}

const youngAdult: Persona = {
  name: "visual",
  description: "",
  answers: { [Q.gender]: "Female", [Q.age]: "18 to 24 years", [Q.location]: "Souss-Massa" }
};

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("long list: location (16 choices, two columns from 768px)", async ({ page }) => {
      const probe = await preparePage(page);
      await openPlayground(page);
      await walk(page, probe, youngAdult, { stopAt: "profile-q-2" });
      await snap(page, `long-list-${viewport.name}`);
    });

    test("category tool list: defensive tools for a SOC analyst", async ({ page }) => {
      const probe = await preparePage(page);
      await openPlayground(page);
      await walk(page, probe, persona("career-switcher-over-35"), { stopAt: "tech-q-1" });
      await pick(page, "SIEM & log analysis (Splunk, Microsoft Sentinel, Elastic / ELK, Wazuh, QRadar)");
      await snap(page, `tool-categories-${viewport.name}`);
    });

    test("Other with its text box", async ({ page }) => {
      const probe = await preparePage(page);
      await openPlayground(page);
      await walk(page, probe, youngAdult, { stopAt: "profile-q-4" });
      await pick(page, "Other");
      const others = page.getByTestId("profile-q-4-others");
      await others.fill("Self-taught through a CTF team");
      await others.blur();
      await snap(page, `other-text-${viewport.name}`);
    });

    test("soft check prompt: a doctorate before 25", async ({ page }) => {
      const probe = await preparePage(page);
      await openPlayground(page);
      await walk(page, probe, youngAdult, { stopAt: "profile-q-4" });
      await pick(page, "University/Public school - Bac +8 (Doctoral)");
      await page.getByTestId("next-button").click();
      await expect(page.getByTestId("soft-check")).toBeVisible();
      await snap(page, `soft-check-${viewport.name}`);
    });

    test("required error: Next with nothing picked", async ({ page }) => {
      await preparePage(page);
      await openPlayground(page);
      await page.getByTestId("next-button").click();
      await expect(page.getByTestId("error-message")).toBeVisible();
      await snap(page, `required-error-${viewport.name}`);
    });
  });
}
