import type { Answers, QuestionList } from "../conditions";
import type { ConditionLeaf, ShowIfCondition, SurveyQuestionsYamlFile } from "../validators/survey-schema";
import { conditionLeaves } from "../conditions";
import { isOtherChoice } from "../other-choice";

export type SurveySections = SurveyQuestionsYamlFile[];

/** An answer set shown to a human: question id -> choice text, in survey order */
export type Witness = Record<string, string>;

/**
 * One problem found by the checker. `check` and `subject` identify it; the witness, when
 * there is one, is a real answer set (a fixed point of pruneHiddenAnswers) that shows it
 */
export interface Finding {
  check: string;
  subject: string;
  message: string;
  witness?: Witness;
}

export interface ModelRule {
  options: string[];
  indices: number[];
  showIf: ShowIfCondition;
}

export interface ModelSoftCheck {
  options: string[];
  indices: number[];
  when?: ShowIfCondition;
  message: string;
}

export interface ModelQuestion {
  /** Position in the whole survey, 0-based, in the order the engine walks it */
  index: number;
  id: string;
  section: string;
  sectionShowIf?: ShowIfCondition;
  showIf?: ShowIfCondition;
  label: string;
  required: boolean;
  multiple: boolean;
  choices: string[];
  rules: ModelRule[];
  softChecks: ModelSoftCheck[];
  exclusive: number[];
  other: number[];
  /** The parsed question, handed to the engine unchanged */
  engine: QuestionList[number];
}

/** Where a condition leaf sits: the question that owns it and which of its conditions */
export interface LeafSite {
  owner: number;
  place: "section" | "showIf" | "rule" | "softCheck";
  /** Rule or soft check index for place "rule" / "softCheck", else 0 */
  item: number;
  leaf: ConditionLeaf;
  name: string;
}

export interface SurveyModel {
  sections: SurveySections;
  questions: ModelQuestion[];
  byId: Map<string, ModelQuestion>;
  leaves: LeafSite[];
}

const ID_PATTERN = /^[a-z0-9-]+-q-\d+$/;

export const NO_ANSWER = "(no answer)";

export function describeLeaf(leaf: ConditionLeaf): string {
  if (leaf.equals !== undefined)
    return `${leaf.question} equals ${leaf.equals}`;
  if (leaf.notEquals !== undefined)
    return `${leaf.question} notEquals ${leaf.notEquals}`;
  if (leaf.in)
    return `${leaf.question} in [${leaf.in.join(", ")}]`;
  if (leaf.notIn)
    return `${leaf.question} notIn [${leaf.notIn.join(", ")}]`;
  return `${leaf.question} (no operator)`;
}

/**
 * Flattens the sections into the ordered question list the engine walks (section order as
 * given, which is the order pruneHiddenAnswers and the client use)
 */
export function buildModel(sections: SurveySections): SurveyModel {
  const questions: ModelQuestion[] = [];
  const leaves: LeafSite[] = [];
  for (const section of sections) {
    section.questions.forEach((question, position) => {
      const index = questions.length;
      const id = `${section.label}-q-${position}`;
      const resolve = (labels: string[]) =>
        labels.map(label => question.choices.indexOf(label)).filter(i => i !== -1);
      const model: ModelQuestion = {
        index,
        id,
        section: section.label,
        sectionShowIf: section.showIf,
        showIf: question.showIf,
        label: question.label,
        required: question.required ?? false,
        multiple: question.multiple ?? false,
        choices: question.choices,
        rules: (question.optionShowIf ?? []).map(rule => ({
          options: rule.options,
          indices: resolve(rule.options),
          showIf: rule.showIf
        })),
        softChecks: (question.softChecks ?? []).map(check => ({
          options: check.options,
          indices: resolve(check.options),
          when: check.when,
          message: check.message
        })),
        exclusive: resolve(question.exclusive ?? []),
        other: question.choices.map((c, i) => (isOtherChoice(c) ? i : -1)).filter(i => i !== -1),
        engine: question
      };
      questions.push(model);
      const site = (place: LeafSite["place"], item: number, condition: ShowIfCondition | undefined, what: string) => {
        for (const leaf of conditionLeaves(condition))
          leaves.push({ owner: index, place, item, leaf, name: `${id} ${what} (${describeLeaf(leaf)})` });
      };
      site("section", 0, section.showIf, `section ${section.label} showIf`);
      site("showIf", 0, question.showIf, "showIf");
      model.rules.forEach((rule, i) => site("rule", i, rule.showIf, `optionShowIf #${i + 1}`));
      model.softChecks.forEach((check, i) => site("softCheck", i, check.when, `soft check #${i + 1}`));
    });
  }
  return { sections, questions, byId: new Map(questions.map(q => [q.id, q])), leaves };
}

