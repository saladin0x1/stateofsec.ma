import type { Model, SectionInput, Verdict } from "./smt";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildModel,
  loadSurvey,
  normalize,
  parseSections,
  propertyQueries,
  smt,
  solve,
  structuralQueries,
  verifySurvey,
  z3Version
} from "./smt";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hasZ3 = z3Version() !== undefined;

function survey(questions: SectionInput["questions"]): Model {
  return buildModel(parseSections([{ title: "Fixture", label: "s", position: 1, questions }]));
}

function check(model: Model): Map<string, Verdict> {
  return new Map(solve(model, structuralQueries(model)).map(verdict => [verdict.id, verdict]));
}

/** Solves one ad-hoc goal; questions before the latest target are complete */
function ask(model: Model, goal: string, targets: string[]): Verdict {
  const questions = targets.map(id => model.byId.get(id)!);
  return solve(model, [{ id: "ask", kind: "property", targets: questions, goal, expected: "unsat" }])[0];
}

const q = (model: Model, id: string) => model.byId.get(id)!;

describe("encoder input checks", () => {
  const sections = (questions: SectionInput["questions"]) =>
    parseSections([{ title: "Fixture", label: "s", position: 1, questions }]);

  it("rejects a condition on a later question or on itself", () => {
    expect(() => normalize(sections([
      { label: "First", showIf: { question: "s-q-1", equals: 0 }, choices: ["A", "B"] },
      { label: "Second", choices: ["A", "B"] }
    ]))).toThrow("s-q-1, which is not an earlier question");
    expect(() => normalize(sections([
      { label: "Self", showIf: { question: "s-q-0", equals: 0 }, choices: ["A", "B"] }
    ]))).toThrow("not an earlier question");
  });

  it("rejects a condition on a multiple-choice question", () => {
    expect(() => normalize(sections([
      { label: "Many", multiple: true, choices: ["A", "B"] },
      { label: "Guarded", showIf: { question: "s-q-0", in: [0] }, choices: ["A", "B"] }
    ]))).toThrow("multiple-choice");
  });

  it("rejects choice names that match no choice", () => {
    expect(() => normalize(sections([
      { label: "Age", choices: ["A", "B"] },
      { label: "Typo", choices: ["X", "Y"], optionShowIf: [{ options: ["Z"], showIf: { question: "s-q-0", equals: 0 } }] }
    ]))).toThrow("\"Z\", which is not one of its choices");
    expect(() => normalize(sections([{ label: "Typo", multiple: true, choices: ["X", "Y"], exclusive: ["None"] }])))
      .toThrow("not one of its choices");
  });

  it("rejects a leaf with two operators", () => {
    expect(() => sections([
      { label: "Age", choices: ["A", "B"] },
      { label: "Both", showIf: { question: "s-q-0", equals: 0, notEquals: 1 }, choices: ["A", "B"] }
    ])).toThrow("exactly one of");
  });

  it("orders sections by position and numbers questions within each", () => {
    const model = buildModel(parseSections([
      { title: "Later", label: "later", position: 2, questions: [{ label: "L0", choices: ["A", "B"] }] },
      { title: "First", label: "first", position: 1, questions: [{ label: "F0", choices: ["A", "B"] }, { label: "F1", choices: ["A", "B"] }] }
    ]));
    expect(model.questions.map(question => [question.id, question.order])).toEqual([["first-q-0", 0], ["first-q-1", 1], ["later-q-0", 2]]);
  });

  it("encodes leaves as false on a hidden or unanswered guard", () => {
    const model = survey([
      { label: "Age", choices: ["A", "B"] },
      { label: "Guarded", showIf: { question: "s-q-0", notIn: [0] }, choices: ["A", "B"] }
    ]);
    expect(model.preamble).toContain("(define-fun |vis:s-q-1| () Bool (and |vis:s-q-0| (>= |a:s-q-0| 0) (not (= |a:s-q-0| 0))))");
    expect(model.preamble).toContain("(assert (=> (not |vis:s-q-1|) (= |a:s-q-1| -1)))");
  });
});

