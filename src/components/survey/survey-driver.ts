// Test helper: drives the real survey machine the way the UI does, from random "intents"
// that are interpreted against the current state (so every generated sequence stays valid
// and shrinks well). The UI rules it copies:
// - choice.tsx / question.tsx: only visible choices can be clicked; a multiple-choice click
//   toggles, and an exclusive choice replaces every other pick (and is cleared by them)
// - survey-controls.tsx: Next sends [] first for an unanswered multiple choice; Skip (only on
//   optional questions) sends null or []; Back shows when there is an earlier visible question
// - steps.tsx: only steps before the current one (in the "possible" list) can be clicked
// - survey-context.tsx: a reload restores the position and the raw answers through JSON
// Two moves are not reachable from the UI and are marked as such: GO_TO_QUESTION (nothing
// sends it) and "inject" (a pick of a choice hidden at that moment, as a stale UI could send).
import type { SurveyContext, SurveyEvents } from "./survey-machine";
import type { Answers, AnswerValue } from "@/lib/conditions";
import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { createActor, waitFor } from "xstate";
import {
  evaluateCondition,
  getExclusiveChoiceIndices,
  getPossibleSectionIndices,
  getSoftCheckMessage,
  getVisibleChoiceIndices,
  getVisibleSectionIndices,
  hasPrevVisibleQuestion,
  pruneHiddenAnswers
} from "@/lib/conditions";
import { isOtherChoice } from "@/lib/other-choice";
import { guardIds, isEmptyAnswer } from "@/lib/survey-test-model";
import { ERRORS, surveyMachine } from "./survey-machine";

export type Intent
  = | { kind: "answer"; pick: number; thenNext: boolean }
    | { kind: "others"; text: string }
    | { kind: "next" }
    | { kind: "skip" }
    | { kind: "back" }
    | { kind: "steps"; pick: number }
    | { kind: "jump"; pick: number }
    | { kind: "flip"; pick: number; choice: number }
    | { kind: "softCheck"; confirm: boolean }
    | { kind: "inject"; pick: number }
    | { kind: "offline" }
    | { kind: "reload" };

// Text as the "other" textarea can hold it: at most 200 UTF-16 units (its maxLength), whole
// characters only, with accents, Arabic, Tifinagh and emoji
const TEXT_PIECES = ["a", "Z", " ", ",", "é", "ب", "ⵣ", "\u{1F600}", "\u{1F6E1}\u{FE0F}"];
export const othersTextArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.array(fc.constantFrom(...TEXT_PIECES), { maxLength: 40 }).map(pieces => pieces.join("")) },
  { weight: 1, arbitrary: fc.constant(`${"a".repeat(198)}\u{1F600}`) }
);

export function intentArbitrary(): fc.Arbitrary<Intent> {
  const pick = fc.nat({ max: 1000 });
  return fc.oneof(
    {
      weight: 34,
      arbitrary: fc.record({
        kind: fc.constant("answer" as const),
        pick,
        thenNext: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) })
      })
    },
    { weight: 8, arbitrary: fc.constant({ kind: "next" as const }) },
    { weight: 4, arbitrary: fc.constant({ kind: "skip" as const }) },
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("others" as const), text: othersTextArbitrary }) },
    { weight: 4, arbitrary: fc.constant({ kind: "back" as const }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant("steps" as const), pick }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("jump" as const), pick }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("flip" as const), pick, choice: pick }) },
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("softCheck" as const), confirm: fc.boolean() }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("inject" as const), pick }) },
    { weight: 1, arbitrary: fc.constant({ kind: "offline" as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: "reload" as const }) }
  );
}

// question.tsx handleChoiceChange for a multiple choice: toggle, exclusive picks alone. Once
// `max` choices are picked, the form disables the unpicked ones that are not exclusive
export function uiToggle(value: AnswerValue | undefined, choice: number, exclusive: number[], max?: number): number[] {
  const current = Array.isArray(value) ? value : [];
  if (current.includes(choice))
    return current.filter(v => v !== choice);
  if (exclusive.includes(choice))
    return [choice];
  if (max !== undefined && current.length >= max)
    return current;
  return [...current.filter(v => !exclusive.includes(v)), choice];
}

