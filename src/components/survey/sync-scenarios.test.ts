// Two client/server sync scenarios from the QA plan, measured on the real survey, the real
// action and the in-memory Firestore: a client that lost its saved answers must not wipe
// the stored ones, and a client on another deploy must not be stuck failing every retry.
import type { Answers } from "@/lib/conditions";
import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAnswers as submitAnswersAction } from "@/actions/submit-answers";
import { createFakeFirestore } from "@/lib/fake-firestore";
import { surveySections } from "@/lib/survey";
import { FakeNetwork, SurveyDriver } from "./survey-driver";
import { ERRORS } from "./survey-machine";

const harness = vi.hoisted(() => ({
  submit: async (_input: unknown): Promise<unknown> => Promise.reject(new Error("no network"))
}));

vi.mock("./utils", () => ({
  goToThanksPage: () => {},
  submitAnswers: async (input: unknown) => harness.submit(input)
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: async () => "respondent-1" }));
vi.mock("@/lib/firebase/server", () => ({
  getAccessToken: async () => "test-token",
  getProjectId: () => "test-project"
}));

// Navigation scrolls on small screens; tests run without a DOM
vi.stubGlobal("document", { body: { clientWidth: 1200 }, querySelector: () => null });

const USER = "respondent-1";
const firestore = createFakeFirestore();
vi.stubGlobal("fetch", firestore.fetch);

const log = vi.spyOn(console, "log");
beforeAll(() => {
  log.mockImplementation(() => {});
});
beforeEach(() => {
  firestore.reset();
});
afterAll(() => {
  log.mockRestore();
});

function connect(sections: SurveyQuestionsYamlFile[]) {
  const network = new FakeNetwork(async input => submitAnswersAction.orThrow.call({ cookies: {} } as never, input));
  harness.submit = async input => network.submit(input as { answers: Answers; section?: string });
  return { network, driver: new SurveyDriver(sections, network) };
}

// An adult employee in Morocco with a few years of security work: many questions show
const EMPLOYEE_PICKS = [1, 2, 0, 0, 3, 3, 0, 0, 1, 0, 2, 1, 0, 4, 1, 2, 0, 1, 3, 0, 2, 1, 1, 0, 2];

describe("scenario (a): cleared localStorage, live session cookie", () => {
  it("a restarted survey keeps the stored answers of sections it has not resubmitted", async () => {
    const first = connect(surveySections);
    await first.driver.finish(60, EMPLOYEE_PICKS);
    first.driver.stop();
    const complete = firestore.answersOf(USER);
    const laterFields = Object.keys(complete).filter(key => !key.startsWith("profile-"));
    expect(laterFields.length).toBeGreaterThan(10);

    // Same browser session cookie (5 days), but localStorage is gone: the survey restarts
    // empty, and the respondent answers profile again the same way
    const second = connect(surveySections);
    await second.driver.finish(60, EMPLOYEE_PICKS, () => second.network.records.length > 0);
    second.driver.stop();
    expect(second.network.records.map(record => record.outcome)).toEqual(["ok"]);
    expect(firestore.answersOf(USER)).toEqual(complete);
  });
});

describe("scenario (b): deploy skew", () => {
  function withExtraQuestion(sectionIdx: number): SurveyQuestionsYamlFile[] {
    const sections = structuredClone(surveySections);
    sections[sectionIdx].questions.push({
      label: "A question the server does not know yet",
      required: true,
      multiple: false,
      choices: ["Yes", "No"]
    });
    return sections;
  }

  it.each([
    ["the last section", 5],
    ["the first section", 0]
  ])("a question id the server lacks, in %s, is ignored and the rest is stored", async (_name, sectionIdx) => {
    // The client's page has one more question than the deployed server
    const sections = withExtraQuestion(sectionIdx);
    const extraId = `${sections[sectionIdx].label}-q-${sections[sectionIdx].questions.length - 1}`;
    const { network, driver } = connect(sections);
    await driver.finish(60, [0]);
    driver.stop();
    expect(network.records.length).toBeGreaterThan(0);
    expect(network.records.every(record => record.outcome === "ok")).toBe(true);
    expect(driver.snapshot.matches("complete")).toBe(true);
    const stored = firestore.answersOf(USER);
    expect(stored).not.toHaveProperty([extraId]);
    expect(Object.keys(stored).some(key => key.startsWith("profile-"))).toBe(true);
  });

  it("a pick of a choice the server lacks still fails on every retry", async () => {
    // Choices only grow before launch and are frozen by survey.lock.json after it, so this
    // stays a rejection: the server cannot tell what an unknown index meant
    const sections = structuredClone(surveySections);
    sections[0].questions[0].choices.push("A choice the server lacks");
    const { network, driver } = connect(sections);
    await driver.send({ type: "ANSWER_CHANGE", questionId: "profile-q-0", value: 2 });
    await driver.finish(60, [0], () => network.records.some(record => record.outcome === "rejected"));
    for (let retry = 0; retry < 3; retry++)
      await driver.next();
    expect(network.records).toHaveLength(4);
    for (const record of network.records)
      expect(String(record.error)).toContain("Invalid value for profile-q-0");
    expect(driver.context.error).toBe(ERRORS.submission);
    driver.stop();
  });
});
