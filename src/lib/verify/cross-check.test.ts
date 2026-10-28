import type { SurveyQuestionsYamlFile } from "../validators/survey-schema";
import fc from "fast-check";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { validateSurveyFile } from "../validators/survey-schema";
import { bruteForce, crossCheck } from "./brute";
import { explore } from "./explore";
import { buildModel, checkStructure } from "./model";
import { compileSpec, parseSpec } from "./spec";
import { FORK, FORK_SPEC, modelAndSpec, UNSAFE_REPRESENTATIVE, UNSAFE_UNANSWERED, UNSAFE_UNANSWERED_SPEC } from "./test-fixtures";

describe("quotient checker vs brute force on fixtures", () => {
  it("agrees on every observation, finding and path statistic (fork fixture with spec)", () => {
    const { model, spec } = modelAndSpec(FORK, FORK_SPEC);
    const brute = bruteForce(model, spec);
    expect(crossCheck(model, spec, {}, brute)).toEqual([]);
    const quotient = explore(model, spec);
    const ids = quotient.findings.map(f => `${f.check}: ${f.subject}`);
    // A young employee never sees the pay question, which the spec claims they do
    expect(ids).toContain("spec-violation: Employees see the pay question: pay");
    expect(brute.combinations).toBeGreaterThan(quotient.classStates.all);
  }, 60_000);

  it("agrees on the fixtures written against the earlier unsound shapes", () => {
    const rep = modelAndSpec(UNSAFE_REPRESENTATIVE);
    expect(crossCheck(rep.model, rep.spec)).toEqual([]);
    const unanswered = modelAndSpec(UNSAFE_UNANSWERED, UNSAFE_UNANSWERED_SPEC);
    expect(crossCheck(unanswered.model, unanswered.spec)).toEqual([]);
    expect(explore(unanswered.model, unanswered.spec).findings.map(f => f.check)).toContain("spec-violation");
  });

  it("catches an unsound partition: classes on leaves only, first member as representative", () => {
    const { model, spec } = modelAndSpec(UNSAFE_REPRESENTATIVE);
    expect(crossCheck(model, spec, { partition: "unsafe-leaves-only" }).length).toBeGreaterThan(0);
  });

  it("catches a missing no-answer class for required guards", () => {
    const { model, spec } = modelAndSpec(UNSAFE_UNANSWERED, UNSAFE_UNANSWERED_SPEC);
    const disagreements = crossCheck(model, spec, { unanswered: "optional-only" });
    expect(disagreements).toContain("finding only in brute force (merged): spec-violation Exactly one outlook question: exactlyOne [after, plans]");
  });
});

// Random small surveys: every engine feature, conditions on random earlier answers, and a
// random spec written by choice text. Deterministic (seeded), so a failure reproduces
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Generated {
  sections: SurveyQuestionsYamlFile[];
  specText: string;
}

