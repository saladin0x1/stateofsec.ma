import type { ConditionLeaf, OptionCondition, ShowIfCondition, SoftCheck } from "./validators/survey-schema";

export type AnswerValue = number | number[] | null | string;
export type Answers = Record<string, AnswerValue>;
export type QuestionList = Array<{
  showIf?: ShowIfCondition;
  choices?: string[];
  optionShowIf?: OptionCondition[];
  exclusive?: string[];
  softChecks?: SoftCheck[];
}>;
export type SectionList = Array<{
  showIf?: ShowIfCondition;
  questions?: QuestionList;
}>;

/**
 * Lists the single conditions inside a showIf (one, or every item of all / any)
 * @param condition - The condition to split
 * @returns The leaf conditions, empty when there is no condition
 */
export function conditionLeaves(condition: ShowIfCondition | undefined): ConditionLeaf[] {
  if (!condition)
    return [];
  if ("all" in condition)
    return condition.all;
  if ("any" in condition)
    return condition.any;
  return [condition];
}

/**
 * Evaluates a showIf condition against current answers
 * @param condition - The condition to evaluate: one condition, or all / any of several
 * @param answers - Current survey answers
 * @returns true if condition is met (show question/section), false otherwise
 */
export function evaluateCondition(
  condition: ShowIfCondition | undefined,
  answers: Answers
): boolean {
  // No condition means always show
  if (!condition)
    return true;

  if ("all" in condition)
    return condition.all.every(leaf => evaluateLeaf(leaf, answers));
  if ("any" in condition)
    return condition.any.some(leaf => evaluateLeaf(leaf, answers));
  return evaluateLeaf(condition, answers);
}

/**
 * Indices of the choices to show, given the answers so far. Hidden choices keep their
 * index, so stored answers stay comparable whatever is shown
 * @param question - The question with its choices and optional per-choice conditions
 * @param answers - Current survey answers
 * @returns Visible choice indices, in order
 */
export function getVisibleChoiceIndices(
  question: QuestionList[number],
  answers: Answers
): number[] {
  const choices = question.choices ?? [];
  const hidden = new Set<number>();
  for (const rule of question.optionShowIf ?? []) {
    if (evaluateCondition(rule.showIf, answers))
      continue;
    for (const label of rule.options) {
      const index = choices.indexOf(label);
      if (index !== -1)
        hidden.add(index);
    }
  }
  return choices.map((_, index) => index).filter(index => !hidden.has(index));
}

/**
 * Indices of the choices that cannot be combined with any other choice
 * @param question - The question with its choices and optional exclusive labels
 * @returns Exclusive choice indices
 */
export function getExclusiveChoiceIndices(question: QuestionList[number]): number[] {
  const choices = question.choices ?? [];
  return (question.exclusive ?? [])
    .map(label => choices.indexOf(label))
    .filter(index => index !== -1);
}

/**
 * The "is that right?" message for a rare pick, if the picked choice triggers a soft check
 * @param question - The question with its choices and optional soft checks
 * @param value - The answer picked for this question
 * @param answers - Current survey answers
 * @returns The message of the first matching soft check, or undefined
 */
export function getSoftCheckMessage(
  question: QuestionList[number],
  value: AnswerValue | undefined,
  answers: Answers
): string | undefined {
  if (typeof value !== "number")
    return undefined;
  const label = question.choices?.[value];
  if (label === undefined)
    return undefined;
  return question.softChecks?.find(check =>
    check.options.includes(label) && evaluateCondition(check.when, answers)
  )?.message;
}

function evaluateLeaf(condition: ConditionLeaf, answers: Answers): boolean {
  const {
    question,
    equals,
    notEquals,
    in: inArray,
    notIn: notInArray
  } = condition;

  // Validate question ID format
  if (!question || !/^[a-z0-9-]+-q-\d+$/.test(question)) {
    console.warn(
      `[Condition] Invalid question ID format: "${question}". Showing question by default.`
    );
    return true;
  }

  // Get answer value
  const answerValue = answers[question];

  // Handle unanswered questions - hide if condition depends on it
  if (answerValue == null) {
    return false;
  }

  // Evaluate operators
  if (equals != null) {
    return evaluateEquals(answerValue, equals);
  }

  if (notEquals != null) {
    return evaluateNotEquals(answerValue, notEquals);
  }

  if (inArray) {
    return evaluateIn(answerValue, inArray);
  }

  if (notInArray) {
    return evaluateNotIn(answerValue, notInArray);
  }

  // No valid operator found
  console.warn(
    `[Condition] No valid operator found in condition for question "${question}". Showing by default.`
  );
  return true;
}

/**
 * Checks if answer equals expected value
 */
function evaluateEquals(answer: AnswerValue, expected: number): boolean {
  if (typeof answer !== "number") {
    console.warn(
      `[Condition] equals operator used on non-number answer. Expected number, got ${typeof answer}`
    );
    return false;
  }
  return answer === expected;
}

/**
 * Checks if answer does not equal expected value
 */
function evaluateNotEquals(answer: AnswerValue, expected: number): boolean {
  if (typeof answer !== "number") {
    console.warn(
      `[Condition] notEquals operator used on non-number answer. Expected number, got ${typeof answer}`
    );
    return false;
  }
  return answer !== expected;
}

/**
 * Checks if answer is one of expected values
 */
function evaluateIn(answer: AnswerValue, expected: number[]): boolean {
  if (typeof answer !== "number") {
    console.warn(
      `[Condition] in operator used on non-number answer. Expected number, got ${typeof answer}`
    );
    return false;
  }
  return expected.includes(answer);
}

/**
 * Checks if answer is not one of expected values
 */
