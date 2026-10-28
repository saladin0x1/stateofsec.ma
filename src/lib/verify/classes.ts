import type { ModelQuestion, SurveyModel } from "./model";
import type { CompiledSpec } from "./spec";
import { evaluateCondition } from "../conditions";

/**
 * A yes/no question about one guard's answer, consumed at question `owner` (or at the end of
 * the survey when owner === questions.length). `test(undefined)` is the "no answer" case
 */
export interface Predicate {
  guard: number;
  owner: number;
  test: (value: number | undefined) => boolean;
}

export interface GuardClass {
  members: number[];
  label: string;
}

export interface Guard {
  question: ModelQuestion;
  classes: GuardClass[];
  /** Class index of each choice */
  classOf: number[];
}

/**
 * "sound" is the partition the soundness argument needs. "unsafe-leaves-only" merges values
 * on condition leaves alone and picks the first member even when it is hidden: the shape of
 * the earlier throwaway checker, kept only so tests can show the brute-force cross-check
 * catches it
 */
export type PartitionMode = "sound" | "unsafe-leaves-only";

/**
 * Every predicate the exploration may evaluate on a guard: the engine's condition leaves
 * (evaluated by the engine itself), the spec's "when" atoms and the profile-leaf labels
 */
export function collectPredicates(model: SurveyModel, spec: CompiledSpec): Predicate[] {
  const predicates: Predicate[] = [];
  for (const site of model.leaves) {
    const guard = model.byId.get(site.leaf.question);
    if (!guard)
      continue;
    const { leaf } = site;
    predicates.push({
      guard: guard.index,
      owner: site.owner,
      test: value => evaluateCondition(leaf, value === undefined ? {} : { [leaf.question]: value })
    });
  }
  const atoms = [
    ...spec.obligations.flatMap(o => o.when.map(atom => ({ atom, owner: o.question }))),
    ...spec.sets.flatMap(s => s.when.map(atom => ({ atom, owner: s.members[s.members.length - 1] })))
  ];
  for (const { atom, owner } of atoms) {
    predicates.push({ guard: atom.guard, owner, test: value => value !== undefined && atom.values.has(value) });
  }
  for (const index of spec.profileLeaf) {
    model.questions[index].choices.forEach((_, k) => {
      predicates.push({ guard: index, owner: model.questions.length, test: value => value === k });
    });
  }
  return predicates;
}

/**
 * Splits each guard's choices into classes of interchangeable values. Two choices share a
 * class only if every predicate on the guard gives the same result for both AND they are
 * named by exactly the same optionShowIf rules, soft checks and exclusive list of the guard
 * question, and are both "Other" or both not. The rule membership makes a class visible or
 * hidden as a whole, so any member can stand for it
 */
export function buildGuards(model: SurveyModel, predicates: Predicate[], mode: PartitionMode = "sound"): Guard[] {
  const byGuard = new Map<number, Predicate[]>();
  for (const p of predicates) {
    if (!byGuard.has(p.guard))
      byGuard.set(p.guard, []);
    byGuard.get(p.guard)!.push(p);
  }
  return [...byGuard.keys()].sort((a, b) => a - b).map((index) => {
    const question = model.questions[index];
    const own = byGuard.get(index)!;
    const signatures = new Map<string, number[]>();
    question.choices.forEach((_, value) => {
      const bits: string[] = own.map(p => (p.test(value) ? "1" : "0"));
      if (mode === "sound") {
        bits.push("|", ...question.rules.map(r => (r.indices.includes(value) ? "1" : "0")));
        bits.push("|", ...question.softChecks.map(c => (c.indices.includes(value) ? "1" : "0")));
        bits.push("|", question.exclusive.includes(value) ? "1" : "0");
        bits.push("|", question.other.includes(value) ? "1" : "0");
      }
      const signature = bits.join("");
      if (!signatures.has(signature))
        signatures.set(signature, []);
      signatures.get(signature)!.push(value);
    });
    const classes = [...signatures.values()].map(members => ({
      members,
      label: members.map(m => question.choices[m]).join(" | ")
    }));
    const classOf: number[] = [];
    classes.forEach((c, ci) => c.members.forEach((m) => {
      classOf[m] = ci;
    }));
    return { question, classes, classOf };
  });
}
