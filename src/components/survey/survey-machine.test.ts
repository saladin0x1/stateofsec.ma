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
      { label: "Experience", required: true, multiple: false, choices: ["None", "1-4 years", "5+ years"] },
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

  it("opens a section from the steps bar on its first visible question", () => {
    const actor = start();
    answer(actor, "profile-q-0", 0);
    actor.send({ type: "GO_TO_SECTION", sectionIdx: 1 });
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(1);
  });
});
