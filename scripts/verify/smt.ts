/**
 * Independent SMT cross-check of the survey's branching logic, solved by the z3 CLI.
 *
 * The semantics come from docs/survey-system.md ("Conditions") only, not from the app's condition
 * code, so a disagreement between this checker and the app is a signal worth reading:
 * - a single-choice question holds one choice index or -1 (unanswered); a multiple-choice question
 *   holds a set of picks, which no condition can read
 * - a leaf condition (equals / notEquals / in / notIn) reads an EARLIER single-choice question and
 *   is false while that question is unanswered or hidden; `all` / `any` combine leaves
 * - a question is visible iff its showIf holds (always, without one); a hidden question has no answer
 * - each optionShowIf rule hides the choices it names unless its condition holds, so a choice named
 *   by several rules needs all of them; only a visible choice can be picked
 * - an exclusive choice is never picked together with another one; softChecks never hide anything
 * - a visible required question is answered before the respondent moves on, so every query asks
 *   this of the questions BEFORE its targets (the respondent reached that point), never of the
 *   targets or later questions: a later unanswerable question cannot mask an earlier problem
 *
 * Usage: pnpm verify-smt [--survey <dir>] [--out <file>]
 * Needs the z3 CLI on PATH (or Z3_BIN). Writes the verdicts as JSON and exits 1 when a query
 * disagrees with its expectation.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import yaml from "js-yaml";
import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// Survey input

const choiceIndexSchema = z.number().int().nonnegative();

const leafSchema = z.strictObject({
  question: z.string().min(1),
  equals: choiceIndexSchema.optional(),
  notEquals: choiceIndexSchema.optional(),
  in: z.array(choiceIndexSchema).optional(),
  notIn: z.array(choiceIndexSchema).optional()
}).refine(
  leaf => [leaf.equals, leaf.notEquals, leaf.in, leaf.notIn].filter(v => v !== undefined).length === 1,
  "a condition needs exactly one of equals, notEquals, in, notIn"
);

const conditionSchema = z.union([
  leafSchema,
  z.strictObject({ all: z.array(leafSchema).min(1) }),
  z.strictObject({ any: z.array(leafSchema).min(1) })
]);

const questionSchema = z.object({
  label: z.string().min(1),
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
  choices: z.array(z.string()).min(1),
  showIf: conditionSchema.optional(),
  optionShowIf: z.array(z.object({ options: z.array(z.string()).min(1), showIf: conditionSchema })).default([]),
  exclusive: z.array(z.string()).default([]),
  softChecks: z.array(z.object({
    options: z.array(z.string()).min(1),
    // Optional: without it the check fires on every pick of its options
    when: conditionSchema.optional(),
    message: z.string()
  })).default([])
});

const sectionSchema = z.object({
  title: z.string(),
  label: z.string().regex(/^[\w-]+$/),
  position: z.number(),
  questions: z.array(questionSchema)
});

export type Leaf = z.output<typeof leafSchema>;
export type Condition = z.output<typeof conditionSchema>;
export type SectionInput = z.input<typeof sectionSchema>;
export type Section = z.output<typeof sectionSchema>;

export function parseSections(raw: unknown[]): Section[] {
  return raw.map(section => sectionSchema.parse(section));
}

export function loadSurvey(dir: string): Section[] {
  const files = readdirSync(dir).filter(file => file.endsWith(".yml")).sort();
  return parseSections(files.map(file => yaml.load(readFileSync(path.join(dir, file), "utf8"))));
}

export interface Question {
  id: string;
  /** Position in the whole survey: sections by `position`, then questions in file order */
  order: number;
  label: string;
  required: boolean;
  multiple: boolean;
  choices: string[];
  showIf?: Condition;
  optionRules: { options: number[]; showIf: Condition }[];
  exclusive: number[];
  softChecks: { options: number[]; when?: Condition; message: string }[];
}

function leavesOf(condition: Condition): Leaf[] {
  if ("all" in condition)
    return condition.all;
  if ("any" in condition)
    return condition.any;
  return [condition];
}

