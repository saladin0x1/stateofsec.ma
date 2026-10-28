import type { Exploration } from "./explore";
import type { Golden } from "./golden";
import type { LockStatus, SurveyLock } from "./lock";
import type { Finding, SurveySections } from "./model";
import type { CompiledSpec } from "./spec";
import { explore } from "./explore";
import { diffGolden, goldenOf } from "./golden";
import { checkLock } from "./lock";
import { buildModel, checkStructure } from "./model";
import { compileSpec, EMPTY_SPEC, parseSpec } from "./spec";

export interface VerifyInput {
  sections: SurveySections;
  specText?: string;
  /** Pinned statistics (golden.json); absent means nothing to compare with */
  golden?: unknown;
  lock?: SurveyLock;
}

export interface VerifyResult {
  ok: boolean;
  questions: number;
  sections: number;
  /** Precondition, spec and exploration findings; any finding fails the run */
  findings: Finding[];
  spec: CompiledSpec;
  exploration?: Exploration;
  golden?: Golden;
  goldenDiff: string[];
  lock?: LockStatus & { launched: boolean };
  ms: number;
}

/** Runs every check on a survey: preconditions, spec, exhaustive exploration, golden, lock */
export function verifySurvey(input: VerifyInput): VerifyResult {
  const start = Date.now();
  const model = buildModel(input.sections);
  const structure = checkStructure(model);
  let spec = EMPTY_SPEC;
  const findings: Finding[] = [...structure];
  if (input.specText !== undefined) {
    try {
      spec = compileSpec(model, parseSpec(input.specText));
    }
    catch (error) {
      findings.push({ check: "spec-error", subject: "spec file", message: error instanceof Error ? error.message : String(error) });
    }
    findings.push(...spec.errors);
  }
  // The exploration's soundness needs the preconditions, and its spec needs to compile
  const exploration = findings.length ? undefined : explore(model, spec);
  if (exploration)
    findings.push(...exploration.findings);
  const golden = exploration ? goldenOf(model, exploration) : undefined;
  const goldenDiff = golden && input.golden !== undefined ? diffGolden(input.golden, golden) : [];
  const lock = input.lock ? { ...checkLock(input.lock, model), launched: input.lock.launched } : undefined;
  // The spec is what the survey is proved against: a launched survey needs it signed off
  if (lock?.launched && input.specText !== undefined && spec.review.status !== "approved")
    findings.push({ check: "spec-unsigned", subject: "scripts/verify/spec.yml", message: "the survey is launched but the spec review is not approved (Ashraf or mchklt)" });
  return {
    ok: findings.length === 0 && goldenDiff.length === 0 && (lock?.ok ?? true),
    questions: model.questions.length,
    sections: input.sections.length,
    findings,
    spec,
    exploration,
    golden,
    goldenDiff,
    lock,
    ms: Date.now() - start
  };
}

const number = (n: number) => n.toLocaleString("en-US");

/** The short text report printed by `pnpm verify-survey` */
export function formatReport(result: VerifyResult, options: { goldenUpdated?: boolean; goldenMissing?: boolean } = {}): string {
  const lines: string[] = ["Survey model check (src/lib/verify)"];
  const e = result.exploration;
  const guards = e ? e.guards.map(g => `${g.question.id} ${g.classes.length}`).join(", ") : "-";
  lines.push(`  survey     ${result.questions} questions in ${result.sections} sections; guard classes: ${guards}`);
  const review = result.spec.review.status === "approved"
    ? `approved by ${result.spec.review.reviewers.join(", ")}`
    : "review PENDING (Ashraf or mchklt)";
  lines.push(`  spec       ${result.spec.invariantCount} invariants (${result.spec.obligations.length + result.spec.sets.length} obligations), ${review}`);
  if (e) {
    lines.push(`  explored   ${number(e.classStates.all)} class-states (${number(e.classStates.complete)} complete) as ${number(e.nodes)} merged nodes`);
    lines.push(`  paths      ${number(e.paths.complete)} distinct complete paths (${number(e.paths.all)} counting skipped required answers)`);
    const s = e.paths.screens;
    lines.push(`  screens    min ${s.min}, median ${s.median}, p90 ${s.p90}, max ${s.max} (per complete path)`);
  }
  else {
    lines.push("  explored   skipped: fix the errors below first (the proof relies on them)");
  }
  if (result.findings.length === 0) {
    lines.push("  findings   none");
  }
  else {
    lines.push(`  findings   ${result.findings.length}`);
    for (const f of result.findings) {
      lines.push(`    [X] ${f.check}: ${f.subject}: ${f.message}`);
      if (f.witness)
        lines.push(`        e.g. ${Object.entries(f.witness).map(([id, text]) => `${id}=${text}`).join("; ") || "(no answers)"}`);
    }
  }
  if (options.goldenUpdated)
    lines.push("  golden     updated scripts/verify/golden.json");
  else if (options.goldenMissing)
    lines.push("  golden     no scripts/verify/golden.json yet: run with --update-golden");
  else if (result.goldenDiff.length === 0)
    lines.push(e ? "  golden     matches scripts/verify/golden.json" : "  golden     not compared");
  else
    lines.push(`  golden     ${result.goldenDiff.length} change(s); review, then run with --update-golden:`, ...result.goldenDiff.slice(0, 20).map(d => `    ${d}`));
  if (result.lock) {
    const l = result.lock;
    const drift = [...l.changed, ...l.removed.map(id => `${id}: removed`), ...l.added.map(id => `${id}: not locked`)];
    const state = l.launched ? "launched" : "not launched";
    lines.push(drift.length
      ? `  lock       ${state}, ${drift.length} difference(s)${l.launched ? " (FAIL)" : " (allowed before launch; pnpm lock-survey --update)"}:`
      : `  lock       ${state}, matches survey/survey.lock.json`);
    lines.push(...drift.slice(0, 20).map(d => `    ${d}`));
  }
  lines.push(`  ${result.ok ? "[OK]" : "[FAIL]"} in ${(result.ms / 1000).toFixed(1)} s`);
  return lines.join("\n");
}