export interface SubmitRecord {
  // What reached the server, after the JSON round trip of the request
  payload: Answers;
  // Label of the section the client submitted from
  section?: string;
  outcome: "ok" | "offline" | "rejected";
  error?: unknown;
}

// The client's transport: JSON over the wire to `server`, or a failure in transit
export class FakeNetwork {
  offline = 0;
  readonly records: SubmitRecord[] = [];

  constructor(private readonly server: (input: { answers: Answers }) => Promise<unknown>) {}

  async submit(input: { answers: Answers; section?: string }) {
    const wire = JSON.parse(JSON.stringify(input)) as { answers: Answers; section?: string };
    const sent = { payload: wire.answers, section: wire.section };
    if (this.offline > 0) {
      this.offline--;
      this.records.push({ ...sent, outcome: "offline" });
      return { data: undefined, error: new Error("offline") };
    }
    try {
      await this.server(wire);
      this.records.push({ ...sent, outcome: "ok" });
      return { data: undefined, error: undefined };
    }
    catch (error) {
      this.records.push({ ...sent, outcome: "rejected", error });
      return { data: undefined, error };
    }
  }
}

interface DriverHooks {
  // Called after each request, with the raw answers the client held when it sent it
  onSubmit?: (record: SubmitRecord, rawAnswers: Answers) => void;
}

type Persisted = Pick<SurveyContext, "currentSectionIdx" | "currentQuestionIdx" | "rawAnswers">;

/**
 * Invariants of a settled machine: the answers are the pruned raw answers, the visible
 * sections are fresh, the current section is one of them, the current question is visible
 * (and, if required, has a visible choice to pick), and a soft check on screen matches the
 * current pick
 */
export function invariantViolations(sections: SurveyQuestionsYamlFile[], snapshot: ReturnType<SurveyDriver["actor"]["getSnapshot"]>): string[] {
  if (snapshot.status === "done")
    return snapshot.matches("complete") ? [] : ["done outside the complete state"];
  if (!snapshot.matches("answering"))
    return [`settled in ${JSON.stringify(snapshot.value)}`];
  const context = snapshot.context;
  const violations: string[] = [];
  if (!isDeepStrictEqual(context.answers, pruneHiddenAnswers(sections, context.rawAnswers)))
    violations.push("answers are not the pruned raw answers");
  if (!isDeepStrictEqual(context.visibleSectionIndices, getVisibleSectionIndices(sections, context.answers)))
    violations.push("visibleSectionIndices is stale");
  if (!context.visibleSectionIndices.includes(context.currentSectionIdx))
    violations.push(`current section ${context.currentSectionIdx} is not in visibleSectionIndices (indexOf -1)`);
  const section = sections[context.currentSectionIdx];
  const question = section?.questions[context.currentQuestionIdx];
  const id = `${section?.label}-q-${context.currentQuestionIdx}`;
  if (!question)
    return [...violations, `no question at ${id}`];
  if (!evaluateCondition(section.showIf, context.answers) || !evaluateCondition(question.showIf, context.answers))
    violations.push(`current question ${id} is hidden`);
  if (question.required && getVisibleChoiceIndices(question, context.answers).length === 0)
    violations.push(`required question ${id} has no visible choice`);
  if (context.softCheck !== null && context.softCheck !== getSoftCheckMessage(question, context.answers[id], context.answers))
    violations.push(`soft check "${context.softCheck}" does not match the pick of ${id}`);
  if (!Object.values(ERRORS).includes(context.error as never))
    violations.push(`unknown error ${context.error}`);
  return violations;
}

export class SurveyDriver {
  actor;
  readonly log: string[] = [];
  private readonly guards: Set<string>;
  private seenRecords = 0;

  constructor(
    readonly sections: SurveyQuestionsYamlFile[],
    readonly network: FakeNetwork,
    private readonly hooks: DriverHooks = {},
    persisted?: Persisted
  ) {
    this.guards = guardIds(sections);
    this.actor = this.start(persisted);
    this.check("start");
  }

  private start(persisted?: Persisted) {
    const actor = createActor(surveyMachine, { input: { sections: this.sections, persisted } });
    actor.start();
    return actor;
  }