// Each test runs z3: well under a second alone, several seconds on a loaded runner
describe.skipIf(!hasZ3)("solver on fixtures with known answers", { timeout: 60_000 }, () => {
  it("finds a planted dead question, a dead option and a one-choice question", () => {
    const model = survey([
      { label: "Age", required: true, choices: ["Minor", "Adult", "Senior"] },
      {
        label: "Job",
        required: true,
        showIf: { question: "s-q-0", notEquals: 0 },
        choices: ["None", "Some", "Lots"],
        optionShowIf: [{ options: ["Lots"], showIf: { question: "s-q-0", equals: 2 } }]
      },
      // Planted: minors never see s-q-1, so its leaf is false for them
      {
        label: "Dead question",
        showIf: { all: [{ question: "s-q-0", equals: 0 }, { question: "s-q-1", in: [0, 1] }] },
        choices: ["A", "B"]
      },
      {
        label: "Dead option",
        showIf: { question: "s-q-0", equals: 1 },
        choices: ["A", "B", "C"],
        optionShowIf: [{ options: ["C"], showIf: { question: "s-q-0", equals: 2 } }]
      },
      {
        label: "Narrow",
        showIf: { question: "s-q-1", notEquals: 0 },
        choices: ["X", "Y"],
        optionShowIf: [{ options: ["Y"], showIf: { question: "s-q-0", equals: 2 } }]
      }
    ]);
    const verdicts = check(model);

    expect([...verdicts.values()].filter(v => v.status === "problem").map(v => v.id)).toEqual([
      "question-visible:s-q-2",
      "option-pickable:s-q-2:0",
      "option-pickable:s-q-2:1",
      "option-pickable:s-q-3:2",
      "fewer-than-2-options:s-q-4"
    ]);
    expect(verdicts.get("question-visible:s-q-2")?.result).toBe("unsat");
    expect(verdicts.get("option-pickable:s-q-1:2")?.witness).toEqual({ "s-q-0": 2, "s-q-1": 2 });
    expect(verdicts.get("fewer-than-2-options:s-q-4")?.witness).toMatchObject({ "s-q-0": 1, "s-q-1": 1 });
    expect(verdicts.get("submission:complete")?.result).toBe("sat");
  });

  it("treats an unanswered guard as false for every operator", () => {
    const model = survey([
      { label: "Optional", choices: ["A", "B"] },
      { label: "notEquals", showIf: { question: "s-q-0", notEquals: 0 }, choices: ["A", "B"] },
      { label: "notIn", showIf: { question: "s-q-0", notIn: [0] }, choices: ["A", "B"] },
      { label: "Either", showIf: { any: [{ question: "s-q-0", equals: 0 }, { question: "s-q-0", notEquals: 0 }] }, choices: ["A", "B"] }
    ]);
    const unanswered = `(= ${smt.answer(q(model, "s-q-0"))} -1)`;
    expect(ask(model, `(and ${unanswered} ${smt.visible(q(model, "s-q-1"))})`, ["s-q-1"]).result).toBe("unsat");
    expect(ask(model, `(and ${unanswered} ${smt.visible(q(model, "s-q-2"))})`, ["s-q-2"]).result).toBe("unsat");
    expect(check(model).get("question-visible:s-q-1")?.witness).toMatchObject({ "s-q-0": 1 });
    // "Either" is visible exactly when s-q-0 is answered, so skipping s-q-0 hides it
    expect(ask(model, `(not ${smt.visible(q(model, "s-q-3"))})`, ["s-q-3"]).witness).toEqual({});
  });

  it("makes a visible required question answered before later targets", () => {
    const model = survey([
      { label: "Required", required: true, choices: ["A", "B"] },
      { label: "Either", showIf: { any: [{ question: "s-q-0", equals: 0 }, { question: "s-q-0", notEquals: 0 }] }, choices: ["A", "B"] }
    ]);
    expect(ask(model, `(not ${smt.visible(q(model, "s-q-1"))})`, ["s-q-1"]).result).toBe("unsat");
    // The target itself is not forced: s-q-0 may still be unanswered when it is the latest target
    expect(ask(model, `(= ${smt.answer(q(model, "s-q-0"))} -1)`, ["s-q-0"]).result).toBe("sat");
  });

  it("does not let a required question with no choice left mask its own check", () => {
    const model = survey([
      { label: "Age", required: true, choices: ["A", "B"] },
      {
        label: "Stuck",
        required: true,
        showIf: { question: "s-q-0", equals: 0 },
        choices: ["X"],
        optionShowIf: [{ options: ["X"], showIf: { question: "s-q-0", equals: 1 } }]
      }
    ]);
    const verdicts = check(model);
    expect(verdicts.get("fewer-than-2-options:s-q-1")?.witness).toEqual({ "s-q-0": 0 });
    expect(verdicts.get("option-pickable:s-q-1:0")?.result).toBe("unsat");
    expect(verdicts.get("submission:complete")?.witness).toEqual({ "s-q-0": 1 });
  });

  it("cascades hiding: a hidden question's answer does not exist", () => {
    const model = survey([
      { label: "Age", required: true, choices: ["Young", "Old"] },
      { label: "Old only", required: true, showIf: { question: "s-q-0", equals: 1 }, choices: ["X", "Y"] },
      { label: "After old only", showIf: { question: "s-q-1", notEquals: 5 }, choices: ["A", "B"] }
    ]);
    const [age, oldOnly, after] = ["s-q-0", "s-q-1", "s-q-2"].map(id => q(model, id));
    expect(ask(model, `(and (not ${smt.visible(oldOnly)}) (>= ${smt.answer(oldOnly)} 0))`, ["s-q-1"]).result).toBe("unsat");
    expect(ask(model, `(and (= ${smt.answer(age)} 0) ${smt.visible(after)})`, ["s-q-2"]).result).toBe("unsat");
    expect(check(model).get("question-visible:s-q-2")?.witness).toMatchObject({ "s-q-0": 1 });
  });

  it("requires every optionShowIf rule naming a choice, and only lets visible choices be picked", () => {
    const model = survey([
      { label: "Pick", required: true, choices: ["A", "B", "C"] },
      {
        label: "Two rules",
        choices: ["X", "Y", "Z"],
        optionShowIf: [
          { options: ["Z"], showIf: { question: "s-q-0", in: [0, 1] } },
          { options: ["Z"], showIf: { question: "s-q-0", in: [1, 2] } }
        ]
      }
    ]);
    const [pick, rules] = ["s-q-0", "s-q-1"].map(id => q(model, id));
    expect(check(model).get("option-pickable:s-q-1:2")?.witness).toMatchObject({ "s-q-0": 1, "s-q-1": 2 });
    for (const other of [0, 2])
      expect(ask(model, `(and (= ${smt.answer(pick)} ${other}) ${smt.optionVisible(rules, 2)})`, ["s-q-1"]).result).toBe("unsat");
    expect(ask(model, `(and (= ${smt.answer(pick)} 0) (= ${smt.answer(rules)} 2))`, ["s-q-1"]).result).toBe("unsat");
  });

  it("never combines an exclusive choice with another one", () => {
    const model = survey([
      { label: "Certs", required: true, multiple: true, choices: ["None yet", "A", "B"], exclusive: ["None yet"] }
    ]);
    const certs = q(model, "s-q-0");
    expect(ask(model, `(and ${smt.picked(certs, 0)} ${smt.picked(certs, 1)})`, ["s-q-0"]).result).toBe("unsat");
    expect(ask(model, `(and ${smt.picked(certs, 1)} ${smt.picked(certs, 2)})`, ["s-q-0"]).result).toBe("sat");
    expect(check(model).get("option-pickable:s-q-0:0")?.result).toBe("sat");
  });

  it("never hides a choice for a soft check, and reports one that cannot fire", () => {
    const model = survey([
      { label: "Age", required: true, choices: ["Young", "Old"] },
      {
        label: "Status",
        required: true,
        choices: ["Student", "Founder", "Rare"],
        optionShowIf: [{ options: ["Rare"], showIf: { question: "s-q-0", equals: 1 } }],
        softChecks: [
          { options: ["Founder"], when: { question: "s-q-0", equals: 0 }, message: "Young founder?" },
          { options: ["Rare"], when: { question: "s-q-0", equals: 0 }, message: "Never shown" }
        ]
      }
    ]);
    const verdicts = check(model);
    expect(verdicts.get("soft-check-reachable:s-q-1:0")?.witness).toEqual({ "s-q-0": 0, "s-q-1": 1 });
    expect(verdicts.get("soft-check-reachable:s-q-1:1")).toMatchObject({ result: "unsat", status: "problem" });
  });

  it.skipIf(!hasZ3)("fires a soft check without a condition on any pick of its options", () => {
    const model = survey([
      { label: "Rate", required: true, choices: ["Low", "High"], softChecks: [{ options: ["High"], message: "Per day?" }] }
    ]);
    expect(check(model).get("soft-check-reachable:s-q-0:0")).toMatchObject({ result: "sat", status: "ok" });
  });
});

describe("survey verdict file", { timeout: 60_000 }, () => {
  const committed = JSON.parse(readFileSync(path.join(root, "scripts/verify/smt-verdicts.json"), "utf8")) as {
    verdicts: Verdict[];
  };

  it("finds every property's questions by label", () => {
    const model = buildModel(loadSurvey(path.join(root, "survey")));
    const ids = propertyQueries(model).map(query => query.id);
    expect(ids).toContain("property:exactly-one-outlook:none:work-q-16+work-q-17+work-q-18");
    expect(ids.filter(id => id.startsWith("property:at-most-one-income:"))).toHaveLength(6);
  });

  it.skipIf(!hasZ3)("matches a fresh run (run pnpm verify-smt after changing the survey)", () => {
    const { verdicts } = verifySurvey(loadSurvey(path.join(root, "survey")));
    const summary = (list: Verdict[]) => list.map(v => `${v.id} expected=${v.expected} result=${v.result}`);
    expect(summary(committed.verdicts)).toEqual(summary(verdicts));
  });
});
