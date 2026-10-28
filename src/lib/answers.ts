import type { Answers, AnswerValue } from "@/lib/conditions";
import type { SurveyQuestion } from "@/lib/validators/survey-schema";
import { conditionLeaves, evaluateCondition, getExclusiveChoiceIndices, pruneHiddenAnswers } from "@/lib/conditions";
import { isOtherChoice } from "@/lib/other-choice";
import { surveySections } from "@/lib/survey";

const OTHERS_SUFFIX = "-others";
const LONE_SURROGATE = /\p{Cs}/u;

interface QuestionInfo {
  sectionIndex: number;
  question: SurveyQuestion;
  otherIndices: number[];
  exclusiveIndices: number[];
  // Last section any of its conditions (or its section's) reads; -1 when unconditional
  guardSection: number;
}

const sectionIndexById = new Map(
  surveySections.flatMap((section, sectionIndex) =>
    section.questions.map((_, index): [string, number] => [`${section.label}-q-${index}`, sectionIndex])
  )
);

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
        exclusiveIndices: getExclusiveChoiceIndices(question),
        guardSection: Math.max(
          -1,
          ...[...conditionLeaves(section.showIf), ...conditionLeaves(question.showIf)]
            .map(leaf => sectionIndexById.get(leaf.question) ?? Number.POSITIVE_INFINITY)
        )
      }
    ])
  )
);

function isShown(id: string, answers: Answers) {
  const { sectionIndex, question } = questionsById.get(id)!;
  return evaluateCondition(surveySections[sectionIndex].showIf, answers) && evaluateCondition(question.showIf, answers);
}

// Every field an answer document can hold: one per question, plus its "-others" text
const answerFields = [...questionsById].flatMap(([id, { sectionIndex, otherIndices }]) =>
  (otherIndices.length ? [id, `${id}${OTHERS_SUFFIX}`] : [id]).map(key => ({ key, id, sectionIndex }))
);

/** Index of the section a submit comes from, by label; -1 when missing or unknown */
export function reachedSectionIndex(label: string | undefined) {
  return surveySections.findIndex(section => section.label === label);
}

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
 * the fields to delete: every answer field of the sections up to `lastSection` that is not
 * stored. The client sends all its answers on each submit, so this removes stored answers to
 * questions now hidden by showIf, picks hidden by optionShowIf and "other" text whose "Other"
 * choice is no longer selected, even when the client has already dropped them. Fields of
 * later sections are kept, since a client that lost its saved answers (cleared storage,
 * another tab) must not wipe what it has not resubmitted yet, unless the answers submitted
 * settle that their question is hidden (every condition reads sections up to `lastSection`):
 * a respondent who goes back and turns out to be a minor loses their stored pay at once.
 * The last section's submit cleans up the rest.
 */
export function sanitizeAnswers(
  answers: Answers,
  lastSection = surveySections.length - 1
): { toSave: Answers; toDelete: string[] } {
  const known: Answers = {};
  for (const [key, value] of Object.entries(answers)) {
    const isOthersText = key.endsWith(OTHERS_SUFFIX);
    const id = isOthersText ? key.slice(0, -OTHERS_SUFFIX.length) : key;
    const info = questionsById.get(id);
    // A field this deployment does not know comes from a client on another survey version
    // (a deploy mid-survey): it is ignored, since rejecting it would fail every retry
    if (!info || (isOthersText && info.otherIndices.length === 0))
      continue;
    if (isOthersText) {
      // A lone surrogate (half an emoji) is not valid text: the client never sends one
      if (typeof value !== "string" || LONE_SURROGATE.test(value))
        throw new InvalidAnswersError(`Invalid value for ${key}`);
    }
    else {
      validateChoiceValue(id, value, info);
    }
    known[key] = value;
  }

  // Visibility is judged on the pruned answers, so a stale answer to a hidden guard
  // cannot keep its dependents alive
  const visibleAnswers = pruneHiddenAnswers(surveySections, known);
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

  const toDelete = answerFields
    .filter(({ key, id, sectionIndex }) => !Object.hasOwn(toSave, key) && (
      sectionIndex <= lastSection
      || (questionsById.get(id)!.guardSection <= lastSection && !isShown(id, visibleAnswers))
    ))
    .map(({ key }) => key);
  return { toSave, toDelete };
}