/** Ids, choice names and references, with the structural checks the encoding relies on */
export function normalize(sections: Section[]): Question[] {
  const questions: Question[] = [];
  const byId = new Map<string, Question>();
  const ordered = [...sections].sort((a, b) => a.position - b.position);

  for (const section of ordered) {
    section.questions.forEach((raw, index) => {
      const id = `${section.label}-q-${index}`;
      if (byId.has(id))
        throw new Error(`${id}: duplicate question id (two sections share the label "${section.label}"?)`);

      const choiceIndex = (name: string, where: string) => {
        const k = raw.choices.indexOf(name);
        if (k < 0)
          throw new Error(`${id}: ${where} names "${name}", which is not one of its choices`);
        return k;
      };
      const checked = (condition: Condition, where: string) => {
        for (const leaf of leavesOf(condition)) {
          const target = byId.get(leaf.question);
          if (!target)
            throw new Error(`${id}: ${where} reads ${leaf.question}, which is not an earlier question`);
          if (target.multiple)
            throw new Error(`${id}: ${where} reads ${leaf.question}, which is multiple-choice`);
        }
        return condition;
      };

      const question: Question = {
        id,
        order: questions.length,
        label: raw.label,
        required: raw.required,
        multiple: raw.multiple,
        choices: raw.choices,
        showIf: raw.showIf && checked(raw.showIf, "showIf"),
        optionRules: raw.optionShowIf.map(rule => ({
          options: rule.options.map(name => choiceIndex(name, "optionShowIf")),
          showIf: checked(rule.showIf, "optionShowIf")
        })),
        exclusive: raw.exclusive.map(name => choiceIndex(name, "exclusive")),
        softChecks: raw.softChecks.map(check => ({
          options: check.options.map(name => choiceIndex(name, "softChecks")),
          when: check.when && checked(check.when, "softChecks"),
          message: check.message
        }))
      };
      questions.push(question);
      byId.set(id, question);
    });
  }
  return questions;
}

// ---------------------------------------------------------------------------------------------
// SMT-LIB2 encoding

function and(terms: string[]): string {
  if (terms.length === 0)
    return "true";
  return terms.length === 1 ? terms[0] : `(and ${terms.join(" ")})`;
}

function or(terms: string[]): string {
  if (terms.length === 0)
    return "false";
  return terms.length === 1 ? terms[0] : `(or ${terms.join(" ")})`;
}

/** SMT names of a question's parts (quoted symbols, so ids keep their dashes) */
export const smt = {
  /** Int: chosen index of a single-choice question, -1 when unanswered */
  answer: (q: Question) => `|a:${q.id}|`,
  /** Bool: choice k of a multiple-choice question is picked */
  picked: (q: Question, k: number) => `|pick:${q.id}:${k}|`,
  visible: (q: Question) => `|vis:${q.id}|`,
  optionVisible: (q: Question, k: number) => `|opt:${q.id}:${k}|`,
  /** Int: number of visible choices */
  shown: (q: Question) => `|shown:${q.id}|`,
  answered: (q: Question) => `|answered:${q.id}|`,
  /** Bool: a required question is answered once visible (true for optional ones) */
  done: (q: Question) => `|done:${q.id}|`,
  /** Bool term: choice k is the (single) answer, or one of the picks */
  picks: (q: Question, k: number) => (q.multiple ? smt.picked(q, k) : `(= ${smt.answer(q)} ${k})`)
};

export interface Model {
  questions: Question[];
  byId: Map<string, Question>;
  /** Declarations and the constraints every query shares */
  preamble: string;
  question: (labelOrPrefix: string) => Question;
  choice: (question: Question, label: string) => number;
  condition: (condition: Condition) => string;
}