/**
 * The preconditions the soundness argument relies on. The model checker refuses to explore
 * a survey that breaks any of them, so each one is an error
 */
export function checkStructure(model: SurveyModel): Finding[] {
  const findings: Finding[] = [];
  const add = (check: string, subject: string, message: string) =>
    findings.push({ check, subject, message });

  for (const site of model.leaves) {
    const { leaf } = site;
    const target = model.byId.get(leaf.question);
    if (!ID_PATTERN.test(leaf.question) || !target) {
      add("bad-reference", site.name, `condition tests "${leaf.question}", which is not a question of the survey`);
      continue;
    }
    const owner = model.questions[site.owner];
    const backward = site.place === "section"
      ? target.section !== owner.section && target.index < owner.index
      : target.index < owner.index;
    if (!backward)
      add("bad-reference", site.name, `condition tests ${target.id}, which does not come before it`);
    if (target.multiple)
      add("bad-reference", site.name, `condition tests ${target.id}, a multi-select question`);
    const operators = [leaf.equals, leaf.notEquals, leaf.in, leaf.notIn].filter(v => v !== undefined);
    if (operators.length !== 1)
      add("bad-reference", site.name, "condition needs exactly one operator");
    const values = [leaf.equals, leaf.notEquals, ...(leaf.in ?? []), ...(leaf.notIn ?? [])]
      .filter((v): v is number => v !== undefined);
    for (const value of values.filter(v => !Number.isInteger(v) || v < 0 || v >= target.choices.length)) {
      add("index-out-of-range", site.name, `tests choice ${value} of ${target.id}, which has ${target.choices.length} choices`);
    }
  }

  for (const q of model.questions) {
    const lower = q.choices.map(c => c.toLowerCase().trim());
    if (new Set(lower).size !== lower.length)
      add("duplicate-choice", q.id, "two choices have the same text, so a label can name either");
    const named: Array<[string, string]> = [
      ...q.rules.flatMap((rule, i) => rule.options.map((o): [string, string] => [`optionShowIf #${i + 1}`, o])),
      ...(q.engine.exclusive ?? []).map((o): [string, string] => ["exclusive", o]),
      ...q.softChecks.flatMap((check, i) => check.options.map((o): [string, string] => [`soft check #${i + 1}`, o]))
    ];
    for (const [where, label] of named.filter(([, label]) => !q.choices.includes(label))) {
      add("unknown-label", `${q.id} ${where}`, `names "${label}", which is not one of its choices (a label split by a comma in a YAML list?)`);
    }
    if (q.softChecks.length && q.multiple)
      add("soft-check-on-multi", q.id, "soft checks need a single-select question");
    if (q.engine.exclusive?.length && !q.multiple)
      add("exclusive-on-single", q.id, "exclusive choices need a multi-select question");
  }
  return findings;
}

/** A human-readable witness: every answered question, by choice text, in survey order */
export function toWitness(model: SurveyModel, answers: Answers): Witness {
  const witness: Witness = {};
  for (const q of model.questions) {
    if (!Object.hasOwn(answers, q.id))
      continue;
    const value = answers[q.id];
    if (typeof value === "number")
      witness[q.id] = q.choices[value] ?? String(value);
    else if (Array.isArray(value))
      witness[q.id] = value.map(v => q.choices[v]).join(" + ") || NO_ANSWER;
    else
      witness[q.id] = NO_ANSWER;
  }
  return witness;
}
