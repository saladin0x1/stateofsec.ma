// Hostile payloads against the submitAnswers endpoint: the real action (astro's zod schema,
// then sanitizeAnswers) and the real saveAnswers request, answered by an in-memory Firestore.
// A payload is sent as JSON text, as it arrives over the wire. Expected for every hostile
// payload: a clean rejection (zod input error, or BAD_REQUEST from InvalidAnswersError),
// never another error, and no write at all. Fields the survey does not know are ignored
// instead (a client on another deploy must not fail every retry), and never written.
import type { Answers } from "@/lib/conditions";
import { ActionError, isInputError } from "astro:actions";
import fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAnswers as submitAnswersAction } from "@/actions/submit-answers";
import { sanitizeAnswers } from "@/lib/answers";
import { createFakeFirestore } from "@/lib/fake-firestore";
import { surveySections } from "@/lib/survey";
import { answerFieldNames, storedDocumentViolations } from "@/lib/survey-test-model";

vi.mock("@/lib/session", () => ({ getSessionUserId: async () => "respondent-1" }));
vi.mock("@/lib/firebase/server", () => ({
  getAccessToken: async () => "test-token",
  getProjectId: () => "test-project"
}));

const SEED = 20261027;
const USER = "respondent-1";
const firestore = createFakeFirestore();
vi.stubGlobal("fetch", firestore.fetch);

const log = vi.spyOn(console, "log");
beforeAll(() => {
  log.mockImplementation(() => {});
});
beforeEach(() => {
  firestore.reset();
  log.mockClear();
});
afterAll(() => {
  log.mockRestore();
});

type Outcome = "stored" | "zod" | "invalid" | "crash";

async function send(json: string): Promise<{ outcome: Outcome; error?: unknown }> {
  const input = JSON.parse(json) as never;
  try {
    await submitAnswersAction.orThrow.call({ cookies: {} } as never, input);
    return { outcome: "stored" };
  }
  catch (error) {
    if (isInputError(error))
      return { outcome: "zod", error };
    if (error instanceof ActionError && error.code === "BAD_REQUEST")
      return { outcome: "invalid", error };
    return { outcome: "crash", error };
  }
}

// Submitted from the last section unless said otherwise, so every answer field may be deleted
const LAST_SECTION = surveySections[surveySections.length - 1].label;

function answers(body: string, section: string | null = LAST_SECTION) {
  return section === null ? `{"answers":{${body}}}` : `{"answers":{${body}},"section":"${section}"}`;
}

// What an earlier client's slice(0, 200) left of 199 "a" followed by an emoji: 200 units,
// so the schema lets it through, ending with half the emoji (a lone high surrogate)
const SPLIT_EMOJI = `${"a".repeat(199)}\\ud83d`;

