import type { Answers } from "../conditions";
import type { Guard, PartitionMode, Predicate } from "./classes";
import type { Finding, SurveyModel } from "./model";
import type { LayerNode, PathStats } from "./paths";
import type { CompiledSpec } from "./spec";
import { buildGuards, collectPredicates } from "./classes";
import { Collector } from "./collector";
import { observationKey, observeQuestion } from "./observe";
import { pathStatsFromGraph } from "./paths";

/**
 * Exhaustive model checking of the survey's branching, over equivalence classes of answers.
 *
 * MODEL. The survey is the ordered list of questions q_0..q_{n-1} (sections in order). A
 * "guard" is a question some condition reads: a showIf leaf (section or question), an
 * optionShowIf rule, a soft check `when`, or a spec atom. Guards are single-select and every
 * condition reads only earlier questions (checkStructure refuses the survey otherwise). An
 * answer set A is what the server keeps: pruneHiddenAnswers(A) = A, i.e. every answer is to
 * a shown question and picks a shown choice. A guard may be unanswered (no key or null)
 * whether it is optional or required: the server accepts a missing required answer, and
 * pruning drops a pick that an earlier change hid. Answers to non-guards are read by no
 * condition, so they change nothing that is observed.
 *
 * OBSERVATION of A at q_i: is q_i shown (section showIf and showIf), which choices
 * (getVisibleChoiceIndices), which soft check fires on each shown choice (getSoftCheckMessage),
 * and the outcome of each optionShowIf rule. Everything the checks look at is one of these,
 * plus the spec atoms, which are predicates on guard answers.
 *
 * CLASSES (classes.ts). For a guard g, choices v ~ w when every predicate on g (each
 * engine leaf testing g, evaluated by the engine, and each spec atom) gives the same result
 * for v and w, AND v, w are named by the same optionShowIf rules, soft checks and exclusive
 * list of g itself, and are both "Other" or both not. "No answer" is a class of its own for
 * every guard (every leaf is false on it, the engine's rule for a missing answer).
 *
 * SOUNDNESS (no reachable state is missed, nothing unreachable is reported). Let R(A) map each
 * guard answer of A to its class representative. Claim, by induction on i: the observation
 * of A and of R(A) at q_i coincide, and the depth-first search visits R(A) restricted to the
 * guards before q_i.
 *   Base: before q_0 no guard is answered; both are empty.
 *   Step: every condition owned by q_i is a boolean combination of leaves on earlier guards;
 *   each leaf gives the same result on A(g) and R(A)(g) (same class), so showIf, each rule
 *   and each soft check `when` agree, hence the same choices are shown and the same soft
 *   checks fire: the observations coincide. If q_i is a guard and A answers it with v, v is
 *   a shown choice (A is pruned); the choices of v's class are named by the same rules as v,
 *   so they are shown exactly when v is, and the search, which branches on every class with
 *   a shown member plus "no answer", takes v's class with a shown representative. If q_i is
 *   hidden, A has no answer to it and neither has the search.
 *   Conversely every state the search builds is itself a pruned answer set (it only picks
 *   shown choices of shown guards), so every finding comes with a real witness: the set of
 *   observations the search sees is exactly the set over all accepted answer sets.
 *
 * MERGING. A node at layer p is kept only by what the rest of the survey can tell apart: for
 * each guard, the results of the predicates owned by q_p..q_{n-1} (plus completeness and the
 * spec counters). Two states with equal keys get the same observation at every later
 * question by the argument above, so exploring one of them is enough; the merged graph still
 * yields exact counts (weights) and exact distinct paths (paths.ts).
 */

export interface ExploreOptions {
  partition?: PartitionMode;
  /** "optional-only" drops the no-answer class of required guards: unsound, tests only */
  unanswered?: "every-guard" | "optional-only";
  /** Merge states that the rest of the survey cannot tell apart (default true) */
  merge?: boolean;
  /** Collect every class-state's full observation (small surveys only, needs merge false) */
  observations?: boolean;
}

export interface Exploration {
  findings: Finding[];
  guards: Guard[];
  /** Class-states: one per reachable combination of guard classes (and no-answer) */
  classStates: { all: number; complete: number };
  /** Graph nodes actually explored after merging */
  nodes: number;
  paths: PathStats;
  observations?: Set<string>;
}

interface StateNode {
  answers: Answers;
  complete: boolean;
  counters: number[];
  weight: number;
  observed: string;
}

