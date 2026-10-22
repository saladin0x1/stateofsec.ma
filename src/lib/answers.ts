import type { Answers, AnswerValue } from "@/lib/conditions";
import type { SurveyQuestion } from "@/lib/validators/survey-schema";
import { pruneHiddenAnswers } from "@/lib/conditions";
import { isOtherChoice } from "@/lib/other-choice";
import { surveySections } from "@/lib/survey";

const OTHERS_SUFFIX = "-others";

interface QuestionInfo {
  sectionIndex: number;
  question: SurveyQuestion;
  otherIndices: number[];
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
          .filter(choiceIndex => choiceIndex !== -1)
      }
    ])
  )
);

export class InvalidAnswersError extends Error {}

function isChoiceIndex(value: unknown, choiceCount: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < choiceCount;
}

function isEmpty(value: AnswerValue) {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function validateChoiceValue(id: string, value: AnswerValue, { question }: QuestionInfo) {
  if (value === null)
    return;
  const choiceCount = question.choices.length;
  const valid = question.multiple
    ? Array.isArray(value)
    && new Set(value).size === value.length
    && value.every(v => isChoiceIndex(v, choiceCount))
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
 * the fields to delete: answers to questions that are now hidden by showIf conditions, and
 * "other" text whose "Other" choice is no longer selected.
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
  const toDelete: string[] = [];

  for (const [key, value] of Object.entries(answers)) {
    const isOthersText = key.endsWith(OTHERS_SUFFIX);
    const id = isOthersText ? key.slice(0, -OTHERS_SUFFIX.length) : key;
    const info = questionsById.get(id)!;
    const visible = Object.hasOwn(visibleAnswers, key);

    if (!visible || (isOthersText && !selectsOther(answers[id], info.otherIndices))) {
      toDelete.push(key);
      continue;
    }
    if (!isOthersText && info.question.required && isEmpty(value))
      throw new InvalidAnswersError(`${id} is required`);
    toSave[key] = value;
  }

  return { toSave, toDelete };
}
