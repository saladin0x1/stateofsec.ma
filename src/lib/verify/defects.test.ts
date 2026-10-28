import { describe, expect, it } from "vitest";
import { crossCheck } from "./brute";
import { buildModel } from "./model";
import { compileSpec, EMPTY_SPEC, parseSpec } from "./spec";
import { surveyOf } from "./test-fixtures";
import { verifySurvey } from "./verify";

// Seeded defects: each survey carries one mistake a YAML author can make, and the checker
// must report it (and, where it explores, agree with brute force about it)

function profile(body: string) {
  return `
title: Profile
label: pa
position: 1
questions:
  - label: Age?
    required: true
    choices: [Younger than 18, 18 to 24, 25 to 34, 35 or older]
${body}`;
}

function findings(texts: string[], specText?: string) {
  const result = verifySurvey({ sections: surveyOf(...texts), specText });
  return result.findings.map(f => `${f.check}: ${f.subject}`);
}

function agreesWithBruteForce(texts: string[], specText?: string) {
  const model = buildModel(surveyOf(...texts));
  const spec = specText === undefined ? EMPTY_SPEC : compileSpec(model, parseSpec(specText));
  return crossCheck(model, spec);
}

const EXPERIENCE_SPEC = `
review: { status: pending, reviewers: [] }
questions:
  age: { id: pa-q-0, label: "Age?" }
  experience: { id: pa-q-1, label: "Years?" }
invariants:
  - name: 18-24 never offered 7+ years
    when: { age: [18 to 24] }
    hiddenOptions: { experience: [7+ years] }
`;

describe("seeded defects", () => {
  it("dead question: contradictory conditions", () => {
    const texts = [profile(`
  - label: Never shown?
    required: false
    showIf:
      all:
        - { question: pa-q-0, equals: 0 }
        - { question: pa-q-0, equals: 1 }
    choices: [A, B]
`)];
    expect(findings(texts)).toContain("dead-question: pa-q-1");
    expect(agreesWithBruteForce(texts)).toEqual([]);
  });

  it("shifted index: the rule hides 7+ years for 25-34 instead of 18-24 (caught by the spec, by text)", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    choices: [None, 1-2 years, 3-6 years, 7+ years]
    optionShowIf:
      - options: [7+ years]
        showIf: { question: pa-q-0, notEquals: 2 }
`)];
    expect(findings(texts, EXPERIENCE_SPEC)).toContain("spec-violation: 18-24 never offered 7+ years: experience option \"7+ years\"");
    expect(agreesWithBruteForce(texts, EXPERIENCE_SPEC)).toEqual([]);
    // The same rule with the right index passes
    const fixed = [texts[0].replace("notEquals: 2", "notEquals: 1")];
    expect(findings(fixed, EXPERIENCE_SPEC)).toEqual([]);
  });

  it("shifted index past the end of the list", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    showIf: { question: pa-q-0, notEquals: 4 }
    choices: [None, Some]
`)];
    expect(findings(texts)).toContain("index-out-of-range: pa-q-1 showIf (pa-q-0 notEquals 4)");
  });

  it("label split by a YAML comma: the rule names no choice and hides nothing", () => {
    const texts = [profile(`
  - label: How did you learn?
    required: true
    multiple: true
    choices: ["University, engineering school or CPGE", Self-study, Labs]
    optionShowIf:
      - options: [University, engineering school or CPGE]
        showIf: { question: pa-q-0, notEquals: 0 }
`)];
    const found = findings(texts);
    expect(found).toContain("unknown-label: pa-q-1 optionShowIf #1");
    // The precondition stops the exploration: its result would not mean anything
    expect(verifySurvey({ sections: surveyOf(...texts) }).exploration).toBeUndefined();
  });

  it("unreachable soft check: it tests minors on a question minors never see", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [None, 1-2 years, 3-6 years, 7+ years]
    softChecks:
      - options: [7+ years]
        when: { question: pa-q-0, equals: 0 }
        message: Rare for minors. Is that right?
`)];
    expect(findings(texts)).toContain("soft-check-never-fires: pa-q-1 soft check #1");
    expect(agreesWithBruteForce(texts)).toEqual([]);
  });

  it("soft check shadowed by an earlier one on the same choice", () => {
    const texts = [profile(`
  - label: Job?
    required: true
    choices: [Employee, Founder]
    softChecks:
      - options: [Founder]
        message: Founders are rare. Is that right?
      - options: [Founder]
        when: { question: pa-q-0, equals: 1 }
        message: Young founders are rare. Is that right?
`)];
    expect(findings(texts)).toContain("soft-check-never-fires: pa-q-1 soft check #2");
  });

  it("dead option and a rule that never shows", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [None, Some, Many]
    optionShowIf:
      - options: [Many]
        showIf: { question: pa-q-0, equals: 0 }
`)];
    const found = findings(texts);
    expect(found).toContain("dead-option: pa-q-1 option \"Many\"");
    expect(found).toContain("rule-never-shows: pa-q-1 optionShowIf #1");
    expect(found).toContain("constant-leaf: pa-q-1 optionShowIf #1 (pa-q-0 equals 0)");
  });

  it("a rule that never hides", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [None, Some, Many]
    optionShowIf:
      - options: [Many]
        showIf: { question: pa-q-0, notEquals: 0 }
`)];
    expect(findings(texts)).toContain("rule-never-hides: pa-q-1 optionShowIf #1");
  });

  it("a question left with one choice, and a multi-select left with only exclusive choices", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    choices: [None, Some]
    optionShowIf:
      - options: [Some]
        showIf: { question: pa-q-0, notEquals: 0 }
  - label: Certs?
    required: false
    multiple: true
    choices: [None yet, CEH, OSCP]
    exclusive: [None yet]
    optionShowIf:
      - options: [CEH, OSCP]
        showIf: { question: pa-q-0, in: [2, 3] }
`)];
    const found = findings(texts);
    expect(found).toContain("too-few-options: pa-q-1");
    expect(found).toContain("no-regular-option: pa-q-2");
    expect(agreesWithBruteForce(texts)).toEqual([]);
  });

  it("a condition that reads a later question or a multi-select answer", () => {
    const texts = [profile(`
  - label: Tools?
    required: true
    multiple: true
    choices: [A, B]
  - label: Uses A?
    required: false
    showIf: { question: pa-q-1, equals: 0 }
    choices: ["Yes", "No"]
  - label: Early?
    required: false
    showIf: { question: pa-q-4, equals: 0 }
    choices: ["Yes", "No"]
  - label: Last?
    required: false
    choices: ["Yes", "No"]
`)];
    const found = findings(texts);
    expect(found).toContain("bad-reference: pa-q-2 showIf (pa-q-1 equals 0)");
    expect(found).toContain("bad-reference: pa-q-3 showIf (pa-q-4 equals 0)");
  });

  it("a spec invariant that applies to nobody is reported as vacuous", () => {
    const texts = [profile(`
  - label: Years?
    required: true
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [None, 1-2 years, 3-6 years, 7+ years]
`)];
    const spec = `
review: { status: pending, reviewers: [] }
questions:
  age: { id: pa-q-0, label: "Age?" }
  experience: { id: pa-q-1, label: "Years?" }
invariants:
  - name: Minors never offered 7+ years
    when: { age: [Younger than 18] }
    hiddenOptions: { experience: [7+ years] }
`;
    expect(findings(texts, spec)).toEqual(["spec-vacuous: Minors never offered 7+ years: experience option \"7+ years\""]);
  });
});