// [case, JSON body, expected outcome]
const rejected: Array<[string, string, Exclude<Outcome, "stored" | "crash">]> = [
  ["float for a single choice", answers(`"profile-q-0":1.5`), "invalid"],
  ["float inside a multiple choice", answers(`"learning-q-2":[0.5]`), "invalid"],
  ["1e999 (Infinity) for a choice", answers(`"profile-q-0":1e999`), "invalid"],
  ["duplicate picks", answers(`"learning-q-2":[0,0]`), "invalid"],
  ["0 and -0 together", answers(`"learning-q-2":[0,-0]`), "invalid"],
  ["index past the last choice", answers(`"profile-q-0":2`), "invalid"],
  ["negative index", answers(`"profile-q-0":-1`), "invalid"],
  ["multiple pick past the last choice", answers(`"learning-q-2":[99]`), "invalid"],
  ["string for a choice", answers(`"profile-q-0":"1"`), "invalid"],
  ["array for a single choice", answers(`"profile-q-0":[1]`), "invalid"],
  ["number for a multiple choice", answers(`"learning-q-2":1`), "invalid"],
  ["exclusive choice combined", answers(`"learning-q-0":[0,1]`), "invalid"],
  ["other text as a number", answers(`"profile-q-2-others":5`), "invalid"],
  ["other text as null", answers(`"profile-q-2-others":null`), "invalid"],
  ["201 characters of other text", answers(`"profile-q-2":15,"profile-q-2-others":"${"a".repeat(201)}"`), "zod"],
  ["half an emoji at characters 199-200", answers(`"profile-q-2":15,"profile-q-2-others":"${SPLIT_EMOJI}"`), "invalid"],
  ["a lone low surrogate", answers(`"profile-q-2":15,"profile-q-2-others":"a\\ude00b"`), "invalid"],
  // The schema caps picks (64) and fields (256) far above the survey, before any validation
  ["100 000 picks of one choice", answers(`"learning-q-2":[${Array.from({ length: 100_000 }, () => 0).join(",")}]`), "zod"],
  ["100 000 distinct picks", answers(`"learning-q-2":[${Array.from({ length: 100_000 }, (_, i) => i).join(",")}]`), "zod"],
  ["65 picks", answers(`"learning-q-2":[${Array.from({ length: 65 }, () => 0).join(",")}]`), "zod"],
  ["10 000 unknown keys", answers(`"profile-q-0":0,${Array.from({ length: 10_000 }, (_, i) => `"junk-q-${i}":0`).join(",")}`), "zod"],
  ["boolean answer", answers(`"profile-q-0":true`), "zod"],
  ["object answer", answers(`"profile-q-0":{"a":1}`), "zod"],
  ["nested array answer", answers(`"learning-q-2":[[0]]`), "zod"],
  ["answers as an array", `{"answers":[0,1]}`, "zod"],
  ["answers missing", `{}`, "zod"]
];

// [case, JSON body, the field that must not be stored]
const ignored: Array<[string, string, string]> = [
  ["unknown question id", answers(`"profile-q-0":0,"profile-q-99":0`), "profile-q-99"],
  ["upper-case id", answers(`"profile-q-0":0,"PROFILE-q-0":0`), "PROFILE-q-0"],
  ["empty key", answers(`"profile-q-0":0,"":0`), ""],
  ["server field lastUpdated", answers(`"profile-q-0":0,"lastUpdated":"2020-01-01T00:00:00.000Z"`), "lastUpdated"],
  ["key constructor", answers(`"profile-q-0":0,"constructor":0`), "constructor"],
  ["other text on a question without Other", answers(`"profile-q-0":0,"profile-q-0-others":"x"`), "profile-q-0-others"],
  ["other text of other text", answers(`"profile-q-0":0,"profile-q-2-others-others":"x"`), "profile-q-2-others-others"],
  // A client on another deploy sends a few unknown fields at most, well under the 256 cap
  ["200 unknown keys", answers(`"profile-q-0":0,${Array.from({ length: 200 }, (_, i) => `"junk-q-${i}":0`).join(",")}`), "junk-q-199"]
];