export function explore(model: SurveyModel, spec: CompiledSpec, options: ExploreOptions = {}): Exploration {
  const partition = options.partition ?? "sound";
  const unanswered = options.unanswered ?? "every-guard";
  const merge = options.merge ?? true;
  const recordObservations = options.observations ?? false;
  if (recordObservations && merge)
    throw new Error("observations need merge: false");

  const { questions } = model;
  const n = questions.length;
  const predicates = collectPredicates(model, spec);
  const guards = buildGuards(model, predicates, partition);
  const guardAt = new Map<number, Guard>(guards.map(g => [g.question.index, g]));
  const collector = new Collector(model, spec);

  // code[g][p][v + 1]: results of g's predicates still to be read at layer p, for answer v
  // (v = -1 is "no answer")
  const futureCodes = guards.map((guard) => {
    const own = predicates.filter((p: Predicate) => p.guard === guard.question.index);
    const values = [undefined, ...guard.question.choices.map((_, v) => v)];
    return Array.from({ length: n + 1 }, (_, layer) => {
      const live = own.filter(p => p.owner >= layer);
      return values.map(v => live.map(p => (p.test(v) ? "1" : "0")).join(""));
    });
  });
  const setsWith = questions.map(q => spec.sets.map((s, i) => (s.members.includes(q.index) ? i : -1)).filter(i => i !== -1));
  const keyOf = (layer: number, answers: Answers, complete: boolean, counters: number[]) => {
    const parts: string[] = [];
    guards.forEach((guard, gi) => {
      if (guard.question.index >= layer)
        return;
      const value = answers[guard.question.id];
      const v = typeof value === "number" ? value : -1;
      parts.push(merge ? futureCodes[gi][layer][v + 1] : String(v));
    });
    spec.sets.forEach((s, i) => {
      if (s.members[0] < layer && layer <= s.members[s.members.length - 1])
        parts.push(`s${counters[i]}`);
    });
    return `${parts.join(",")}|${complete ? 1 : 0}`;
  };

  let current: StateNode[] = [{
    answers: {},
    complete: true,
    counters: spec.sets.map(() => 0),
    weight: 1,
    observed: ""
  }];
  const layers: LayerNode[][] = [];
  let nodes = 1;

  for (let p = 0; p < n; p++) {
    const q = questions[p];
    const guard = guardAt.get(p);
    const next: StateNode[] = [];
    const index = new Map<string, number>();
    const layerNodes: LayerNode[] = [];

    for (const node of current) {
      const obs = observeQuestion(q, node.answers);
      collector.question(q, obs, node.complete, node.answers);
      let complete = node.complete;
      if (obs.visible && q.required && !guard && obs.visibleChoices.length === 0)
        complete = false;
      let counters = node.counters;
      if (setsWith[p].length) {
        counters = [...counters];
        for (const s of setsWith[p]) {
          const members = spec.sets[s].members;
          counters[s] = Math.min(2, counters[s] + (obs.visible ? 1 : 0));
          if (members[members.length - 1] === p) {
            collector.setObligation(s, counters[s], node.complete, node.answers);
            counters[s] = 0;
          }
        }
      }

      const successors: Array<[Answers, boolean]> = [];
      if (guard && obs.visible) {
        if (unanswered === "every-guard" || !q.required)
          successors.push([node.answers, complete && !q.required]);
        const shown = new Set(obs.visibleChoices);
        for (const c of guard.classes) {
          const pick = partition === "sound"
            ? c.members.find(m => shown.has(m))
            : (shown.has(c.members[0]) ? c.members[0] : undefined);
          if (pick !== undefined)
            successors.push([{ ...node.answers, [q.id]: pick }, complete]);
        }
      }
      else {
        successors.push([node.answers, complete]);
      }

      const observed = recordObservations ? `${node.observed}${observationKey(obs)};` : "";
      const edges: number[] = [];
      for (const [answers, succComplete] of successors) {
        const key = keyOf(p + 1, answers, succComplete, counters);
        let target = index.get(key);
        if (target === undefined || recordObservations) {
          target = next.length;
          index.set(key, target);
          next.push({ answers, complete: succComplete, counters, weight: 0, observed });
        }
        next[target].weight += node.weight;
        edges.push(target);
      }
      layerNodes.push({ bit: obs.visible ? 1 : 0, succ: [...new Set(edges)] });
    }
    layers.push(layerNodes);
    nodes += next.length;
    current = next;
  }

  const label = (node: StateNode) => {
    const profile = spec.profileLeaf.map((i) => {
      const value = node.answers[questions[i].id];
      return `${questions[i].id}=${typeof value === "number" ? questions[i].choices[value] : "-"}`;
    }).join("; ");
    return `${node.complete ? "C" : "I"}|${profile}`;
  };
  const terminals = current.map(label);
  const classStates = { all: 0, complete: 0 };
  for (const node of current) {
    classStates.all += node.weight;
    if (node.complete)
      classStates.complete += node.weight;
  }
  const observations = recordObservations
    ? new Set(current.map(node => `${node.complete ? "C" : "I"}|${node.observed}`))
    : undefined;

  return {
    findings: collector.findings(),
    guards,
    classStates,
    nodes,
    paths: pathStatsFromGraph({ layers, terminals }),
    observations
  };
}
