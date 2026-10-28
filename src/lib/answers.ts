import type { Answers, AnswerValue } from "@/lib/conditions";
import type { SurveyQuestion } from "@/lib/validators/survey-schema";
import { getExclusiveChoiceIndices, pruneHiddenAnswers } from "@/lib/conditions";
import { isOtherChoice } from "@/lib/other-choice";
import { surveySections } from "@/lib/survey";

const OTHERS_SUFFIX = "-others";

interface QuestionInfo {
  sectionIndex: number;
  question: SurveyQuestion;
  otherIndices: number[];
  exclusiveIndices: number[];
}

const questionsById = new Map<string, QuestionInfo>(
  surveySections.flatMap((section, sectionIndex) =>
    section.questions.map((question, index): [string, QuestionInfo] => [
      `${section.label}-q-${index}`,
      {
        sectionIndex,
        question,
        otherIndices: question.choices
          .map((choice, choiceIndex) => (isOtherChoice(choice) ? choiceIndex : -1))
          .filter(choiceIndex => choiceIndex !== -1),
        exclusiveIndices: getExclusiveChoiceIndices(question)
      }
    ])
  )
);

// Every field an answer document can hold: one per question, plus its "-others" text
const answerFields = [...questionsById].flatMap(([id, { otherIndices }]) =>
  otherIndices.length ? [id, `${id}${OTHERS_SUFFIX}`] : [id]
);

export class InvalidAnswersError extends Error {}

function isChoiceIndex(value: unknown, choiceCount: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < choiceCount;
}

function isEmpty(value: AnswerValue) {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function validateChoiceValue(id: string, value: AnswerValue, { question, exclusiveIndices }: QuestionInfo) {
  if (value === null)
    return;
  const choiceCount = question.choices.length;
  const valid = question.multiple
    ? Array.isArray(value)
    && new Set(value).size === value.length
    && value.every(v => isChoiceIndex(v, choiceCount))
    && value.length <= (question.max ?? choiceCount)
    && (value.length === 1 || !value.some(v => exclusiveIndices.includes(v)))
    : isChoiceIndex(value, choiceCount);
  if (!valid)
    throw new InvalidAnswersError(`Invalid value for ${id}`);
}

function selectsOther(value: AnswerValue | undefined, otherIndices: number[]) {
  const selected = Array.isArray(value) ? value : [value];
  return otherIndices.some(index => selected.includes(index));
}

/**
 * Checks submitted answers against the survey definition. Returns the answers to store and
 * the fields to delete: every answer field that is not stored. The client sends all its
 * answers on each submit, so this removes stored answers to questions now hidden by showIf,
 * picks hidden by optionShowIf and "other" text whose "Other" choice is no longer selected,
 * even when the client has already dropped them.
 */
export function sanitizeAnswers(answers: Answers): { toSave: Answers; toDelete: string[] } {
  for (const [key, value] of Object.entries(answers)) {
    const isOthersText = key.endsWith(OTHERS_SUFFIX);
    const id = isOthersText ? key.slice(0, -OTHERS_SUFFIX.length) : key;
    const info = questionsById.get(id);
    if (!info)
      throw new InvalidAnswersError(`Unknown question ${key}`);
    if (isOthersText) {
      if (typeof value !== "string" || info.otherIndices.length === 0)
        throw new InvalidAnswersError(`Invalid value for ${key}`);
    }
    else {
      validateChoiceValue(id, value, info);
    }
  }

  // Visibility is judged on the pruned answers, so a stale answer to a hidden guard
  // cannot keep its dependents alive
  const visibleAnswers = pruneHiddenAnswers(surveySections, answers);
  const toSave: Answers = {};

  for (const [key, value] of Object.entries(visibleAnswers)) {
    const isOthersText = key.endsWith(OTHERS_SUFFIX);
    const id = isOthersText ? key.slice(0, -OTHERS_SUFFIX.length) : key;
    const info = questionsById.get(id)!;

    if (isOthersText) {
      // Blank text is no answer; store the trimmed text
      const text = (value as string).trim();
      if (text && selectsOther(visibleAnswers[id], info.otherIndices))
        toSave[key] = text;
      continue;
    }
    // An empty required answer is dropped, not rejected: a missing one is accepted anyway
    // (sections are saved one at a time), and rejecting it would block every later submit
    if (info.question.required && isEmpty(value))
      continue;
    toSave[key] = value;
  }

  const toDelete = answerFields.filter(key => !Object.hasOwn(toSave, key));
  return { toSave, toDelete };
}
