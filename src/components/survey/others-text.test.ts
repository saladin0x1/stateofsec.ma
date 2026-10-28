// The "other" text the client sends: cut to the server's 200 UTF-16 units without splitting
// a character, and always well-formed
import type { Answers } from "@/lib/conditions";
import { describe, expect, it, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { surveySections } from "@/lib/survey";
import { surveyMachine } from "./survey-machine";

const sent = vi.hoisted(() => [] as Answers[]);

vi.mock("./utils", () => ({
  goToThanksPage: () => {},
  submitAnswers: async ({ answers }: { answers: Answers }) => {
    sent.push(answers);
    return { data: undefined, error: undefined };
  }
}));

// Navigation scrolls on small screens; tests run without a DOM
vi.stubGlobal("document", { body: { clientWidth: 1200 }, querySelector: () => null });

const LONE_SURROGATE = /\p{Cs}/u;

// Profile answers for a respondent abroad ("Others" location) who submits the section
async function submitProfileWithOthersText(text: string) {
  sent.length = 0;
  const actor = createActor(surveyMachine, {
    input: {
      sections: surveySections,
      persisted: {
        currentSectionIdx: 0,
        currentQuestionIdx: 0,
        rawAnswers: { "profile-q-0": 0, "profile-q-1": 0, "profile-q-2": 15, "profile-q-2-others": text, "profile-q-3": 12 }
      }
    }
  });
  actor.start();
  // Under 18: q-4 to q-6 are hidden, so q-3 is the last profile question
  actor.send({ type: "GO_TO_QUESTION", sectionIdx: 0, questionIdx: 3 });
  actor.send({ type: "NEXT" });
  await waitFor(actor, snapshot => !snapshot.matches("submitting"));
  actor.stop();
  expect(sent).toHaveLength(1);
  return sent[0]["profile-q-2-others"] as string;
}

describe("other text sent by the client", () => {
  it("does not split an emoji that straddles the 200-unit cut", async () => {
    const text = `${"a".repeat(199)}\u{1F600}`; // 201 UTF-16 units, the emoji at 199-200
    const sentText = await submitProfileWithOthersText(text);
    expect(sentText.length).toBeLessThanOrEqual(200);
    expect(LONE_SURROGATE.test(sentText)).toBe(false);
    expect(sentText).toBe("a".repeat(199));
  });

  it("keeps a whole emoji that ends at the 200th unit", async () => {
    const text = `${"a".repeat(198)}\u{1F600}`;
    expect(await submitProfileWithOthersText(text)).toBe(text);
  });

  it("replaces a lone surrogate already in the text", async () => {
    const sentText = await submitProfileWithOthersText("ab\uD83Dcd");
    expect(LONE_SURROGATE.test(sentText)).toBe(false);
    expect(sentText).toBe("ab�cd");
  });
});
