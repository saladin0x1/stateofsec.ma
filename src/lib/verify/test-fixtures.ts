// Small surveys for the checker's tests (not a test file itself)
import type { SurveySections } from "./model";
import type { CompiledSpec } from "./spec";
import { parseSurvey } from "./load";
import { buildModel } from "./model";
import { compileSpec, EMPTY_SPEC, parseSpec } from "./spec";

export function surveyOf(...texts: string[]): SurveySections {
  return parseSurvey(texts.map((text, i) => ({ name: `fixture-${i + 1}.yml`, text })));
}

export function modelAndSpec(texts: string[], specText?: string): { model: ReturnType<typeof buildModel>; spec: CompiledSpec } {
  const model = buildModel(surveyOf(...texts));
  const spec = specText === undefined ? EMPTY_SPEC : compileSpec(model, parseSpec(specText));
  if (spec.errors.length)
    throw new Error(`Fixture spec does not compile: ${JSON.stringify(spec.errors)}`);
  return { model, spec };
}

// Two sections exercising every engine feature: showIf with all / any, optionShowIf on a
// guard and on a multi-select, soft checks (one shadowing another), exclusive, "Other"
export const FORK = [`
title: Profile
label: pa
position: 1
questions:
  - label: Age?
    required: true
    choices: [Minor, Young, Adult, Senior]
  - label: Job?
    required: true
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [Employee, Student, Founder, Other]
    optionShowIf:
      - options: [Founder]
        showIf: { question: pa-q-0, in: [2, 3] }
    softChecks:
      - options: [Student]
        when: { question: pa-q-0, equals: 3 }
        message: Students over 50 are rare. Is that right?
      - options: [Founder, Student]
        when: { question: pa-q-0, equals: 2 }
        message: Rare for adults. Is that right?
  - label: Pay?
    required: false
    showIf:
      all:
        - { question: pa-q-1, in: [0, 2, 3] }
        - { question: pa-q-0, notEquals: 1 }
    choices: [None, Low, High, Prefer not to say]
    optionShowIf:
      - options: [None]
        showIf: { question: pa-q-1, notEquals: 0 }
`, `
title: Plans
label: qb
position: 2
questions:
  - label: Plans?
    required: false
    choices: [Stay, Leave, Unsure]
  - label: Tools?
    required: true
    multiple: true
    choices: [Scanner, Proxy, None of these]
    exclusive: [None of these]
    optionShowIf:
      - options: [Proxy]
        showIf:
          any:
            - { question: qb-q-0, notEquals: 1 }
            - { question: pa-q-0, equals: 3 }
  - label: Coming back?
    required: false
    showIf: { question: qb-q-0, equals: 1 }
    choices: ["Yes", "No"]
  - label: After studies?
    required: false
    showIf:
      any:
        - { question: pa-q-0, equals: 0 }
        - { question: pa-q-1, equals: 1 }
    choices: [Here, Abroad]
`];

export const FORK_SPEC = `
review: { status: pending, reviewers: [] }
questions:
  age: { id: pa-q-0, label: "Age?" }
  job: { id: pa-q-1, label: "Job?" }
  pay: { id: pa-q-2, label: "Pay?" }
  plans: { id: qb-q-0, label: "Plans?" }
  tools: { id: qb-q-1, label: "Tools?" }
  back: { id: qb-q-2, label: "Coming back?" }
  after: { id: qb-q-3, label: "After studies?" }
profileLeaf: [age]
invariants:
  - name: Minors skip the job question
    when: { age: [Minor] }
    hidden: [job]
  - name: Young respondents are never offered founder
    when: { age: [Young] }
    hiddenOptions: { job: [Founder] }
  - name: Seniors confirm student
    when: { age: [Senior] }
    softCheck: { question: job, options: [Student], fires: true }
  - name: Nobody sees both outlook questions
    atMostOne: [back, after]
  - name: Employees see the pay question
    when: { job: [Employee] }
    visible: [pay]
  - name: Seniors are always offered the proxy
    when: { age: [Senior] }
    visibleOptions: { tools: [Proxy] }
`;

// The earlier throwaway checker merged choices on condition leaves only and stood each class
// for its first member even when that member was hidden. Here "Lead" and "Junior" agree on
// every leaf, so they merge, but "Lead" is hidden for the young: the young "Junior" path,
// the only one where "Manage?" stays hidden for a complete answer set, is lost
export const UNSAFE_REPRESENTATIVE = [`
title: Profile
label: pa
position: 1
questions:
  - label: Age?
    required: true
    choices: [Young, Older]
  - label: Level?
    required: true
    choices: [Lead, Junior, Head]
    optionShowIf:
      - options: [Lead]
        showIf: { question: pa-q-0, equals: 1 }
  - label: Manage?
    required: false
    showIf: { question: pa-q-1, equals: 2 }
    choices: [Few, Many]
`];

// Without a no-answer class for required guards, the state the server accepts with "Study?"
// unanswered (both outlook questions hidden) is never explored, so the "exactly one" breach
// that only this state shows goes unreported
export const UNSAFE_UNANSWERED = [`
title: Profile
label: pa
position: 1
questions:
  - label: Study?
    required: true
    choices: [School, Work]
  - label: After school?
    required: false
    showIf: { question: pa-q-0, notEquals: 1 }
    choices: [Here, Abroad]
  - label: Plans abroad?
    required: false
    showIf: { question: pa-q-0, notEquals: 0 }
    choices: [Soon, Later]
`];

export const UNSAFE_UNANSWERED_SPEC = `
review: { status: pending, reviewers: [] }
questions:
  after: { id: pa-q-1, label: "After school?" }
  plans: { id: pa-q-2, label: "Plans abroad?" }
invariants:
  - name: Exactly one outlook question
    exactlyOne: [after, plans]
`;
