import type { Answers } from "../conditions";
import type { Finding, LeafSite, ModelQuestion, SurveyModel } from "./model";
import type { QuestionObservation } from "./observe";
import type { CompiledSpec, QuestionObligation, SetObligation } from "./spec";
import { evaluateCondition, pruneHiddenAnswers } from "../conditions";
import { toWitness } from "./model";
import { atomHolds } from "./spec";

/**
 * Turns observations into findings. Both explorers (the quotient one and the brute-force
 * one) feed it the same events, so their reports can be compared one to one.
 *
 * `complete` means every visible required question before this one was answered, as the
 * client enforces. Coverage checks (something must happen on some path) only count complete
 * states, so a dead branch cannot hide behind an answer the client never lets through;
 * safety checks (something must never happen) count every state the server accepts.
 */
export class Collector {
  private readonly shown: boolean[];
  private readonly optionSeen: boolean[][];
  private readonly ruleHid: boolean[][];
  private readonly ruleShowed: boolean[][];
  private readonly softFired: boolean[][];
  private readonly leafOutcomes: Array<[boolean, boolean]>;
  private readonly sitesByOwner: Array<Array<[number, LeafSite]>>;
  private readonly obligationsByQuestion: Array<Array<[number, QuestionObligation]>>;
  private readonly obligationApplied: boolean[];
  private readonly setApplied: boolean[];
  private readonly violations = new Map<string, Finding>();

  constructor(private readonly model: SurveyModel, private readonly spec: CompiledSpec) {
    const n = model.questions.length;
    this.shown = Array.from({ length: n }, () => false);
    this.optionSeen = model.questions.map(q => q.choices.map(() => false));
    this.ruleHid = model.questions.map(q => q.rules.map(() => false));
    this.ruleShowed = model.questions.map(q => q.rules.map(() => false));
    this.softFired = model.questions.map(q => q.softChecks.map(() => false));
    this.leafOutcomes = model.leaves.map(() => [false, false]);
    this.sitesByOwner = model.questions.map(() => []);
    model.leaves.forEach((site, i) => this.sitesByOwner[site.owner].push([i, site]));
    this.obligationsByQuestion = model.questions.map(() => []);
    spec.obligations.forEach((o, i) => this.obligationsByQuestion[o.question].push([i, o]));
    this.obligationApplied = spec.obligations.map(() => false);
    this.setApplied = spec.sets.map(() => false);
  }

  question(q: ModelQuestion, obs: QuestionObservation, complete: boolean, answers: Answers): void {
    const { visibleChoices } = obs;
    if (complete) {
      for (const [i, site] of this.sitesByOwner[q.index]) {
        const evaluated = site.place === "section" || site.place === "showIf"
          || (obs.visible && (site.place === "rule"
            || q.softChecks[site.item].indices.some(c => visibleChoices.includes(c))));
        if (evaluated)
          this.leafOutcomes[i][evaluateCondition(site.leaf, answers) ? 1 : 0] = true;
      }
    }
    if (obs.visible) {
      if (visibleChoices.length < 2)
        this.violation("too-few-options", q.id, `shows ${visibleChoices.length} choice(s)`, answers);
      if (q.multiple && visibleChoices.every(c => q.exclusive.includes(c)))
        this.violation("no-regular-option", q.id, "shows no choice that can be combined with others", answers);
      if (complete) {
        this.shown[q.index] = true;
        for (const c of visibleChoices)
          this.optionSeen[q.index][c] = true;
        obs.ruleShows.forEach((shows, r) => {
          if (shows)
            this.ruleShowed[q.index][r] = true;
          else
            this.ruleHid[q.index][r] = true;
        });
        for (const fired of obs.softFired) {
          if (fired !== -1)
            this.softFired[q.index][fired] = true;
        }
      }
    }
    for (const [i, o] of this.obligationsByQuestion[q.index])
      this.obligation(i, o, obs, complete, answers);
  }

  setObligation(i: number, visibleCount: number, complete: boolean, answers: Answers): void {
    const s: SetObligation = this.spec.sets[i];
    if (!s.when.every(atom => atomHolds(atom, answers, this.model.questions[atom.guard].id)))
      return;
    if (complete)
      this.setApplied[i] = true;
    if (s.scope === "complete" && !complete)
      return;
    const ok = s.kind === "exactlyOne" ? visibleCount === 1 : s.kind === "atMostOne" ? visibleCount <= 1 : visibleCount >= 1;
    if (!ok)
      this.violation("spec-violation", `${s.invariant}: ${s.subject}`, `${visibleCount >= 2 ? "2 or more" : visibleCount} of them shown`, answers);
  }

