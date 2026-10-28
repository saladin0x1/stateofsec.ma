import type { Page } from "@playwright/test";
import type { Persona } from "./support/walker";
import { expect, test } from "@playwright/test";
import { EMPLOYMENT, persona, Q } from "./personas";
import { openPlayground, preparePage, reloadKeepingProgress } from "./support/page-setup";
import { answer, currentQuestion, walk } from "./support/walker";

test.use({ viewport: { width: 1280, height: 800 } });

async function pick(page: Page, text: string) {
  const question = await currentQuestion(page);
  const choice = question.choices.find(c => c.text === text);
  if (!choice)
    throw new Error(`"${text}" is not shown on ${question.id}`);
  await page.locator(`label[for="${choice.id}"]`).click();
}

async function expectOn(page: Page, id: string, number?: number) {
  await expect(page.getByTestId(id)).toBeVisible();
  if (number !== undefined)
    await expect(page.locator(`[id="${id}-label"]`)).toHaveText(new RegExp(`^${number}\\. `));
}

async function checkedText(page: Page) {
  const question = await currentQuestion(page);
  return question.choices.filter(c => c.checked).map(c => c.text);
}

test("reload mid-section restores the question and the answers", async ({ page }) => {
  const probe = await preparePage(page);
  await openPlayground(page);
  const who: Persona = {
    name: "reloader",
    description: "",
    answers: { [Q.gender]: "Female", [Q.age]: "25 to 34 years", [Q.location]: "Europe", [Q.country]: "France" }
  };
  await walk(page, probe, who, { stopAt: "profile-q-4" });
  await pick(page, "University/Public school - Bac +5 (Master's)");

  await reloadKeepingProgress(page);

  await expectOn(page, "profile-q-4", 5);
  expect(await checkedText(page)).toEqual(["University/Public school - Bac +5 (Master's)"]);
  await page.getByTestId("back-button").click();
  await expectOn(page, "profile-q-3", 4);
  expect(await checkedText(page)).toEqual(["France"]);
  await page.getByTestId("back-button").click();
  await expectOn(page, "profile-q-2", 3);
  expect(await checkedText(page)).toEqual(["Europe"]);
});

test.describe("double-click on Next", () => {
  test("inside a section it moves one question, with no error flash (390px)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparePage(page);
    await openPlayground(page);
    await pick(page, "Male");

    await page.getByTestId("next-button").dblclick();

    // A second Next acting on the age question (required, unanswered) would flash
    // "Please select an option."; on an optional question it would skip it
    await expectOn(page, "profile-q-1", 2);
    await page.waitForTimeout(300);
    await expectOn(page, "profile-q-1", 2);
    await expect(page.getByTestId("error-message")).toHaveCount(0);
  });

  // With a fast submit (instant in the playground, a quick network in production) the
  // next section is on screen before the second click: that click pressed Next on the
  // optional income question and skipped it unanswered
  for (const delay of [0, 400]) {
    test(`at the end of a section it submits once and skips nothing (submit takes ${delay}ms)`, async ({ page }) => {
      const who = persona("leaf-some-employee-morocco");
      const probe = await preparePage(page, { submitDelayMs: delay });
      await openPlayground(page);
      await walk(page, probe, who, { stopAt: "learning-q-3" });
      await answer(page, who, await currentQuestion(page), "mouse");
      const before = probe.submits.length;

      await page.getByTestId("next-button").dblclick();

      await expectOn(page, "work-q-0", 1);
      await page.waitForTimeout(delay + 300);
      await expectOn(page, "work-q-0", 1);
      expect(probe.submits.length - before).toBe(1);
    });
  }
});

test("offline on submit: the error shows, the answers stay, and retrying works", async ({ page, context }) => {
  const who = persona("leaf-some-employee-morocco");
  const probe = await preparePage(page);
  await openPlayground(page);
  await walk(page, probe, who, { stopAt: "profile-q-6" });
  await answer(page, who, await currentQuestion(page), "mouse");

  await context.setOffline(true);
  await page.getByTestId("next-button").click();

  await expect(page.getByTestId("error-message")).toContainText("Error submitting your answers, please try again.");
  await expectOn(page, "profile-q-6", 6);
  expect(await checkedText(page)).toEqual([EMPLOYMENT[0]]);
  expect(probe.submits.map(s => s.offline)).toEqual([true]);

  await context.setOffline(false);
  await page.getByTestId("next-button").click();

  await expectOn(page, "roles-q-0", 1);
  expect(probe.submits.map(s => s.offline)).toEqual([true, false]);
  expect(probe.submits[1].answers["profile-q-6"]).toBe(0);
});

test("going back to hide an answered question, then showing it again, restores its answer", async ({ page }) => {
  const probe = await preparePage(page);
  await openPlayground(page);
  const who: Persona = {
    name: "changes-mind",
    description: "",
    answers: { [Q.age]: "25 to 34 years", [Q.location]: "Europe", [Q.country]: "Germany, Switzerland or Austria" }
  };
  const backTo = async (id: string) => {
    for (let i = 0; i < 10 && (await currentQuestion(page)).id !== id; i++)
      await page.getByTestId("back-button").click();
    await expectOn(page, id);
  };
  const nextUntil = async (id: string) => {
    for (let i = 0; i < 10 && (await currentQuestion(page)).id !== id; i++) {
      const from = (await currentQuestion(page)).id;
      await page.getByTestId("next-button").click();
      await expect(page.getByTestId(from)).toHaveCount(0);
    }
    await expectOn(page, id);
  };

  // Abroad: the country question is shown and answered; the profile is submitted with it
  await walk(page, probe, who, { stopAt: "roles-q-0" });
  expect(probe.submits.at(-1)?.answers["profile-q-3"]).toBe(2);

  // Back across the section: move to Morocco, which hides the country question
  await backTo("profile-q-2");
  expect(await checkedText(page)).toEqual(["Europe"]);
  await pick(page, "Casablanca-Settat");
  await page.getByTestId("next-button").click();
  await expectOn(page, "profile-q-4", 4);
  await nextUntil("roles-q-0");
  expect(probe.submits.at(-1)?.answers).not.toHaveProperty("profile-q-3");

  // Back again to Europe: the country question returns with its earlier answer
  await backTo("profile-q-2");
  await pick(page, "Europe");
  await page.getByTestId("next-button").click();
  await expectOn(page, "profile-q-3", 4);
  expect(await checkedText(page)).toEqual(["Germany, Switzerland or Austria"]);
  await page.getByTestId("next-button").click();
  await expectOn(page, "profile-q-4", 5);
  await nextUntil("roles-q-0");
  expect(probe.submits.at(-1)?.answers["profile-q-3"]).toBe(2);
  expect(probe.submits).toHaveLength(3);
});