function randomSurvey(seed: number): Generated {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(items: T[]): T => items[int(items.length)];
  const subset = <T>(items: T[]): T[] => {
    const chosen = items.filter(() => rnd() < 0.5);
    return chosen.length ? chosen : [pick(items)];
  };
  const known: Array<{ id: string; label: string; multiple: boolean; choices: string[]; section: number }> = [];
  const leaf = (pool: typeof known) => {
    const g = pick(pool);
    const op = pick(["equals", "notEquals", "in", "notIn"] as const);
    const indices = g.choices.map((_, i) => i);
    return op === "equals" || op === "notEquals" ? { question: g.id, [op]: pick(indices) } : { question: g.id, [op]: subset(indices) };
  };
  const condition = (pool: typeof known) =>
    (rnd() < 0.6 ? leaf(pool) : { [pick(["all", "any"])]: [leaf(pool), leaf(pool)] });

  const sections = ["sa", "sb"].map((label, s) => {
    const questions: Array<Record<string, unknown>> = [];
    const count = s === 0 ? 1 + int(3) : 1 + int(2);
    for (let i = 0; i < count; i++) {
      const id = `${label}-q-${i}`;
      const singles = known.filter(q => !q.multiple);
      const multiple = known.length > 0 && rnd() < 0.2;
      const choices = ["Alpha", "Beta", "Gamma", "Delta"].slice(0, 2 + int(3));
      if (rnd() < 0.3)
        choices[choices.length - 1] = "Other";
      const q: Record<string, unknown> = { label: `Question ${id}?`, required: rnd() < 0.5, multiple, choices };
      if (singles.length && rnd() < 0.6)
        q.showIf = condition(singles);
      if (singles.length && rnd() < 0.5) {
        q.optionShowIf = Array.from({ length: 1 + int(2) }, () => ({ options: subset(choices), showIf: condition(singles) }));
      }
      if (!multiple && rnd() < 0.4) {
        q.softChecks = Array.from({ length: 1 + int(2) }, (_, k) => ({
          options: subset(choices),
          ...(singles.length && rnd() < 0.8 ? { when: condition(singles) } : {}),
          message: `Is that right (${k})?`
        }));
      }
      if (multiple && rnd() < 0.6)
        q.exclusive = [pick(choices)];
      questions.push(q);
      known.push({ id, label: q.label as string, multiple, choices, section: s });
    }
    if (!questions.some(q => q.required))
      questions[0].required = true;
    const section: Record<string, unknown> = { title: `Section ${label}`, label, position: s + 1, questions };
    const earlierSingles = known.filter(q => q.section === 0 && !q.multiple);
    if (s === 1 && earlierSingles.length && rnd() < 0.3)
      section.showIf = leaf(earlierSingles);
    return validateSurveyFile(section);
  });

  // Spec: aliases for every question, invariants by text with "when" on earlier answers
  const alias = (i: number) => `x${i}`;
  const when = (before: number) => {
    const pool = known.slice(0, before).filter(q => !q.multiple);
    if (!pool.length || rnd() < 0.3)
      return undefined;
    const atoms: Record<string, unknown> = {};
    for (const g of [pick(pool), pick(pool)].slice(0, 1 + int(2))) {
      const texts = subset(g.choices);
      atoms[alias(known.indexOf(g))] = rnd() < 0.3 ? { not: texts } : texts;
    }
    return atoms;
  };
  const invariants = Array.from({ length: int(4) }, (_, k) => {
    const target = int(known.length);
    const q = known[target];
    const inv: Record<string, unknown> = { name: `Invariant ${k}`, scope: pick(["all", "complete"]) };
    const kind = pick(["hidden", "visible", "hiddenOptions", "visibleOptions", "softCheck", "set"]);
    if (kind === "hidden" || kind === "visible") {
      inv[kind] = [alias(target)];
    }
    else if (kind === "hiddenOptions" || kind === "visibleOptions") {
      inv[kind] = { [alias(target)]: subset(q.choices) };
    }
    else if (kind === "softCheck" && !q.multiple) {
      inv.softCheck = { question: alias(target), options: subset(q.choices), fires: rnd() < 0.5 };
    }
    else {
      const other = int(known.length);
      if (other === target)
        return undefined;
      inv[pick(["exactlyOne", "atMostOne", "atLeastOne"])] = [alias(target), alias(other)];
      const w = when(Math.max(target, other));
      if (w)
        inv.when = w;
      return inv;
    }
    const w = when(target);
    if (w)
      inv.when = w;
    return inv;
  }).filter(Boolean);
  const spec = {
    review: { status: "pending", reviewers: [] },
    questions: Object.fromEntries(known.map((q, i) => [alias(i), { id: q.id, label: q.label }])),
    profileLeaf: known.filter(q => !q.multiple).slice(0, 1).map(q => alias(known.indexOf(q))),
    invariants
  };
  return { sections, specText: yaml.dump(spec) };
}

describe("quotient checker vs brute force on random surveys", () => {
  it("has 0 disagreements on every generated survey", () => {
    let explored = 0;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const { sections, specText } = randomSurvey(seed);
        const model = buildModel(sections);
        expect(checkStructure(model)).toEqual([]);
        const spec = compileSpec(model, parseSpec(specText));
        expect(spec.errors).toEqual([]);
        expect(crossCheck(model, spec)).toEqual([]);
        explored++;
      }),
      { numRuns: 150, seed: 20261027 }
    );
    expect(explored).toBe(150);
  }, 120_000);

  it("would have caught the unsound partition on random surveys too", () => {
    let caught = 0;
    for (let seed = 1; seed <= 150 && caught === 0; seed++) {
      const { sections, specText } = randomSurvey(seed);
      const model = buildModel(sections);
      const spec = compileSpec(model, parseSpec(specText));
      if (crossCheck(model, spec, { partition: "unsafe-leaves-only" }).length)
        caught++;
    }
    expect(caught).toBeGreaterThan(0);
  }, 120_000);
});