  private obligation(i: number, o: QuestionObligation, obs: QuestionObservation, complete: boolean, answers: Answers) {
    if (!o.when.every(atom => atomHolds(atom, answers, this.model.questions[atom.guard].id)))
      return;
    const position = obs.visibleChoices.indexOf(o.option);
    let applies: boolean;
    let broken: string | undefined;
    switch (o.kind) {
      case "hidden":
        applies = true;
        broken = obs.visible ? "the question is shown" : undefined;
        break;
      case "visible":
        applies = true;
        broken = obs.visible ? undefined : "the question is hidden";
        break;
      case "hiddenOption":
        applies = obs.visible;
        broken = position !== -1 ? "the choice is shown" : undefined;
        break;
      case "visibleOption":
        applies = obs.visible;
        broken = applies && position === -1 ? "the choice is hidden" : undefined;
        break;
      case "softFires":
        applies = position !== -1;
        broken = applies && obs.softFired[position] === -1 ? "no soft check fires" : undefined;
        break;
      case "softSilent":
        applies = position !== -1;
        broken = applies && obs.softFired[position] !== -1 ? "a soft check fires" : undefined;
        break;
    }
    if (!applies)
      return;
    if (complete)
      this.obligationApplied[i] = true;
    if (broken && (o.scope === "all" || complete))
      this.violation("spec-violation", `${o.invariant}: ${o.subject}`, broken, answers);
  }

  private violation(check: string, subject: string, message: string, answers: Answers) {
    const key = `${check}\u0000${subject}`;
    if (this.violations.has(key))
      return;
    // A witness must be a real answer set: one the engine keeps as it is
    const pruned = pruneHiddenAnswers(this.model.sections, answers);
    if (JSON.stringify(pruned) !== JSON.stringify(answers))
      throw new Error(`Internal error: witness for ${check} ${subject} is not a pruned answer set`);
    this.violations.set(key, { check, subject, message, witness: toWitness(this.model, answers) });
  }

  findings(): Finding[] {
    const findings: Finding[] = [...this.violations.values()];
    const add = (check: string, subject: string, message: string) => findings.push({ check, subject, message });
    for (const q of this.model.questions) {
      if (!this.shown[q.index]) {
        add("dead-question", q.id, "no respondent can reach it");
        continue;
      }
      q.choices.forEach((choice, c) => {
        if (!this.optionSeen[q.index][c])
          add("dead-option", `${q.id} option "${choice}"`, "shown to no respondent");
      });
      q.rules.forEach((_, r) => {
        if (!this.ruleHid[q.index][r])
          add("rule-never-hides", `${q.id} optionShowIf #${r + 1}`, "its condition holds whenever the question is shown, so it hides nothing");
        if (!this.ruleShowed[q.index][r])
          add("rule-never-shows", `${q.id} optionShowIf #${r + 1}`, "its condition never holds while the question is shown");
      });
      q.softChecks.forEach((_, s) => {
        if (!this.softFired[q.index][s])
          add("soft-check-never-fires", `${q.id} soft check #${s + 1}`, "never fires on a choice the respondent can see");
      });
    }
    this.model.leaves.forEach((site, i) => {
      const [sawFalse, sawTrue] = this.leafOutcomes[i];
      if (this.shown[site.owner] && sawFalse !== sawTrue)
        add("constant-leaf", site.name, `is always ${sawTrue} where it is evaluated (a shifted index?)`);
    });
    this.spec.obligations.forEach((o, i) => {
      if (!this.obligationApplied[i])
        add("spec-vacuous", `${o.invariant}: ${o.subject}`, "applies to no respondent, so it proves nothing (review the spec)");
    });
    this.spec.sets.forEach((s, i) => {
      if (!this.setApplied[i])
        add("spec-vacuous", `${s.invariant}: ${s.subject}`, "applies to no respondent, so it proves nothing (review the spec)");
    });
    return sortFindings(findings);
  }
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.check.localeCompare(b.check) || a.subject.localeCompare(b.subject));
}
