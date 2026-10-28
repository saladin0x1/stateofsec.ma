// Invariants of the real survey machine on the real YAML, checked after every event of random
// UI sessions (see survey-driver.ts): the current question is visible, the current section is
// in visibleSectionIndices, a confirmed soft check always lets the respondent move on, and
// from wherever a session stops the end is reachable within 60 Next presses.
import type { Answers } from "@/lib/conditions";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { getVisibleSectionIndices } from "@/lib/conditions";
import { surveySections } from "@/lib/survey";
import { FakeNetwork, intentArbitrary, SurveyDriver } from "./survey-driver";
import { surveyMachine } from "./survey-machine";

const harness = vi.hoisted(() => ({
  submit: async (_input: unknown): Promise<unknown> => Promise.resolve({ data: undefined, error: undefined })
}));

vi.mock("./utils", () => ({
  goToThanksPage: () => {},
  submitAnswers: async (input: unknown) => harness.submit(input)
}));

// Navigation scrolls on small screens; tests run without a DOM
vi.stubGlobal("document", { body: { clientWidth: 1200 }, querySelector: () => null });

const SEED = 20261027;
const END_WITHIN = 60;

function newDriver() {
  const network = new FakeNetwork(async () => {});
  harness.submit = async input => network.submit(input as { answers: Answers; section?: string });
  return new SurveyDriver(surveySections, network);
}

describe("survey machine invariants (real survey)", () => {
  it("holds after every event, and the end stays reachable within 60 Next presses", async () => {
    let confirmedChecks = 0;
    let deepestPresses = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(intentArbitrary(), { maxLength: 300, size: "max" }),
        fc.boolean(),
        async (intents, randomFinish) => {
          const driver = newDriver();
          try {
            // The driver checks the invariants after every event and fails the run if a
            // confirmed soft check does not let the respondent move on
            await driver.run(intents);
            confirmedChecks += driver.log.filter(event => event.includes("CONFIRM_SOFT_CHECK")).length;
            const picks = randomFinish ? intents.map(intent => ("pick" in intent ? intent.pick : 7)) : [];
            const presses = await driver.finish(END_WITHIN, picks);
            deepestPresses = Math.max(deepestPresses, presses);
            expect(driver.snapshot.matches("complete")).toBe(true);
          }
          finally {
            driver.stop();
          }
        }
      ),
      { seed: SEED, numRuns: 300 }
    );
    // The soft-check property was exercised, and the bound is not vacuous
    expect(confirmedChecks).toBeGreaterThan(0);
    expect(deepestPresses).toBeGreaterThan(20);
  }, 300_000);

  it("reaches the end within 60 Next presses from the start, whatever is picked", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 80 }), async (picks) => {
        const driver = newDriver();
        try {
          await driver.finish(END_WITHIN, picks);
        }
        finally {
          driver.stop();
        }
      }),
      { seed: SEED, numRuns: 300 }
    );
  }, 300_000);
});

// Not reachable from the UI (steps.tsx only opens completed steps, and nothing sends
// GO_TO_QUESTION), but the machine accepts both without checking the target
describe("survey machine outside the UI paths (current behavior)", () => {
  function start() {
    const actor = createActor(surveyMachine, { input: { sections: surveySections } });
    actor.start();
    return actor;
  }

  it("a submit from a section missing from visibleSectionIndices restarts at the first visible section", async () => {
    const actor = start();
    // Every work question has a showIf, so with no answers the work section (3) is hidden
    expect(getVisibleSectionIndices(surveySections, {})).not.toContain(3);
    actor.send({ type: "GO_TO_SECTION", sectionIdx: 3 });
    expect(actor.getSnapshot().context.currentSectionIdx).toBe(3);
    // It lands on work-q-0, a hidden optional question that is also the "last" visible one
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(0);
    actor.send({ type: "NEXT" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("answering")).toBe(true));
    // incrementSection: indexOf(3) is -1, so visibleSectionIndices[0] is taken: back to profile
    expect(actor.getSnapshot().context.currentSectionIdx).toBe(0);
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(0);
    actor.stop();
  });

  it("lands on a hidden question when sent GO_TO_QUESTION, without complaint", () => {
    const actor = start();
    // profile-q-3 only shows to respondents living abroad
    actor.send({ type: "GO_TO_QUESTION", sectionIdx: 0, questionIdx: 3 });
    expect(actor.getSnapshot().context.currentQuestionIdx).toBe(3);
    actor.stop();
  });
});
