import type { Answers, AnswerValue } from "../conditions";
import type { ExploreOptions } from "./explore";
import type { Finding, SurveyModel } from "./model";
import type { PathStats } from "./paths";
import type { CompiledSpec } from "./spec";
import { pruneHiddenAnswers } from "../conditions";
import { Collector } from "./collector";
import { explore } from "./explore";
import { observationKey, observeQuestion } from "./observe";
import { pathStatsFromList } from "./paths";

export interface BruteForceResult {
  findings: Finding[];
  paths: PathStats;
  /** Full observation of every answer set, prefixed "C|" (complete) or "I|" */
  observations: Set<string>;
  combinations: number;
}

function answered(value: AnswerValue | undefined) {
  return value != null && !(Array.isArray(value) && value.length === 0);
}

/**
 * The reference the quotient checker is compared with: every raw answer combination of every
 * question (no key, null, each choice; for multi-select also [] and every subset), pruned by
 * the engine exactly as the client and the server do, then observed question by question.
 * Exponential: for small fixture surveys only
 */
export function bruteForce(model: SurveyModel, spec: CompiledSpec, maxCombinations = 500_000): BruteForceResult {
  const { questions } = model;
  const domains: Array<Array<AnswerValue | undefined>> = questions.map((q) => {
    if (!q.multiple)
      return [undefined, null, ...q.choices.map((_, v) => v)];
    const subsets: number[][] = [];
    for (let mask = 0; mask < 1 << q.choices.length; mask++)
      subsets.push(q.choices.map((_, v) => v).filter(v => mask & (1 << v)));
    return [undefined, null, ...subsets];
  });
  const combinations = domains.reduce((product, d) => product * d.length, 1);
  if (combinations > maxCombinations)
    throw new Error(`Brute force needs ${combinations} combinations, over the ${maxCombinations} limit`);

  const collector = new Collector(model, spec);
  const observations = new Set<string>();
  const paths: Array<[string, string]> = [];
  const choice = questions.map(() => 0);

  for (let combo = 0; combo < combinations; combo++) {
    const raw: Answers = {};
    questions.forEach((q, i) => {
      const value = domains[i][choice[i]];
      if (value !== undefined)
        raw[q.id] = value;
    });
    const pruned = pruneHiddenAnswers(model.sections, raw);

    let complete = true;
    const counters = spec.sets.map(() => 0);
    let bits = "";
    let observed = "";
    for (const q of questions) {
      const obs = observeQuestion(q, pruned);
      collector.question(q, obs, complete, pruned);
      spec.sets.forEach((s, i) => {
        if (!s.members.includes(q.index))
          return;
        counters[i] = Math.min(2, counters[i] + (obs.visible ? 1 : 0));
        if (s.members[s.members.length - 1] === q.index)
          collector.setObligation(i, counters[i], complete, pruned);
      });
      if (obs.visible && q.required && !answered(pruned[q.id]))
        complete = false;
      bits += obs.visible ? "1" : "0";
      observed += `${observationKey(obs)};`;
    }
    const profile = spec.profileLeaf.map((i) => {
      const value = pruned[questions[i].id];
      return `${questions[i].id}=${typeof value === "number" ? questions[i].choices[value] : "-"}`;
    }).join("; ");
    paths.push([bits, `${complete ? "C" : "I"}|${profile}`]);
    observations.add(`${complete ? "C" : "I"}|${observed}`);

    // Next combination (odometer)
    for (let i = questions.length - 1; i >= 0; i--) {
      choice[i]++;
      if (choice[i] < domains[i].length)
        break;
      choice[i] = 0;
    }
  }

  return { findings: collector.findings(), paths: pathStatsFromList(paths), observations, combinations };
}

function split(observations: Set<string>) {
  const complete = new Set<string>();
  const all = new Set<string>();
  for (const o of observations) {
    all.add(o.slice(2));
    if (o.startsWith("C|"))
      complete.add(o.slice(2));
  }
  return { complete, all };
}

function difference(name: string, a: Set<string>, b: Set<string>, out: string[]) {
  for (const x of a) {
    if (!b.has(x))
      out.push(`${name}: ${x}`);
  }
}

/**
 * Compares the quotient checker with brute force on one survey. Returns the disagreements:
 * observation sets (quotient without merging), findings by check and subject, and path
 * statistics (quotient with merging). Empty means they agree
 */
export function crossCheck(
  model: SurveyModel,
  spec: CompiledSpec,
  options: ExploreOptions = {},
  brute: BruteForceResult = bruteForce(model, spec)
): string[] {
  const merged = explore(model, spec, options);
  const tree = explore(model, spec, { ...options, merge: false, observations: true });
  const out: string[] = [];
  const b = split(brute.observations);
  const q = split(tree.observations!);
  difference("observation only in brute force (complete)", b.complete, q.complete, out);
  difference("observation only in quotient (complete)", q.complete, b.complete, out);
  difference("observation only in brute force", b.all, q.all, out);
  difference("observation only in quotient", q.all, b.all, out);
  for (const [name, quotient] of [["merged", merged], ["tree", tree]] as const) {
    const ids = (findings: Finding[]) => new Set(findings.map(f => `${f.check} ${f.subject}`));
    difference(`finding only in brute force (${name})`, ids(brute.findings), ids(quotient.findings), out);
    difference(`finding only in quotient (${name})`, ids(quotient.findings), ids(brute.findings), out);
    if (JSON.stringify(quotient.paths) !== JSON.stringify(brute.paths))
      out.push(`path statistics differ (${name}): ${JSON.stringify(quotient.paths)} vs ${JSON.stringify(brute.paths)}`);
  }
  return out;
}