export function buildModel(sections: Section[]): Model {
  const questions = normalize(sections);
  const byId = new Map(questions.map(q => [q.id, q]));

  const leafTerm = (leaf: Leaf): string => {
    const q = byId.get(leaf.question)!;
    const a = smt.answer(q);
    // False while the guard is hidden or unanswered, whatever the operator
    const guard = [smt.visible(q), `(>= ${a} 0)`];
    if (leaf.equals !== undefined)
      return and([...guard, `(= ${a} ${leaf.equals})`]);
    if (leaf.notEquals !== undefined)
      return and([...guard, `(not (= ${a} ${leaf.notEquals}))`]);
    if (leaf.in !== undefined)
      return and([...guard, or(leaf.in.map(v => `(= ${a} ${v})`))]);
    return and([...guard, ...(leaf.notIn ?? []).map(v => `(not (= ${a} ${v}))`)]);
  };
  const condition = (c: Condition): string => {
    if ("all" in c)
      return and(c.all.map(leafTerm));
    if ("any" in c)
      return or(c.any.map(leafTerm));
    return leafTerm(c);
  };

  const lines = ["(set-option :produce-models true)", "(set-logic QF_LIA)"];
  for (const q of questions) {
    const n = q.choices.length;
    const ks = q.choices.map((_, k) => k);
    lines.push("", `; ${q.id}: ${q.label.replace(/\s+/g, " ").slice(0, 100)}`);

    if (q.multiple)
      ks.forEach(k => lines.push(`(declare-const ${smt.picked(q, k)} Bool)`));
    else
      lines.push(`(declare-const ${smt.answer(q)} Int)`, `(assert (and (>= ${smt.answer(q)} -1) (<= ${smt.answer(q)} ${n - 1})))`);

    lines.push(`(define-fun ${smt.visible(q)} () Bool ${q.showIf ? condition(q.showIf) : "true"})`);
    for (const k of ks) {
      const rules = q.optionRules.filter(rule => rule.options.includes(k));
      lines.push(`(define-fun ${smt.optionVisible(q, k)} () Bool ${and(rules.map(rule => condition(rule.showIf)))})`);
    }
    const counts = ks.map(k => `(ite ${smt.optionVisible(q, k)} 1 0)`);
    lines.push(`(define-fun ${smt.shown(q)} () Int ${counts.length === 1 ? counts[0] : `(+ ${counts.join(" ")})`})`);
    lines.push(`(define-fun ${smt.answered(q)} () Bool ${q.multiple ? or(ks.map(k => smt.picked(q, k))) : `(>= ${smt.answer(q)} 0)`})`);
    lines.push(`(define-fun ${smt.done(q)} () Bool ${q.required ? `(=> ${smt.visible(q)} ${smt.answered(q)})` : "true"})`);

    if (q.multiple) {
      for (const k of ks)
        lines.push(`(assert (=> ${smt.picked(q, k)} (and ${smt.visible(q)} ${smt.optionVisible(q, k)})))`);
      for (const e of q.exclusive) {
        for (const k of ks.filter(k => k !== e))
          lines.push(`(assert (=> ${smt.picked(q, e)} (not ${smt.picked(q, k)})))`);
      }
    }
    else {
      lines.push(`(assert (=> (not ${smt.visible(q)}) (= ${smt.answer(q)} -1)))`);
      for (const k of ks)
        lines.push(`(assert (=> (= ${smt.answer(q)} ${k}) ${smt.optionVisible(q, k)}))`);
    }
  }

  const question = (labelOrPrefix: string) => {
    const exact = questions.filter(q => q.label === labelOrPrefix);
    const found = exact.length > 0 ? exact : questions.filter(q => q.label.startsWith(labelOrPrefix));
    if (found.length !== 1)
      throw new Error(`"${labelOrPrefix}" matches ${found.length} questions, expected exactly one`);
    return found[0];
  };
  const choice = (q: Question, label: string) => {
    const k = q.choices.indexOf(label);
    if (k < 0)
      throw new Error(`${q.id} has no choice "${label}"`);
    return k;
  };

  return { questions, byId, preamble: lines.join("\n"), question, choice, condition };
}

// ---------------------------------------------------------------------------------------------
// Queries

