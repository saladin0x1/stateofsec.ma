import type { Page } from "@playwright/test";
import type { PageProbe } from "./page-setup";
import { expect } from "@playwright/test";
import { questionsByLabel } from "./survey-data";

// Walks the real survey UI one screen at a time, like a respondent

export type Pick = string | string[] | { choices: string[]; other: string };

export interface Persona {
  name: string;
  description: string;
  // Question label (exact YAML text) -> choice text(s) to pick; unlisted questions get the
  // first visible choice
  answers: Record<string, Pick>;
  // Question ids that must ask "is that right?" (all others must not)
  softChecks?: string[];
  // Question ids that must (or must not) be shown on this path
  sees?: string[];
  neverSees?: string[];
}

export interface ChoiceState {
  id: string;
  text: string;
  type: string;
  checked: boolean;
}

export interface QuestionState {
  id: string;
  section: string;
  number: number;
  label: string;
  choices: ChoiceState[];
  othersText: string | null;
  optional: boolean;
  softCheck: string | null;
  error: string | null;
}

export interface WalkResult {
  seen: QuestionState[];
  softChecks: string[];
  reachedThanks: boolean;
}

export type InputMode = "mouse" | "keyboard";

interface WalkOptions {
  input?: InputMode;
  // Stop on this question id without answering it
  stopAt?: string;
  // Called on every screen before it is answered
  onQuestion?: (question: QuestionState) => Promise<void>;
}

const QUESTION_ID = /^[a-z]+-q-\d+$/;

// The current question as the respondent sees it, or null while the page changes
export async function readQuestion(page: Page): Promise<QuestionState | null> {
  const raw = await page.evaluate((pattern) => {
    const container = [...document.querySelectorAll("[data-testid]")]
      .find(el => new RegExp(pattern).test(el.getAttribute("data-testid") ?? ""));
    if (!container)
      return null;
    const id = container.getAttribute("data-testid") ?? "";
    const others = container.querySelector("textarea");
    return {
      id,
      labelText: document.getElementById(`${id}-label`)?.textContent ?? "",
      choices: [...container.querySelectorAll("input")].map(input => ({
        id: input.id,
        text: (input.parentElement?.textContent ?? "").trim(),
        type: input.type,
        checked: input.checked
      })),
      othersText: others ? others.value : null,
      optional: !!document.querySelector("[data-testid=\"skip-button\"]"),
      softCheck: document.querySelector("[data-testid=\"soft-check\"] p")?.textContent ?? null,
      error: document.querySelector("[data-testid=\"error-message\"]")?.textContent?.trim() ?? null
    };
  }, QUESTION_ID.source).catch(() => null);
  if (!raw)
    return null;
  const match = /^(\d+)\. ([\s\S]*)$/.exec(raw.labelText);
  if (!match)
    throw new Error(`Question ${raw.id} has no "<number>. " prefix: "${raw.labelText}"`);
  return {
    id: raw.id,
    section: raw.id.replace(/-q-\d+$/, ""),
    number: Number(match[1]),
    label: match[2],
    choices: raw.choices,
    othersText: raw.othersText,
    optional: raw.optional,
    softCheck: raw.softCheck,
    error: raw.error
  };
}

export async function currentQuestion(page: Page): Promise<QuestionState> {
  let question: QuestionState | null = null;
  await expect.poll(async () => {
    question = await readQuestion(page);
    return question !== null;
  }, { timeout: 30_000, message: "no survey question on screen" }).toBe(true);
  return question as unknown as QuestionState;
}

// The choices a persona wants on this screen (the first visible one when it has no opinion)
export function resolvePick(persona: Persona, question: QuestionState) {
  const pick = persona.answers[question.label];
  const texts = pick === undefined
    ? [question.choices[0].text]
    : typeof pick === "string" ? [pick] : Array.isArray(pick) ? pick : pick.choices;
  const other = pick !== undefined && typeof pick === "object" && !Array.isArray(pick) ? pick.other : null;
  const choices = texts.map((text) => {
    const choice = question.choices.find(c => c.text === text);
    if (!choice) {
      throw new Error(
        `[${persona.name}] wants "${text}" on ${question.id} ("${question.label}") but it is not shown. `
        + `Shown: ${question.choices.map(c => `"${c.text}"`).join(", ")}`
      );
    }
    return choice;
  });
  return { choices, other };
}

type Outcome
  = | { kind: "question"; question: QuestionState }
    | { kind: "soft-check"; message: string }
    | { kind: "error"; message: string }
    | { kind: "thanks" };

