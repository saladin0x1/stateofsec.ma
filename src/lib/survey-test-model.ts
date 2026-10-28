// Test helper for the property tests: a catalog of the survey's questions, an oracle for the
// document the server should store, and checks written against the YAML semantics rather than
// against pruneHiddenAnswers, so they can catch a bug in it.
import type { Answers, AnswerValue } from "@/lib/conditions";
import type { SurveyQuestion, SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import fc from "fast-check";
import {
  conditionLeaves,
  evaluateCondition,
  getExclusiveChoiceIndices,
  getVisibleChoiceIndices,
  pruneHiddenAnswers
} from "@/lib/conditions";
import { isOtherChoice } from "@/lib/other-choice";

export const OTHERS_SUFFIX = "-others";

export interface QuestionEntry {
  id: string;
  sectionIndex: number;
  questionIndex: number;
  section: SurveyQuestionsYamlFile;
  question: SurveyQuestion;
  otherIndices: number[];
  exclusiveIndices: number[];
}

export function questionCatalog(sections: SurveyQuestionsYamlFile[]): QuestionEntry[] {
  return sections.flatMap((section, sectionIndex) =>
    section.questions.map((question, questionIndex) => ({
      id: `${section.label}-q-${questionIndex}`,
      sectionIndex,
      questionIndex,
      section,
      question,
      otherIndices: question.choices
        .map((choice, index) => (isOtherChoice(choice) ? index : -1))
        .filter(index => index !== -1),
      exclusiveIndices: getExclusiveChoiceIndices(question)
    }))
  );
}

export function catalogById(sections: SurveyQuestionsYamlFile[]) {
  return new Map(questionCatalog(sections).map(entry => [entry.id, entry]));
}

// Every field an answer document can hold, like the server's list
export function answerFieldNames(sections: SurveyQuestionsYamlFile[]): string[] {
  return questionCatalog(sections).flatMap(entry =>
    entry.otherIndices.length ? [entry.id, `${entry.id}${OTHERS_SUFFIX}`] : [entry.id]
  );
}

// Questions whose answer some condition reads (showIf, optionShowIf, softChecks)
export function guardIds(sections: SurveyQuestionsYamlFile[]): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const leaf of conditionLeaves(section.showIf))
      ids.add(leaf.question);
    for (const question of section.questions) {
      const conditions = [
        question.showIf,
        ...(question.optionShowIf ?? []).map(rule => rule.showIf),
        ...(question.softChecks ?? []).map(check => check.when)
      ];
      for (const condition of conditions) {
        for (const leaf of conditionLeaves(condition))
          ids.add(leaf.question);
      }
    }
  }
  return ids;
}

export function splitKey(key: string) {
  const isOthersText = key.endsWith(OTHERS_SUFFIX);
  return { isOthersText, id: isOthersText ? key.slice(0, -OTHERS_SUFFIX.length) : key };
}

export function selectsOther(value: AnswerValue | undefined, otherIndices: number[]) {
  const picked = Array.isArray(value) ? value : [value];
  return otherIndices.some(index => picked.includes(index));
}

export function isEmptyAnswer(value: AnswerValue | undefined) {
  return value == null || (Array.isArray(value) && value.length === 0);
}

/**
 * The document the server must hold after a successful submit: the client's visible answers
 * (its cumulative answers, pruned), minus "other" text whose Other choice is not picked,
 * minus empty answers to required questions
 */
export function expectedDocument(sections: SurveyQuestionsYamlFile[], rawAnswers: Answers): Answers {
  const byId = catalogById(sections);
  const visible = pruneHiddenAnswers(sections, rawAnswers);
  const expected: Answers = {};
  for (const [key, value] of Object.entries(visible)) {
    const { isOthersText, id } = splitKey(key);
    const entry = byId.get(id)!;
    if (isOthersText) {
      // "Other" text is stored trimmed, and blank text is no answer
      const text = (value as string).trim();
      if (text && selectsOther(visible[id], entry.otherIndices))
        expected[key] = text;
      continue;
    }
    if (entry.question.required && isEmptyAnswer(value))
      continue;
    expected[key] = value;
  }
  return expected;
}

function isVisibleIn(entry: QuestionEntry, answers: Answers) {
  return evaluateCondition(entry.section.showIf, answers) && evaluateCondition(entry.question.showIf, answers);
}

// Narrows a pick to the choices visible given `answers`; undefined when nothing is left of a
// non-empty pick (the question then counts as unanswered)
function narrowed(entry: QuestionEntry, value: AnswerValue, answers: Answers): AnswerValue | undefined {
  const visible = new Set(getVisibleChoiceIndices(entry.question, answers));
  if (Array.isArray(value)) {
    const kept = value.filter(v => visible.has(v));
    return kept.length || !value.length ? kept : undefined;
  }
  if (typeof value === "number")
    return visible.has(value) ? value : undefined;
  return value;
}

/**
 * Fixpoint characterization of pruning, independent of the walk order used by
 * pruneHiddenAnswers: `output` must keep exactly the input answers whose question is visible
 * given `output` itself, narrowed to the choices visible given `output`. Conditions only read
 * earlier single-choice questions (the validator enforces it), so this fixpoint is unique.
 */