export type QueryKind
  = | "submission"
    | "question-visible"
    | "option-pickable"
    | "fewer-than-2-options"
    | "soft-check-reachable"
    | "property";

export type SatResult = "sat" | "unsat";

export interface Query {
  id: string;
  kind: QueryKind;
  /** Questions the goal is about; the ones before the latest of them must be complete */
  targets: Question[];
  option?: { index: number; label: string };
  description?: string;
  goal: string;
  expected: SatResult;
  /** Overrides the completeness bound (questions with a smaller `order` are complete) */
  completeBefore?: number;
}

export function structuralQueries(model: Model): Query[] {
  const queries: Query[] = [{
    id: "submission:complete",
    kind: "submission",
    targets: [],
    description: "A complete submission exists (every visible required question answered)",
    goal: "true",
    expected: "sat",
    completeBefore: model.questions.length
  }];

  for (const q of model.questions) {
    queries.push({
      id: `question-visible:${q.id}`,
      kind: "question-visible",
      targets: [q],
      goal: smt.visible(q),
      expected: "sat"
    });
    q.choices.forEach((label, k) => queries.push({
      id: `option-pickable:${q.id}:${k}`,
      kind: "option-pickable",
      targets: [q],
      option: { index: k, label },
      goal: and([smt.visible(q), smt.optionVisible(q, k), smt.picks(q, k)]),
      expected: "sat"
    }));
    queries.push({
      id: `fewer-than-2-options:${q.id}`,
      kind: "fewer-than-2-options",
      targets: [q],
      goal: `(and ${smt.visible(q)} (< ${smt.shown(q)} 2))`,
      expected: "unsat"
    });
    q.softChecks.forEach((check, n) => queries.push({
      id: `soft-check-reachable:${q.id}:${n}`,
      kind: "soft-check-reachable",
      targets: [q],
      description: check.message,
      goal: and([smt.visible(q), ...(check.when ? [model.condition(check.when)] : []), or(check.options.map(k => smt.picks(q, k)))]),
      expected: "sat"
    }));
  }
  return queries;
}

/** Properties the survey's design promises, each as the forbidden scenario (expected unsat) */
export function propertyQueries(model: Model): Query[] {
  const queries: Query[] = [];
  const property = (id: string, description: string, targets: Question[], goal: string) =>
    queries.push({ id: `property:${id}`, kind: "property", targets, description, goal, expected: "unsat" });

  const age = model.question("What is your age?");
  const minor = model.choice(age, "Younger than 18 years");
  const young = model.choice(age, "18 to 24 years");
  const education = model.question("What is your IT or security education?");
  const experience = model.question("How many years have you worked in security?");
  const employment = model.question("What is your current employment situation?");

  for (const q of [education, experience, employment]) {
    property(`minor-never-sees:${q.id}`, `A respondent younger than 18 never sees ${q.id}`, [age, q], and([`(= ${smt.answer(age)} ${minor})`, smt.visible(q)]));
  }

  for (const label of ["7-10 years", "11-16 years", "16+ years"]) {
    const k = model.choice(experience, label);
    property(
      `18-24-never-sees-experience:${experience.id}:${k}`,
      `A respondent aged 18 to 24 never sees the experience choice "${label}"`,
      [age, experience],
      and([`(= ${smt.answer(age)} ${young})`, smt.visible(experience), smt.optionVisible(experience, k)])
    );
  }

  const income = [
    "Net monthly income in MAD",
    "Usual daily rate (TJM) in MAD",
    "Gross yearly salary in USD",
    "Usual daily rate in USD"
  ].map(model.question);
  income.forEach((a, i) => income.slice(i + 1).forEach((b) => {
    property(`at-most-one-income:${a.id}+${b.id}`, `Income questions ${a.id} and ${b.id} are never both visible`, [a, b], and([smt.visible(a), smt.visible(b)]));
  }));

  // Plans to work abroad (living in Morocco), coming back (living abroad), after your studies
  // (minors and lycee students): exactly one of them for every respondent
  const outlook = [
    "Do you have any plans to work outside Morocco?",
    "Do you plan to come back to live in Morocco?",
    "After your studies, where would you like to work?"
  ].map(model.question);
  outlook.forEach((a, i) => outlook.slice(i + 1).forEach((b) => {
    property(`exactly-one-outlook:both:${a.id}+${b.id}`, `Outlook questions ${a.id} and ${b.id} are never both visible`, [a, b], and([smt.visible(a), smt.visible(b)]));
  }));
  property(`exactly-one-outlook:none:${outlook.map(q => q.id).join("+")}`, "One of the three outlook questions is always visible", outlook, and(outlook.map(q => `(not ${smt.visible(q)})`)));

  return queries;
}