  get snapshot() {
    return this.actor.getSnapshot();
  }

  get context() {
    return this.snapshot.context;
  }

  get done() {
    return this.snapshot.status === "done";
  }

  get current() {
    const context = this.context;
    const section = this.sections[context.currentSectionIdx];
    const question = section.questions[context.currentQuestionIdx];
    const id = `${section.label}-q-${context.currentQuestionIdx}`;
    return { section, question, id, value: context.answers[id] };
  }

  stop() {
    this.actor.stop();
  }

  fail(message: string): never {
    const context = this.context;
    throw new Error(
      `${message}\nat ${context.currentSectionIdx}/${context.currentQuestionIdx}, state ${JSON.stringify(this.snapshot.value)}`
      + `\nlast events:\n  ${this.log.slice(-25).join("\n  ")}`
    );
  }

  private check(after: string) {
    const violations = invariantViolations(this.sections, this.snapshot);
    if (violations.length)
      this.fail(`invariant broken after ${after}: ${violations.join("; ")}`);
  }

  async send(event: SurveyEvents) {
    const label = JSON.stringify(event);
    this.log.push(label);
    this.actor.send(event);
    await waitFor(this.actor, snapshot => !snapshot.matches("submitting"));
    for (; this.seenRecords < this.network.records.length; this.seenRecords++)
      this.hooks.onSubmit?.(this.network.records[this.seenRecords], this.context.rawAnswers);
    this.check(label);
  }

  // survey-controls.tsx handleNext
  async next() {
    const { question, id, value } = this.current;
    if (value == null && question.multiple)
      await this.send({ type: "ANSWER_CHANGE", questionId: id, value: [] });
    await this.send({ type: "NEXT" });
  }

  // Earlier visible questions (sections and questions before the current one)
  private earlierVisibleQuestions() {
    const context = this.context;
    const positions: Array<{ sectionIdx: number; questionIdx: number; id: string }> = [];
    for (const sectionIdx of context.visibleSectionIndices) {
      if (sectionIdx > context.currentSectionIdx)
        break;
      const section = this.sections[sectionIdx];
      section.questions.forEach((question, questionIdx) => {
        const earlier = sectionIdx < context.currentSectionIdx || questionIdx < context.currentQuestionIdx;
        if (earlier && evaluateCondition(question.showIf, context.answers))
          positions.push({ sectionIdx, questionIdx, id: `${section.label}-q-${questionIdx}` });
      });
    }
    return positions;
  }

