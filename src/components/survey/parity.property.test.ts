// Client/server parity fuzzer: random UI sessions on the real survey machine and the real
// YAML, every submit sent (as JSON) through the real submitAnswers action (zod schema +
// sanitizeAnswers) and the real saveAnswers request, answered by an in-memory Firestore with
// update-mask semantics. After every successful submit, the stored fields of the sections up
// to the submitted one must be exactly the client's cumulative answers, pruned, minus "other"
// text without its Other choice and minus empty required answers; fields of later sections are
// saved when sent and otherwise left as they were. The last section's submit makes the whole
// document exact.
import type { SubmitRecord } from "./survey-driver";
import type { Answers } from "@/lib/conditions";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { submitAnswers as submitAnswersAction } from "@/actions/submit-answers";
import { pruneHiddenAnswers } from "@/lib/conditions";
import { createFakeFirestore } from "@/lib/fake-firestore";
import { surveySections } from "@/lib/survey";
import { expectedDocument, storedDocumentViolations, unansweredRequired } from "@/lib/survey-test-model";
import { FakeNetwork, intentArbitrary, SurveyDriver } from "./survey-driver";

const harness = vi.hoisted(() => ({
  submit: async (_input: unknown): Promise<unknown> => Promise.reject(new Error("no network")),
  userId: "respondent-1"
}));

vi.mock("./utils", () => ({
  goToThanksPage: () => {},
  submitAnswers: async (input: unknown) => harness.submit(input)
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: async () => harness.userId }));
vi.mock("@/lib/firebase/server", () => ({
  getAccessToken: async () => "test-token",
  getProjectId: () => "test-project"
}));

// Navigation scrolls on small screens; tests run without a DOM
vi.stubGlobal("document", { body: { clientWidth: 1200 }, querySelector: () => null });

const SEED = 20261027;
const firestore = createFakeFirestore();
vi.stubGlobal("fetch", firestore.fetch);

// The action logs every save
const log = vi.spyOn(console, "log");
beforeAll(() => {
  log.mockImplementation(() => {});
});
afterAll(() => {
  log.mockRestore();
});

// Index of the section an answer field belongs to
function sectionOf(key: string) {
  return surveySections.findIndex(section => key.startsWith(`${section.label}-q-`));
}

// The stored document after a submit from section `submitted`, given the one before it
function expectedAfterSubmit(expected: Answers, before: Answers, submitted: number): Answers {
  const result: Answers = {};
  for (const key of new Set([...Object.keys(expected), ...Object.keys(before)])) {
    const source = Object.hasOwn(expected, key) || sectionOf(key) <= submitted ? expected : before;
    if (Object.hasOwn(source, key))
      result[key] = source[key];
  }
  return result;
}

async function callAction(input: { answers: Answers }) {
  // orThrow runs the zod schema then the handler, as the action endpoint does
  return submitAnswersAction.orThrow.call({ cookies: {} } as never, input);
}

describe("client/server parity (real survey, real action, fake Firestore)", () => {
  // 300 runs take about 30 s on an idle laptop, several times that on a CI runner or a busy machine
  it("stores exactly the pruned cumulative answers, up to the submitted section", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(intentArbitrary(), { maxLength: 300, size: "max" }), async (intents) => {
        firestore.reset();
        log.mockClear();
        const network = new FakeNetwork(callAction);
        harness.submit = async input => network.submit(input as { answers: Answers; section?: string });
        let stored: Answers = {};
        let submits = 0;
        const hooks: { onSubmit?: (record: SubmitRecord, rawAnswers: Answers) => void } = {};
        const driver = new SurveyDriver(surveySections, network, hooks);

        hooks.onSubmit = (record, rawAnswers) => {
          submits++;
          const doc = firestore.answersOf(harness.userId);
          if (record.outcome === "rejected")
            driver.fail(`the server rejected a UI-reachable payload: ${String(record.error)}\n${JSON.stringify(record.payload)}`);
          if (record.outcome === "offline") {
            if (!isDeepStrictEqual(doc, stored))
              driver.fail("a request lost in transit changed the stored document");
            return;
          }
          // The client submits its visible answers, nothing else
          if (!isDeepStrictEqual(record.payload, pruneHiddenAnswers(surveySections, rawAnswers)))
            driver.fail(`the payload is not the pruned raw answers: ${JSON.stringify(record.payload)}`);
          const submitted = surveySections.findIndex(section => section.label === record.section);
          if (submitted === -1)
            driver.fail(`the client sent no known section: ${String(record.section)}`);
          const expected = expectedAfterSubmit(expectedDocument(surveySections, rawAnswers), stored, submitted);
          if (!isDeepStrictEqual(doc, expected))
            driver.fail(`stored ${JSON.stringify(doc)}\nexpected ${JSON.stringify(expected)}`);
          // Stale fields of later sections may remain until the last section is submitted
          const violations = submitted === surveySections.length - 1 ? storedDocumentViolations(surveySections, doc) : [];
          if (violations.length)
            driver.fail(`stored document breaks the survey rules: ${violations.join("; ")}`);
          stored = doc;
        };

        try {
          await driver.run(intents);
          await driver.finish(60, intents.map(intent => ("pick" in intent ? intent.pick : 7)));
          // Finishing through the UI leaves no visible required question unanswered
          const doc = firestore.answersOf(harness.userId);
          const missing = unansweredRequired(surveySections, doc);
          if (missing.length)
            driver.fail(`completed with required questions unanswered: ${missing.join(", ")}`);
          const violations = driver.snapshot.matches("complete") ? storedDocumentViolations(surveySections, doc) : [];
          if (violations.length)
            driver.fail(`completed document breaks the survey rules: ${violations.join("; ")}`);
          expect(submits).toBeGreaterThan(0);
        }
        finally {
          driver.stop();
        }
      }),
      { seed: SEED, numRuns: 300 }
    );
  }, 300_000);
});
