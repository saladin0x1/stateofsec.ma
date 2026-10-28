import { describe, expect, it } from "vitest";
import { explore } from "./explore";
import { buildModel } from "./model";
import { compileSpec, parseSpec } from "./spec";
import { FORK, modelAndSpec, surveyOf, UNSAFE_UNANSWERED } from "./test-fixtures";

const model = buildModel(surveyOf(...FORK));
const header = `
review: { status: pending, reviewers: [] }
questions:
  age: { id: pa-q-0, label: "Age?" }
  job: { id: pa-q-1, label: "Job?" }
  tools: { id: qb-q-1, label: "Tools?" }
`;
const errorsOf = (text: string) => compileSpec(model, parseSpec(text)).errors.map(e => e.message);

describe("spec compilation", () => {
  it("resolves aliases and choice texts", () => {
    const spec = compileSpec(model, parseSpec(`${header}
invariants:
  - name: Minors skip the job question
    when: { age: [Minor], job: { not: [Founder] } }
    hidden: [tools]
`));
    expect(spec.errors).toEqual([]);
    expect(spec.obligations).toHaveLength(1);
    expect(spec.obligations[0].when).toEqual([
      { guard: 0, values: new Set([0]), negate: false },
      { guard: 1, values: new Set([2]), negate: true }
    ]);
  });

  it("refuses a question whose text no longer matches its id (the survey moved)", () => {
    expect(errorsOf(`
review: { status: pending, reviewers: [] }
questions:
  age: { id: pa-q-1, label: "Age?" }
invariants: []
`)[0]).toContain("review the spec");
  });

  it("refuses unknown aliases, unknown choice texts and conditions on later answers", () => {
    const errors = errorsOf(`${header}
invariants:
  - name: Unknown alias
    hidden: [salary]
  - name: Unknown text
    when: { age: [Teen] }
    hidden: [job]
  - name: Condition after the question
    when: { job: [Student] }
    hidden: [age]
  - name: Multi-select in a condition
    when: { tools: [Proxy] }
    hidden: [job]
`);
    expect(errors).toEqual(expect.arrayContaining([
      "unknown question alias \"salary\"",
      "pa-q-0 has no choice \"Teen\"",
      "\"when\" tests pa-q-1, which does not come before pa-q-0",
      "\"when\" tests tools, a multi-select question"
    ]));
  });

  it("rejects unknown keys (a typo must not pass silently)", () => {
    expect(() => parseSpec(`${header}
invariants:
  - name: Typo
    hiden: [job]
`)).toThrow();
  });
});

describe("spec scopes", () => {
  it("\"all\" sees the answer sets the server accepts with a required answer missing; \"complete\" does not", () => {
    const spec = (scope: string) => `
review: { status: pending, reviewers: [] }
questions:
  after: { id: pa-q-1, label: "After school?" }
  plans: { id: pa-q-2, label: "Plans abroad?" }
invariants:
  - name: Exactly one outlook question
    scope: ${scope}
    exactlyOne: [after, plans]
`;
    const all = modelAndSpec(UNSAFE_UNANSWERED, spec("all"));
    const complete = modelAndSpec(UNSAFE_UNANSWERED, spec("complete"));
    const violation = explore(all.model, all.spec).findings.find(f => f.check === "spec-violation");
    expect(violation?.witness).toEqual({});
    expect(explore(complete.model, complete.spec).findings).toEqual([]);
  });
});