function evaluateNotIn(answer: AnswerValue, expected: number[]): boolean {
  if (typeof answer !== "number") {
    console.warn(
      `[Condition] notIn operator used on non-number answer. Expected number, got ${typeof answer}`
    );
    return false;
  }
  return !expected.includes(answer);
}

/**
 * Filters sections based on their showIf conditions and whether they have visible questions
 * @param sections - All survey sections
 * @param answers - Current survey answers
 * @returns Array of section indices that should be visible
 */
export function getVisibleSectionIndices(
  sections: SectionList,
  answers: Answers
): number[] {
  return sections
    .map((section, index) => {
      const sectionVisible = evaluateCondition(section.showIf, answers);
      if (!sectionVisible)
        return { index, visible: false };

      // Check if section has at least one visible question
      const questions = section.questions;
      if (!questions?.length) {
        return { index, visible: false };
      }

      const hasVisibleQuestion = questions.some(q =>
        evaluateCondition(q.showIf, answers)
      );

      return {
        index,
        visible: hasVisibleQuestion
      };
    })
    .filter(item => item.visible)
    .map(item => item.index);
}

// Removes picks of choices that are hidden given the earlier answers. A question left with
// no pick counts as unanswered (undefined), not as a skip ([]), so it is asked again
function keepVisibleChoices(
  question: QuestionList[number],
  value: AnswerValue,
  answers: Answers
): AnswerValue | undefined {
  if (!question.optionShowIf?.length)
    return value;
  const visible = new Set(getVisibleChoiceIndices(question, answers));
  if (Array.isArray(value)) {
    const kept = value.filter(v => visible.has(v));
    return kept.length || !value.length ? kept : undefined;
  }
  if (typeof value === "number")
    return visible.has(value) ? value : undefined;
  return value;
}

/**
 * Drops answers to hidden questions, walking the survey in order so that hiding cascades:
 * a question whose guard is itself hidden is dropped even if a stale answer to that guard
 * is still around (e.g. after going back and changing an earlier answer). Picks of choices
 * hidden by optionShowIf are dropped too
 * @param sections - All survey sections, in survey order
 * @param answers - Current survey answers, possibly with stale entries
 * @returns Only the answers (and "-others" texts) of questions that are visible
 */
export function pruneHiddenAnswers(
  sections: Array<{ label: string; showIf?: ShowIfCondition; questions?: QuestionList }>,
  answers: Answers
): Answers {
  const kept: Answers = {};
  for (const section of sections) {
    if (!evaluateCondition(section.showIf, kept))
      continue;
    section.questions?.forEach((question, index) => {
      if (!evaluateCondition(question.showIf, kept))
        return;
      const id = `${section.label}-q-${index}`;
      if (Object.hasOwn(answers, id)) {
        const value = keepVisibleChoices(question, answers[id], kept);
        if (value !== undefined)
          kept[id] = value;
      }
      if (Object.hasOwn(answers, `${id}-others`))
        kept[`${id}-others`] = answers[`${id}-others`];
    });
  }
  return kept;
}

/**
 * Finds the next visible question after the given index
 * @param questions - All questions in a section
 * @param fromIdx - Current question index
 * @param answers - Current survey answers
 * @returns Index of next visible question, or undefined if none
 */
export function getNextVisibleQuestionIndex(
  questions: QuestionList,
  fromIdx: number,
  answers: Answers
): number | undefined {
  for (let i = fromIdx + 1; i < questions.length; i++) {
    if (evaluateCondition(questions[i].showIf, answers)) {
      return i;
    }
  }
  return undefined;
}

/**
 * Finds the previous visible question before the given index
 * @param questions - All questions in a section
 * @param fromIdx - Current question index
 * @param answers - Current survey answers
 * @returns Index of previous visible question, or undefined if none
 */
export function getPrevVisibleQuestionIndex(
  questions: QuestionList,
  fromIdx: number,
  answers: Answers
): number | undefined {
  for (let i = fromIdx - 1; i >= 0; i--) {
    if (evaluateCondition(questions[i].showIf, answers)) {
      return i;
    }
  }
  return undefined;
}

/**
 * Finds the first visible question in a section
 * @param questions - All questions in a section
 * @param answers - Current survey answers
 * @returns Index of first visible question, or undefined if none
 */
export function getFirstVisibleQuestionIndex(
  questions: QuestionList,
  answers: Answers
): number | undefined {
  return getNextVisibleQuestionIndex(questions, -1, answers);
}

/**
 * Finds the last visible question in a section
 * @param questions - All questions in a section
 * @param answers - Current survey answers
 * @returns Index of last visible question, or undefined if none
 */
export function getLastVisibleQuestionIndex(
  questions: QuestionList,
  answers: Answers
): number | undefined {
  return getPrevVisibleQuestionIndex(questions, questions.length, answers);
}

/**
 * Checks if there's a visible question after the given index
 * @param questions - All questions in a section
 * @param fromIdx - Current question index
 * @param answers - Current survey answers
 * @returns true if there's a next visible question
 */
export function hasNextVisibleQuestion(
  questions: QuestionList,
  fromIdx: number,
  answers: Answers
): boolean {
  return getNextVisibleQuestionIndex(questions, fromIdx, answers) != null;
}

/**
 * Checks if there's a visible question before the given index
 * @param questions - All questions in a section
 * @param fromIdx - Current question index
 * @param answers - Current survey answers
 * @returns true if there's a previous visible question
 */
export function hasPrevVisibleQuestion(
  questions: QuestionList,
  fromIdx: number,
  answers: Answers
): boolean {
  return getPrevVisibleQuestionIndex(questions, fromIdx, answers) != null;
}