  async apply(intent: Intent) {
    if (this.done)
      return;
    const { question, id, value } = this.current;
    const answers = this.context.answers;
    switch (intent.kind) {
      case "answer": {
        const visible = getVisibleChoiceIndices(question, answers);
        if (!visible.length)
          return;
        const choice = visible[intent.pick % visible.length];
        const newValue = question.multiple ? uiToggle(value, choice, getExclusiveChoiceIndices(question), question.max) : choice;
        await this.send({ type: "ANSWER_CHANGE", questionId: id, value: newValue });
        if (intent.thenNext)
          await this.next();
        return;
      }
      case "others": {
        // The textarea only shows while an Other choice is picked
        const otherPicked = question.choices.some((choice, index) =>
          isOtherChoice(choice) && (Array.isArray(value) ? value.includes(index) : value === index));
        if (otherPicked)
          await this.send({ type: "ANSWER_CHANGE", questionId: `${id}-others`, value: intent.text });
        return;
      }
      case "next":
        return this.next();
      case "skip":
        if (question.required)
          return;
        await this.send({ type: "ANSWER_CHANGE", questionId: id, value: question.multiple ? [] : null });
        return this.send({ type: "SKIP" });
      case "back": {
        const context = this.context;
        const canGoBack = context.visibleSectionIndices.indexOf(context.currentSectionIdx) > 0
          || hasPrevVisibleQuestion(this.sections[context.currentSectionIdx].questions, context.currentQuestionIdx, answers);
        if (canGoBack)
          await this.send({ type: "BACK" });
        return;
      }
      case "steps": {
        const possible = getPossibleSectionIndices(this.sections, answers);
        const selected = possible.indexOf(this.context.currentSectionIdx);
        const clickable = possible.slice(0, Math.max(selected, 0));
        if (clickable.length)
          await this.send({ type: "GO_TO_SECTION", sectionIdx: clickable[intent.pick % clickable.length] });
        return;
      }
      case "jump": {
        const earlier = this.earlierVisibleQuestions();
        if (!earlier.length)
          return;
        const target = earlier[intent.pick % earlier.length];
        return this.send({ type: "GO_TO_QUESTION", sectionIdx: target.sectionIdx, questionIdx: target.questionIdx });
      }
      case "flip": {
        // Go back to an answered guard and change it, after its dependents were answered
        const guards = this.earlierVisibleQuestions().filter(position =>
          this.guards.has(position.id) && !isEmptyAnswer(answers[position.id]));
        if (!guards.length)
          return;
        const target = guards[intent.pick % guards.length];
        await this.send({ type: "GO_TO_QUESTION", sectionIdx: target.sectionIdx, questionIdx: target.questionIdx });
        const guard = this.current;
        const others = getVisibleChoiceIndices(guard.question, this.context.answers).filter(choice => choice !== guard.value);
        if (others.length)
          await this.send({ type: "ANSWER_CHANGE", questionId: guard.id, value: others[intent.choice % others.length] });
        return;
      }
      case "softCheck": {
        const context = this.context;
        if (context.softCheck === null)
          return;
        if (!intent.confirm)
          return this.send({ type: "DISMISS_SOFT_CHECK" });
        const before = { section: context.currentSectionIdx, question: context.currentQuestionIdx };
        await this.send({ type: "CONFIRM_SOFT_CHECK" });
        if (this.done)
          return;
        const after = this.context;
        const moved = after.currentSectionIdx !== before.section || after.currentQuestionIdx !== before.question;
        if (after.softCheck !== null || (!moved && after.error !== ERRORS.submission))
          this.fail("a confirmed soft check did not let the respondent move on");
        return;
      }
      case "inject": {
        const visible = new Set(getVisibleChoiceIndices(question, answers));
        const hidden = question.choices.map((_, index) => index).filter(index => !visible.has(index));
        if (!hidden.length)
          return;
        const choice = hidden[intent.pick % hidden.length];
        const newValue = question.multiple ? uiToggle(value, choice, getExclusiveChoiceIndices(question), question.max) : choice;
        return this.send({ type: "ANSWER_CHANGE", questionId: id, value: newValue });
      }
      case "offline":
        this.network.offline++;
        return;
      case "reload": {
        const context = this.context;
        const persisted = JSON.parse(JSON.stringify({
          currentSectionIdx: context.currentSectionIdx,
          currentQuestionIdx: context.currentQuestionIdx,
          rawAnswers: context.rawAnswers
        })) as Persisted;
        this.actor.stop();
        this.log.push("(reload)");
        this.actor = this.start(persisted);
        this.check("reload");
      }
    }
  }

  /**
   * Answers what is required, confirms soft checks and presses Next until the survey
   * completes. With `picks`, choices are taken from them (and some optional questions are
   * answered too); without, the first visible choice is picked. `until` stops earlier
   * @returns The number of Next presses ("Yes, that's right" counts as one)
   */
  async finish(limit: number, picks: number[] = [], until: () => boolean = () => false): Promise<number> {
    this.network.offline = 0;
    let presses = 0;
    let turn = 0;
    while (!this.done && !until()) {
      if (presses >= limit)
        this.fail(`the end was not reached within ${limit} Next presses`);
      presses++;
      if (this.context.softCheck !== null) {
        await this.send({ type: "CONFIRM_SOFT_CHECK" });
        continue;
      }
      const { question, id, value } = this.current;
      const pick = picks.length ? picks[turn++ % picks.length] : 0;
      if ((question.required && isEmptyAnswer(value)) || pick % 3 === 1) {
        const visible = getVisibleChoiceIndices(question, this.context.answers);
        if (visible.length) {
          const choice = visible[pick % visible.length];
          await this.send({ type: "ANSWER_CHANGE", questionId: id, value: question.multiple ? [choice] : choice });
        }
      }
      await this.next();
    }
    return presses;
  }

  async run(intents: Intent[]) {
    for (const intent of intents)
      await this.apply(intent);
  }
}
