// Laws of pruneHiddenAnswers on random answer maps over the real survey.
//
// Monotonicity ("answering more never drops a kept answer") relies on two facts the survey
// validator enforces: conditions only read earlier single-choice answers, and no operator is
// true for an unanswered guard (equals, notEquals, in and notIn are all false when the guard
// is unanswered, and all / any only combine them). A negating operator, e.g. "show when X is
// unanswered" or a "not" combinator, would break this law and should make this test fail.
import type { Answers } from "./conditions";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { pruneHiddenAnswers } from "./conditions";
import { surveySections } from "./survey";
import { answersArbitrary, catalogById, pruneFixpointViolations, splitKey } from "./survey-test-model";

const SEED = 20261027;
const byId = catalogById(surveySections);

// Some answer combinations make conditions read non-number answers, which only warns
vi.spyOn(console, "warn").mockImplementation(() => {});

function prune(answers: Answers) {
  return pruneHiddenAnswers(surveySections, answers);
}

// An answer map and an extension of it: the same answers plus answers to questions it left
// unanswered (no existing answer changes)
const extensionArbitrary = answersArbitrary(surveySections, 0.9).chain(full =>
  fc.subarray(Object.keys(full)).map((keys) => {
    const smaller = Object.fromEntries(keys.map(key => [key, full[key]]));
    return { smaller, larger: full };
  })
);

// 1000 runs each take about 0.5 s alone, but several seconds on a loaded CI runner
describe("pruneHiddenAnswers laws (real survey)", { timeout: 30_000 }, () => {
  it("is the unique fixpoint: keeps exactly the answers visible given what it keeps", () => {
    fc.assert(
      fc.property(answersArbitrary(surveySections), (answers) => {
        expect(pruneFixpointViolations(surveySections, answers, prune(answers))).toEqual([]);
      }),
      { seed: SEED, numRuns: 1000 }
    );
  });

  it("only removes answers or narrows picks, never adds or changes one", () => {
    fc.assert(
      fc.property(answersArbitrary(surveySections), (answers) => {
        const problems: string[] = [];
        for (const [key, value] of Object.entries(prune(answers))) {
          const original = answers[key];
          if (!Object.hasOwn(answers, key)) {
            problems.push(`${key} added`);
          }
          else if (Array.isArray(value)) {
            // Narrowing keeps the order of the original picks, and never empties a pick
            const narrowed = Array.isArray(original) && original.filter(pick => value.includes(pick));
            if (!narrowed || JSON.stringify(narrowed) !== JSON.stringify(value))
              problems.push(`${key}: ${JSON.stringify(original)} became ${JSON.stringify(value)}`);
            else if (Array.isArray(original) && original.length && !value.length)
              problems.push(`${key}: a pick was emptied`);
          }
          else if (value !== original) {
            problems.push(`${key}: ${JSON.stringify(original)} became ${JSON.stringify(value)}`);
          }
        }
        expect(problems).toEqual([]);
      }),
      { seed: SEED, numRuns: 1000 }
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(answersArbitrary(surveySections), (answers) => {
        const once = prune(answers);
        expect(prune(once)).toEqual(once);
      }),
      { seed: SEED, numRuns: 1000 }
    );
  });

  it("answering more questions never drops or narrows a kept answer (no negating operator)", () => {
    fc.assert(
      fc.property(extensionArbitrary, ({ smaller, larger }) => {
        const before = prune(smaller);
        const after = prune(larger);
        for (const [key, value] of Object.entries(before)) {
          expect(Object.hasOwn(after, key), `${key} dropped`).toBe(true);
          const { isOthersText, id } = splitKey(key);
          if (!isOthersText && byId.get(id)!.question.multiple && Array.isArray(value))
            expect(after[key]).toEqual(expect.arrayContaining(value));
          else
            expect(after[key]).toEqual(value);
        }
      }),
      { seed: SEED, numRuns: 1000 }
    );
  });

  it("ignores keys that name no question and never reads inherited properties", () => {
    fc.assert(
      fc.property(
        answersArbitrary(surveySections),
        fc.dictionary(fc.constantFrom("lastUpdated", "constructor", "toString", "x-q-0", "profile-q-99"), fc.integer()),
        (answers, junk) => {
          expect(prune({ ...junk, ...answers })).toEqual(prune(answers));
        }
      ),
      { seed: SEED, numRuns: 300 }
    );
  });
});