// Wait until the screen moves on from `fromId` (or a prompt, an error or /thanks shows up)
export async function waitForOutcome(page: Page, probe: PageProbe, fromId: string): Promise<Outcome> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (probe.thanksRequested)
      return { kind: "thanks" };
    const question = await readQuestion(page);
    if (question?.softCheck)
      return { kind: "soft-check", message: question.softCheck };
    if (question?.error)
      return { kind: "error", message: question.error };
    if (question && question.id !== fromId)
      return { kind: "question", question };
    await page.waitForTimeout(20).catch(() => {});
  }
  throw new Error(`Still on ${fromId} 20s after Next`);
}

// ---------- mouse ----------

async function answerWithMouse(page: Page, persona: Persona, question: QuestionState) {
  const { choices, other } = resolvePick(persona, question);
  const wanted = new Set(choices.map(c => c.id));
  for (const choice of choices) {
    if (!choice.checked)
      await page.locator(`label[for="${choice.id}"]`).click();
  }
  // A fresh screen has nothing checked; on a revisited one, clear the extra picks
  for (const choice of question.choices) {
    if (choice.checked && !wanted.has(choice.id) && choice.type === "checkbox")
      await page.locator(`label[for="${choice.id}"]`).click();
  }
  if (other !== null)
    await page.getByTestId(`${question.id}-others`).fill(other);
}

// ---------- keyboard ----------

interface FocusInfo {
  testid: string | null;
  id: string;
  tag: string;
  inQuestion: boolean;
  isBody: boolean;
}

async function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate((pattern) => {
    const active = document.activeElement;
    const container = [...document.querySelectorAll("[data-testid]")]
      .find(el => new RegExp(pattern).test(el.getAttribute("data-testid") ?? ""));
    return {
      testid: active?.getAttribute("data-testid") ?? null,
      id: active?.id ?? "",
      tag: active?.tagName.toLowerCase() ?? "",
      inQuestion: !!container && !!active && container.contains(active),
      isBody: active === document.body
    };
  }, QUESTION_ID.source);
}

export async function tabUntil(
  page: Page,
  done: (focus: FocusInfo) => boolean,
  direction: "forward" | "backward",
  what: string,
  max = 80
) {
  for (let i = 0; i < max; i++) {
    const focus = await focusInfo(page);
    if (done(focus))
      return focus;
    await page.keyboard.press(direction === "forward" ? "Tab" : "Shift+Tab");
  }
  throw new Error(`Keyboard: ${what} not reached after ${max} ${direction} Tab presses`);
}

async function answerWithKeyboard(page: Page, persona: Persona, question: QuestionState) {
  const { choices, other } = resolvePick(persona, question);
  const focus = await focusInfo(page);
  if (!focus.inQuestion) {
    // From the top of a fresh page read forward; from the Next button come back up
    const direction = focus.isBody && question.number === 1 && question.section === "profile" ? "forward" : "backward";
    await tabUntil(page, f => f.inQuestion && f.tag === "input", direction, `an option of ${question.id}`);
  }

  const ids = question.choices.map(c => c.id);
  if (question.choices[0].type === "radio") {
    // One Tab stop per radio group; the arrow keys move and select
    const target = ids.indexOf(choices[0].id);
    const at = ids.indexOf((await focusInfo(page)).id);
    if (at === target) {
      if (!choices[0].checked)
        await page.keyboard.press("Space");
    }
    else {
      const key = target > at ? "ArrowDown" : "ArrowUp";
      for (let i = 0; i < Math.abs(target - at); i++)
        await page.keyboard.press(key);
    }
  }
  else {
    // Checkboxes: back to the first one, then Tab through them all, Space on the picks.
    // Coming up from Next lands on the last checkbox, so the first is n-1 presses away.
    if ((await focusInfo(page)).id === ids.at(-1)) {
      for (let i = 0; i < ids.length - 1; i++)
        await page.keyboard.press("Shift+Tab");
    }
    await tabUntil(page, f => f.id === ids[0], "backward", `the first option of ${question.id}`);
    const wanted = new Set(choices.map(c => c.id));
    for (const choice of question.choices) {
      // The final state is checked by answer(); exclusive picks are never combined here
      if (wanted.has(choice.id) !== choice.checked)
        await page.keyboard.press("Space");
      await page.keyboard.press("Tab");
    }
  }

  if (other !== null) {
    await tabUntil(page, f => f.testid === `${question.id}-others`, "forward", "the Other text box", 10);
    await page.keyboard.type(other);
  }
}