// ---------------------------------------------------------------------------------------------
// Solving

export interface Verdict {
  id: string;
  kind: QueryKind;
  questions: string[];
  option?: { index: number; label: string };
  description?: string;
  expected: SatResult;
  result: SatResult;
  status: "ok" | "problem";
  /** For sat: the answered single-choice questions up to the latest target (choice indexes) */
  witness?: Record<string, number>;
}

function z3Binary() {
  return process.env.Z3_BIN || "z3";
}

export function z3Version(): string | undefined {
  const run = spawnSync(z3Binary(), ["--version"], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : undefined;
}

function runZ3(script: string): string {
  const run = spawnSync(z3Binary(), ["-in", "-smt2"], { input: script, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.error)
    throw new Error(`could not run ${z3Binary()} (install z3 or set Z3_BIN): ${run.error.message}`);
  if (run.status !== 0 || run.stdout.includes("(error "))
    throw new Error(`z3 failed (exit ${run.status}):\n${run.stdout}\n${run.stderr}`);
  return run.stdout;
}

/** Splits z3 output on the `@@<n>` markers echoed before each check */
function byMarker(output: string): Map<number, string[]> {
  const blocks = new Map<number, string[]>();
  let current: string[] | undefined;
  for (const line of output.split("\n")) {
    const marker = /^@@(\d+)$/.exec(line.trim());
    if (marker) {
      current = [];
      blocks.set(Number(marker[1]), current);
    }
    else if (current && line.trim()) {
      current.push(line.trim());
    }
  }
  return blocks;
}

export function solve(model: Model, queries: Query[]): Verdict[] {
  const bound = (query: Query) => query.completeBefore ?? Math.max(0, ...query.targets.map(q => q.order));
  const witnessOf = (query: Query) => model.questions.filter(q => !q.multiple && q.order <= bound(query));
  const block = (query: Query, i: number, withWitness: boolean) => {
    const complete = and(model.questions.filter(q => q.order < bound(query)).map(smt.done));
    const witness = witnessOf(query).map(smt.answer);
    return [
      "(push 1)",
      `(assert ${complete})`,
      `(assert ${query.goal})`,
      `(echo "@@${i}")`,
      "(check-sat)",
      ...(withWitness && witness.length > 0 ? [`(get-value (${witness.join(" ")}))`] : []),
      "(pop 1)"
    ].join("\n");
  };

  // Pass 1: every check. Pass 2: the sat ones again, with their witness (z3 errors on get-value after unsat)
  const results = byMarker(runZ3([model.preamble, ...queries.map((query, i) => block(query, i, false))].join("\n")));
  const verdicts: Verdict[] = queries.map((query, i) => {
    const result = results.get(i)?.[0];
    if (result !== "sat" && result !== "unsat")
      throw new Error(`${query.id}: z3 answered ${result ?? "nothing"}`);
    return {
      id: query.id,
      kind: query.kind,
      questions: query.targets.map(q => q.id),
      ...(query.option && { option: query.option }),
      ...(query.description && { description: query.description }),
      expected: query.expected,
      result,
      status: result === query.expected ? "ok" : "problem"
    };
  });

  const satIndexes = verdicts.flatMap((verdict, i) => (verdict.result === "sat" ? [i] : []));
  const models = byMarker(runZ3([model.preamble, ...satIndexes.map(i => block(queries[i], i, true))].join("\n")));
  for (const i of satIndexes) {
    const [result, ...values] = models.get(i) ?? [];
    if (result !== "sat")
      throw new Error(`${queries[i].id}: z3 answered ${result ?? "nothing"} on the witness pass`);
    const answers = new Map<string, number>();
    for (const match of values.join(" ").matchAll(/\(\|a:([^|]+)\| (\(- \d+\)|\d+)\)/g))
      answers.set(match[1], match[2].startsWith("(") ? -Number(match[2].slice(3, -1)) : Number(match[2]));
    verdicts[i].witness = Object.fromEntries(witnessOf(queries[i]).flatMap((q) => {
      const value = answers.get(q.id);
      if (value === undefined)
        throw new Error(`${queries[i].id}: no value for ${q.id} in the witness`);
      return value >= 0 ? [[q.id, value]] : [];
    }));
  }
  return verdicts;
}

export function verifySurvey(sections: Section[]) {
  const model = buildModel(sections);
  const verdicts = solve(model, [...structuralQueries(model), ...propertyQueries(model)]);
  return { model, verdicts };
}

/** "profile-q-1 = 0 (Younger than 18 years)" lines for a witness */
export function describeWitness(model: Model, witness: Record<string, number>): string[] {
  return Object.entries(witness).map(([id, k]) => `${id} = ${k} (${model.byId.get(id)?.choices[k] ?? "?"})`);
}

// ---------------------------------------------------------------------------------------------
// CLI

const SEMANTICS = [
  "A single-choice question holds one choice index or -1 (unanswered); a multiple-choice one holds a set of picks",
  "A leaf (equals, notEquals, in, notIn) is false while the question it reads is unanswered or hidden; all = and, any = or",
  "A question is visible iff its showIf holds; a hidden question has no answer",
  "Each optionShowIf rule hides the choices it names unless its condition holds (several rules on one choice: all must hold)",
  "Only visible choices can be picked; an exclusive choice is never picked with another; softChecks never hide",
  "Questions before a query's latest target are complete: a visible required question is answered",
  "question-visible, option-pickable, soft-check-reachable and submission expect sat; fewer-than-2-options and property expect unsat"
];

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const { values } = parseArgs({ options: { survey: { type: "string" }, out: { type: "string" } } });
  const surveyDir = values.survey ?? path.join(root, "survey");
  const out = values.out ?? path.join(root, "scripts/verify/smt-verdicts.json");

  const started = performance.now();
  const { model, verdicts } = verifySurvey(loadSurvey(surveyDir));
  const seconds = ((performance.now() - started) / 1000).toFixed(2);

  const problems = verdicts.filter(v => v.status === "problem");
  const byKind: Record<string, number> = {};
  for (const verdict of verdicts)
    byKind[verdict.kind] = (byKind[verdict.kind] ?? 0) + 1;

  const report = {
    tool: "scripts/verify/smt.ts",
    solver: z3Version(),
    semantics: SEMANTICS,
    summary: { questions: model.questions.length, queries: verdicts.length, problems: problems.length, byKind },
    verdicts
  };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`${verdicts.length} queries on ${model.questions.length} questions in ${seconds}s (${report.solver ?? "z3"})`);
  console.log(`Verdicts written to ${path.relative(process.cwd(), out)}`);
  for (const problem of problems) {
    const option = problem.option ? ` "${problem.option.label}"` : "";
    console.log(`\n[X] ${problem.id}${option}: expected ${problem.expected}, got ${problem.result}`);
    if (problem.description)
      console.log(`    ${problem.description}`);
    for (const line of describeWitness(model, problem.witness ?? {}))
      console.log(`    ${line}`);
  }
  if (problems.length > 0) {
    console.error(`\n[X] ${problems.length} problem(s) found`);
    process.exit(1);
  }
  console.log("[OK] No problems found");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();
