import { expect, test } from "@playwright/test";
import { persona } from "./personas";
import { openPlayground, preparePage } from "./support/page-setup";
import { answer, currentQuestion, expectSequentialNumbering, pressBackWithKeyboard, pressNextWithKeyboard, waitForOutcome, walk } from "./support/walker";

test.use({ viewport: { width: 1280, height: 800 } });

test("keyboard only: Tab, Space, arrows and Enter reach /thanks with no mouse", async ({ page }) => {
  // About 1,000 key presses, each followed by a focus check: slow when every worker is busy
  test.setTimeout(300_000);
  const who = persona("abroad-canada");
  const probe = await preparePage(page);
  await openPlayground(page);

  const result = await walk(page, probe, who, { input: "keyboard" });

  expect(result.reachedThanks).toBe(true);
  expectSequentialNumbering(result.seen, who.name);
  // Same path as the mouse walk of this persona
  expect(result.seen.length).toBe(42);
  expect(probe.submits.length).toBe(6);
  expect(probe.submits.at(-1)?.answers["community-q-13-others"]).toBe("Mastodon");
  expect(probe.pointerEvents, "mouse or touch presses").toBe(0);
});

// Back used to be a <div> with a click handler: no Tab stop, no Enter, no button role
test("keyboard only: Back is reachable and restores the previous answer", async ({ page }) => {
  const who = persona("abroad-canada");
  const probe = await preparePage(page);
  await openPlayground(page);

  const first = await currentQuestion(page);
  await answer(page, who, first, "keyboard");
  await pressNextWithKeyboard(page);
  expect((await waitForOutcome(page, probe, first.id)).kind).toBe("question");
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

  await pressBackWithKeyboard(page);

  await expect(page.getByTestId(first.id)).toBeVisible();
  expect((await currentQuestion(page)).choices.find(c => c.checked)?.text).toBe("Male");
  expect(probe.pointerEvents, "mouse or touch presses").toBe(0);
});

// The <label> under each option is an empty click overlay: without aria-labelledby a
// screen reader announced "radio button, 1 of 2" with no option text
test("every choice is named by its text for screen readers", async ({ page }) => {
  const probe = await preparePage(page);
  await openPlayground(page);
  const group = page.getByRole("group", { name: "1. What is your gender?" });
  await expect(group.getByRole("radio", { name: "Male", exact: true })).toHaveCount(1);
  await expect(group.getByRole("radio", { name: "Female", exact: true })).toHaveCount(1);

  await walk(page, probe, persona("leaf-some-employee-morocco"), { stopAt: "learning-q-0" });
  const certifications = await currentQuestion(page);
  for (const choice of certifications.choices)
    await expect(page.getByRole("checkbox", { name: choice.text, exact: true })).toHaveCount(1);
});
