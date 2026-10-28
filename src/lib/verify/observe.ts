import type { Answers } from "../conditions";
import type { ModelQuestion } from "./model";
import { evaluateCondition, getSoftCheckMessage, getVisibleChoiceIndices } from "../conditions";

/** What one respondent state shows for one question, computed by the engine */
export interface QuestionObservation {
  visible: boolean;
  visibleChoices: number[];
  /** For each visible choice (same order): the soft check that fires on it, or -1 */
  softFired: number[];
  /** For each optionShowIf rule: does its condition hold (its options shown)? */
  ruleShows: boolean[];
}

const HIDDEN: QuestionObservation = { visible: false, visibleChoices: [], softFired: [], ruleShows: [] };

/**
 * Observes a question the way the client and the server do: shown when its section's and
 * its own showIf hold, with getVisibleChoiceIndices' choices and getSoftCheckMessage's checks
 */
export function observeQuestion(q: ModelQuestion, answers: Answers): QuestionObservation {
  if (!evaluateCondition(q.sectionShowIf, answers) || !evaluateCondition(q.showIf, answers))
    return HIDDEN;
  const visibleChoices = getVisibleChoiceIndices(q.engine, answers);
  const softFired = visibleChoices.map((choice) => {
    const label = q.choices[choice];
    const fired = q.softChecks.findIndex(check =>
      check.options.includes(label) && evaluateCondition(check.when, answers)
    );
    // The engine reports a message, not which check: both must agree
    const message = getSoftCheckMessage(q.engine, choice, answers);
    if (message !== (fired === -1 ? undefined : q.softChecks[fired].message))
      throw new Error(`Soft check model disagrees with the engine on ${q.id} choice ${choice}`);
    return fired;
  });
  const ruleShows = q.rules.map(rule => evaluateCondition(rule.showIf, answers));
  return { visible: true, visibleChoices, softFired, ruleShows };
}

/** A compact string for one observation, used to compare explorations */
export function observationKey(obs: QuestionObservation): string {
  if (!obs.visible)
    return "-";
  return `${obs.visibleChoices.join(",")}/${obs.softFired.join(",")}/${obs.ruleShows.map(Number).join("")}`;
}