export async function pressNextWithKeyboard(page: Page) {
  const focus = await focusInfo(page);
  await tabUntil(page, f => f.testid === "next-button", focus.inQuestion ? "forward" : "backward", "the Next button");
  await page.keyboard.press("Enter");
}

export async function pressBackWithKeyboard(page: Page) {
  const focus = await focusInfo(page);
  await tabUntil(page, f => f.testid === "back-button", focus.testid === "next-button" || focus.testid === "skip-button" ? "backward" : "forward", "the Back button", 40);
  await page.keyboard.press("Enter");
}

async function confirmSoftCheckWithKeyboard(page: Page) {
  await tabUntil(page, f => f.testid === "soft-check-confirm", "backward", "the soft check's confirm button", 20);
  await page.keyboard.press("Enter");
}

// ---------- walking ----------

export async function answer(page: Page, persona: Persona, question: QuestionState, input: InputMode) {
  if (input === "keyboard")
    await answerWithKeyboard(page, persona, question);
  else
    await answerWithMouse(page, persona, question);

  // What the screen shows must be what the persona picked
  const { choices, other } = resolvePick(persona, question);
  const after = await currentQuestion(page);
  const checked = after.choices.filter(c => c.checked).map(c => c.text).sort();
  expect(checked, `${persona.name}: picks on ${question.id}`).toEqual(choices.map(c => c.text).sort());
  if (other !== null)
    expect(after.othersText, `${persona.name}: Other text on ${question.id}`).toBe(other);
}

export async function next(page: Page, probe: PageProbe, persona: Persona, question: QuestionState, input: InputMode, softChecks: string[]): Promise<Outcome> {
  if (input === "keyboard")
    await pressNextWithKeyboard(page);
  else
    await page.getByTestId("next-button").click();

  let outcome = await waitForOutcome(page, probe, question.id);
  if (outcome.kind === "soft-check") {
    softChecks.push(question.id);
    if (input === "keyboard")
      await confirmSoftCheckWithKeyboard(page);
    else
      await page.getByTestId("soft-check-confirm").click();
    outcome = await waitForOutcome(page, probe, question.id);
  }
  if (outcome.kind === "error")
    throw new Error(`${persona.name}: error on ${question.id}: ${outcome.message}`);
  return outcome;
}

export async function walk(page: Page, probe: PageProbe, persona: Persona, options: WalkOptions = {}): Promise<WalkResult> {
  const input = options.input ?? "mouse";
  const seen: QuestionState[] = [];
  const softChecks: string[] = [];
  let question = await currentQuestion(page);

  for (let screens = 0; screens < 150; screens++) {
    if (seen.some(q => q.id === question.id))
      throw new Error(`${persona.name}: ${question.id} shown twice in a forward walk`);
    seen.push(question);
    if (question.id === options.stopAt)
      return { seen, softChecks, reachedThanks: false };
    await options.onQuestion?.(question);
    await answer(page, persona, question, input);
    const outcome = await next(page, probe, persona, question, input, softChecks);
    if (outcome.kind === "thanks") {
      await page.waitForLoadState("load").catch(() => {});
      return { seen, softChecks, reachedThanks: true };
    }
    if (outcome.kind !== "question")
      throw new Error(`${persona.name}: unexpected ${outcome.kind} after ${question.id}`);
    question = outcome.question;
  }
  throw new Error(`${persona.name}: more than 150 screens`);
}

// Numbers shown on screen must run 1..n inside every section, with no gap or repeat
export function expectSequentialNumbering(seen: QuestionState[], who: string) {
  const bySection = new Map<string, number[]>();
  for (const question of seen) {
    const numbers = bySection.get(question.section) ?? [];
    numbers.push(question.number);
    bySection.set(question.section, numbers);
  }
  for (const [section, numbers] of bySection)
    expect(numbers, `${who}: numbering in ${section}`).toEqual(numbers.map((_, i) => i + 1));
}

// Every persona key must name a real question and real choices
export function validatePersona(persona: Persona) {
  for (const [label, pick] of Object.entries(persona.answers)) {
    const ref = questionsByLabel.get(label);
    if (!ref)
      throw new Error(`[${persona.name}] no question labelled "${label}"`);
    const texts = typeof pick === "string" ? [pick] : Array.isArray(pick) ? pick : pick.choices;
    for (const text of texts) {
      if (!ref.question.choices.includes(text))
        throw new Error(`[${persona.name}] "${text}" is not a choice of ${ref.id}`);
    }
    if (texts.length > 1 && !ref.question.multiple)
      throw new Error(`[${persona.name}] ${ref.id} is single choice but gets ${texts.length} picks`);
  }
}