export function pruneFixpointViolations(
  sections: SurveyQuestionsYamlFile[],
  input: Answers,
  output: Answers
): string[] {
  const byId = catalogById(sections);
  const violations: string[] = [];
  for (const key of Object.keys(output)) {
    if (!Object.hasOwn(input, key))
      violations.push(`${key} appears in the output but not in the input`);
  }
  for (const [key, value] of Object.entries(input)) {
    const { isOthersText, id } = splitKey(key);
    const entry = byId.get(id);
    if (!entry)
      continue;
    const visible = isVisibleIn(entry, output);
    const wanted = !visible ? undefined : isOthersText ? value : narrowed(entry, value, output);
    const got = Object.hasOwn(output, key) ? output[key] : undefined;
    if (JSON.stringify(wanted) !== JSON.stringify(got))
      violations.push(`${key}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(got)}`);
  }
  return violations;
}

/**
 * Checks a stored document against the survey rules, evaluating every condition on the
 * document itself: no field of a hidden question, no hidden pick, no "other" text without
 * its Other choice, no empty required answer, exclusive choices alone, valid indexes only
 */
export function storedDocumentViolations(sections: SurveyQuestionsYamlFile[], doc: Answers): string[] {
  const byId = catalogById(sections);
  const violations: string[] = [];
  for (const [key, value] of Object.entries(doc)) {
    const { isOthersText, id } = splitKey(key);
    const entry = byId.get(id);
    if (!entry) {
      violations.push(`unknown field ${key}`);
      continue;
    }
    if (!isVisibleIn(entry, doc))
      violations.push(`${key} is stored but its question is hidden`);
    if (isOthersText) {
      if (typeof value !== "string")
        violations.push(`${key} is not text`);
      if (!selectsOther(doc[id], entry.otherIndices))
        violations.push(`${key} is stored without its Other choice picked`);
      continue;
    }
    const { question, exclusiveIndices } = entry;
    if (question.required && isEmptyAnswer(value))
      violations.push(`${key} is required but stored empty`);
    const picks = Array.isArray(value) ? value : value === null ? [] : [value];
    if (question.multiple !== Array.isArray(value) && value !== null)
      violations.push(`${key} has the wrong shape: ${JSON.stringify(value)}`);
    const visible = new Set(getVisibleChoiceIndices(question, doc));
    for (const pick of picks) {
      if (typeof pick !== "number" || !Number.isInteger(pick) || pick < 0 || pick >= question.choices.length)
        violations.push(`${key} holds an invalid index ${JSON.stringify(pick)}`);
      else if (!visible.has(pick))
        violations.push(`${key} holds the hidden choice ${pick}`);
    }
    if (new Set(picks).size !== picks.length)
      violations.push(`${key} holds a duplicate pick`);
    if (picks.length > 1 && picks.some(pick => exclusiveIndices.includes(pick as number)))
      violations.push(`${key} combines an exclusive choice with others: ${JSON.stringify(value)}`);
  }
  return violations;
}

// Visible required questions (given the document itself) that have no answer
export function unansweredRequired(sections: SurveyQuestionsYamlFile[], doc: Answers): string[] {
  return questionCatalog(sections)
    .filter(entry => entry.question.required && isVisibleIn(entry, doc) && isEmptyAnswer(doc[entry.id]))
    .map(entry => entry.id);
}

/**
 * Type-correct answer maps over every question of the survey, hidden choices included: a
 * single choice is an index or null, a multiple choice a list of distinct indexes, and a
 * question with an Other choice may carry "-others" text
 * @param sections - The survey sections
 * @param presence - Chance that a question has an answer at all
 */
export function answersArbitrary(sections: SurveyQuestionsYamlFile[], presence = 0.8): fc.Arbitrary<Answers> {
  const freq = Math.max(2, Math.round(1 / (1 - presence)));
  const fields = questionCatalog(sections).flatMap((entry) => {
    const indices = entry.question.choices.map((_, index) => index);
    const value: fc.Arbitrary<AnswerValue> = entry.question.multiple
      ? fc.oneof(
          { weight: 6, arbitrary: fc.shuffledSubarray(indices, { minLength: 1, maxLength: 4 }) },
          { weight: 1, arbitrary: fc.constant<number[]>([]) }
        )
      : fc.oneof(
          { weight: 8, arbitrary: fc.constantFrom(...indices) },
          { weight: 1, arbitrary: fc.constant(null) }
        );
    const pairs: Array<fc.Arbitrary<[string, AnswerValue] | null>> = [
      fc.option(value.map(v => [entry.id, v] as [string, AnswerValue]), { freq, nil: null })
    ];
    if (entry.otherIndices.length) {
      pairs.push(fc.option(
        fc.string({ maxLength: 12 }).map(text => [`${entry.id}${OTHERS_SUFFIX}`, text] as [string, AnswerValue]),
        { freq: 2, nil: null }
      ));
    }
    return pairs;
  });
  return fc.tuple(...fields).map(entries =>
    Object.fromEntries(entries.filter((pair): pair is [string, AnswerValue] => pair !== null))
  );
}