describe("submitAnswers endpoint abuse table", () => {
  it.each(ignored)("ignores %s and stores the rest", async (_name, json, field) => {
    const { outcome, error } = await send(json);
    expect(outcome, String(error)).toBe("stored");
    const doc = firestore.answersOf(USER);
    expect(Object.hasOwn(doc, field)).toBe(false);
    expect(doc["profile-q-0"]).toBe(0);
    expect(storedDocumentViolations(surveySections, doc)).toEqual([]);
  });

  it("deletes no stored field when the section is missing or unknown", async () => {
    await send(answers(`"profile-q-0":0,"community-q-0":1`));
    for (const section of [null, "no-such-section"]) {
      const { outcome } = await send(answers(`"profile-q-0":1`, section));
      expect(outcome).toBe("stored");
      expect(firestore.answersOf(USER)).toEqual({ "profile-q-0": 1, "community-q-0": 1 });
    }
  });

  it.each(rejected)("rejects %s cleanly, without writing", async (_name, json, expected) => {
    const { outcome, error } = await send(json);
    expect(outcome, String(error)).toBe(expected);
    expect(firestore.writes).toHaveLength(0);
  });

  it("drops a __proto__ key in the schema (zod), keeps the rest, pollutes nothing", async () => {
    // An object value fails the schema, like any object answer
    expect((await send(answers(`"__proto__":{"polluted":1},"profile-q-0":0`))).outcome).toBe("zod");
    expect(firestore.writes).toHaveLength(0);
    // Current behavior with a value the schema accepts, not a rejection: astro's zod 3
    // record parser skips the "__proto__" key and the rest is saved
    const { outcome } = await send(answers(`"__proto__":[7],"profile-q-0":0`));
    expect(outcome).toBe("stored");
    expect(firestore.answersOf(USER)).toEqual({ "profile-q-0": 0 });
    expect(({} as Record<number, unknown>)[0]).toBeUndefined();
    // sanitizeAnswers alone ignores it as an unknown question
    expect(sanitizeAnswers(JSON.parse(`{"__proto__":0}`) as Answers).toSave).toEqual({});
  });

  it("stores -0 as the choice 0", async () => {
    const { outcome } = await send(answers(`"profile-q-0":-0`));
    expect(outcome).toBe("stored");
    expect(Object.is(firestore.answersOf(USER)["profile-q-0"], 0)).toBe(true);
  });

  it("stores 200 characters of other text ending with a whole emoji", async () => {
    const text = `${"a".repeat(198)}\u{1F600}`;
    const { outcome } = await send(answers(`"profile-q-2":15,"profile-q-2-others":${JSON.stringify(text)}`));
    expect(outcome).toBe("stored");
    expect(firestore.answersOf(USER)["profile-q-2-others"]).toBe(text);
  });

  it("rejects or stores random payloads, never crashes, never writes on a rejection", async () => {
    const known = surveySections.flatMap(section => section.questions.map((_, index) => `${section.label}-q-${index}`));
    const fields = answerFieldNames(surveySections);
    const key = fc.oneof(
      { weight: 6, arbitrary: fc.constantFrom(...known) },
      { weight: 2, arbitrary: fc.constantFrom(...fields.filter(field => field.endsWith("-others"))) },
      { weight: 1, arbitrary: fc.constantFrom("lastUpdated", "__proto__", "constructor", "", "profile-q-0-others", "x-q-0") },
      { weight: 1, arbitrary: fc.string({ maxLength: 12 }) }
    );
    const value = fc.oneof(
      { weight: 6, arbitrary: fc.integer({ min: -2, max: 20 }).map(String) },
      { weight: 1, arbitrary: fc.constantFrom("-0", "1.5", "1e999", "null", "true", "{}", "[]", "[[0]]") },
      { weight: 4, arbitrary: fc.array(fc.integer({ min: -1, max: 16 }), { maxLength: 6 }).map(list => `[${list.join(",")}]`) },
      { weight: 2, arbitrary: fc.string({ maxLength: 210 }).map(text => JSON.stringify(text)) }
    );
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(key, value), { maxLength: 12 }), async (entries) => {
        firestore.reset();
        const json = answers(entries.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(","));
        const { outcome, error } = await send(json);
        expect(outcome, `${String(error)}\n${json}`).not.toBe("crash");
        if (outcome !== "stored") {
          expect(firestore.writes).toHaveLength(0);
          return;
        }
        // One write, whose mask covers every answer field, leaving a valid document
        expect(firestore.writes).toHaveLength(1);
        expect(firestore.writes[0].mask).toEqual(expect.arrayContaining(fields));
        const doc = firestore.answersOf(USER);
        expect(storedDocumentViolations(surveySections, doc)).toEqual([]);
      }),
      { seed: SEED, numRuns: 1500 }
    );
  }, 300_000);
});

// A body just under the 64 KB cap, every value of the wrong type: the old record-of-unions
// schema took hundreds of milliseconds and answered with megabytes of issues
describe("submitAnswers input cost", () => {
  for (const [name, count, value] of [["5500 wrong values", 5500, "true"], ["250 wrong values", 250, "{}"]] as const) {
    it(`answers ${name} with one short error`, async () => {
      const body = `{"answers":{${Array.from({ length: count }, (_, i) => `"${i}":${value}`).join(",")}}}`;
      expect(body.length).toBeLessThan(64 * 1024);
      const started = performance.now();
      const { outcome, error } = await send(body);
      expect(outcome).toBe("zod");
      expect(JSON.stringify((error as { issues: unknown[] }).issues).length).toBeLessThan(500);
      expect(performance.now() - started).toBeLessThan(50);
    });
  }
});
