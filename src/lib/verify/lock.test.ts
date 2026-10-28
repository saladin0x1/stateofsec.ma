import { describe, expect, it } from "vitest";
import { buildLock, checkLock, updateLock } from "./lock";
import { buildModel } from "./model";
import { FORK, surveyOf } from "./test-fixtures";

const model = buildModel(surveyOf(...FORK));
const reordered = buildModel(surveyOf(FORK[0].replace("choices: [Employee, Student, Founder, Other]", "choices: [Student, Employee, Founder, Other]"), FORK[1]));
const appended = buildModel(surveyOf(FORK[0], `${FORK[1]}
  - label: New question?
    required: false
    choices: [One, Two]
`));

describe("positional-id lock", () => {
  it("records section, text, type and ordered choices of every id", () => {
    const lock = buildLock(model);
    expect(lock.launched).toBe(false);
    expect(lock.questions["pa-q-1"]).toEqual({ section: "pa", label: "Job?", multiple: false, choices: ["Employee", "Student", "Founder", "Other"] });
    expect(checkLock(lock, model)).toEqual({ ok: true, changed: [], removed: [], added: [] });
  });

  it("only reports differences before launch", () => {
    const status = checkLock(buildLock(model, false), reordered);
    expect(status.ok).toBe(true);
    expect(status.changed).toEqual(["pa-q-1: choices (first difference at index 0)"]);
  });

  it("fails on any change to an existing id after launch", () => {
    const status = checkLock(buildLock(model, true), reordered);
    expect(status.ok).toBe(false);
    expect(status.changed).toEqual(["pa-q-1: choices (first difference at index 0)"]);
  });

  it("after launch, --update locks new ids but refuses changed ones", () => {
    const launched = buildLock(model, true);
    expect(checkLock(launched, appended).ok).toBe(false);
    const { lock, refused } = updateLock(launched, appended);
    expect(refused).toEqual([]);
    expect(Object.keys(lock!.questions)).toContain("qb-q-4");
    expect(checkLock(lock!, appended).ok).toBe(true);
    expect(updateLock(launched, reordered)).toEqual({ refused: ["pa-q-1: choices (first difference at index 0)"] });
  });
});
