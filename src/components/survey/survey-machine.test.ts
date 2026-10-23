import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { surveyMachine } from "./survey-machine";

vi.mock("./utils", () => ({
  goToThanksPage: () => {},
  submitAnswers: async () => ({ data: undefined, error: undefined })
}));

// Navigation scrolls on small screens; tests run without a DOM
vi.stubGlobal("document", { body: { clientWidth: 1200 }, querySelector: () => null });

const sections = [
  {
    title: "Profile",
    label: "profile",
    position: 1,
    questions: [
      {
        label: "Experience",
        required: true,
        multiple: false,
        choices: ["None", "1-4 years", "5+ years"],
        softChecks: [{ options: ["5+ years"], message: "Rare, is that right?" }]
      },
      {
        label: "Seniority",
        required: false,
        multiple: false,
        showIf: { question: "profile-q-0", notEquals: 0 },
        choices: ["Junior", "Senior", "CISO"],
        optionShowIf: [{ options: ["CISO"], showIf: { question: "profile-q-0", equals: 2 } }]
      }
    ]
  },
  {
    title: "Work",
    label: "work",
    position: 2,
    questions: [
      { label: "Salary", required: false, multiple: false, showIf: { question: "profile-q-0", notEquals: 0 }, choices: ["Low", "High"] },
      { label: "Outlook", required: true, multiple: false, choices: ["Stay", "Leave"] }
    ]
  }
] as SurveyQuestionsYamlFile[];

function start() {
  const actor = createActor(surveyMachine, { input: { sections } });
  actor.start();
  return actor;
}

function answer(actor: ReturnType<typeof start>, questionId: string, value: number) {
  actor.send({ type: "ANSWER_CHANGE", questionId, value });
}

describe("survey machine answers", () => {
  it("hides answers that a change makes irrelevant", () => {
    const actor = start();
    answer(actor, "profile-q-0", 2);
    answer(actor, "profile-q-1", 2);
    answer(actor, "profile-q-0", 0);
    expect(actor.getSnapshot().context.answers).toEqual({ "profile-q-0": 0 });
  });

  it("restores them when the change is undone", () => {
    const actor = start();
    answer(actor, "profile-q-0", 2);
    answer(actor, "profile-q-1", 2);
    answer(actor, "profile-q-0", 0);
    answer(actor, "profile-q-0", 2);
    expect(actor.getSnapshot().context.answers).toEqual({ "profile-q-0": 2, "profile-q-1": 2 });
  });

  it("drops a pick whose choice is hidden, until the choice shows again", () => {
    const actor = start();
    answer(actor, "profile-q-0", 2);
    answer(actor, "profile-q-1", 2);
    answer(actor, "profile-q-0", 1);
    expect(actor.getSnapshot().context.answers).toEqual({ "profile-q-0": 1 });
    answer(actor, "profile-q-0", 2);
    expect(actor.getSnapshot().context.answers["profile-q-1"]).toBe(2);
  });

  it("asks to confirm a rare pick before moving on, once", () => {
    const actor = start();
    const context = () => actor.getSnapshot().context;
    answer(actor, "profile-q-0", 2);
    actor.send({ type: "NEXT" });
    expect(context().softCheck).toBe("Rare, is that right?");
    expect(context().currentQuestionIdx).toBe(0);

    actor.send({ type: "DISMISS_SOFT_CHECK" });
    expect(context().softCheck).toBeNull();
    actor.send({ type: "NEXT" });
    actor.send({ type: "CONFIRM_SOFT_CHECK" });
    expect(context().softCheck).toBeNull();
    expect(context().currentQuestionIdx).toBe(1);

    actor.send({ type: "BACK" });
    actor.send({ type: "NEXT" });
    expect(context().softCheck).toBeNull();
    expect(context().currentQuestionIdx).toBe(1);
  });

  it("drops the check when the answer changes", () => {
    const actor = start();
    answer(actor, "profile-q-0", 2);
    actor.send({ type: "NEXT" });
    answer(actor, "profile-q-0", 1);
    expect(actor.getSnapshot().context.softCheck).toBeNull();
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(1);
  });

  it("opens a section from the steps bar on its first visible question", () => {
    const actor = start();
    answer(actor, "profile-q-0", 0);
    actor.send({ type: "GO_TO_SECTION", sectionIdx: 1 });
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(1);
  });
});
