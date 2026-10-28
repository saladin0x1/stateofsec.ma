// Release gate: recomputes every threshold from the files exactly as they would be written
// (not from the pipeline's bookkeeping, except the suppression share, which needs the raw
// data). export-public writes nothing unless every check passes.
import type { Release, Thresholds } from "./release";
import type { SurveyDefinition } from "./survey-definition";
import { F, FLAW_AGE, FLAW_BLOCK, FLAW_REGION, MINOR_QI, S2, S3 } from "./fields";
import { countKeys, kPerRow, lDiversity } from "./metrics";
import { flawClassKey, flawPresenceFields, THRESHOLDS } from "./release";

export interface GateCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface GateResult {
  pass: boolean;
  checks: GateCheck[];
}

const NON_ANSWER_KEYS = /^(?:userId|lastUpdated|creationTime|lastSignInTime|createdAt|updatedAt|uid|id)$/i;

function minK(ks: number[]) {
  return ks.length ? Math.min(...ks) : Infinity;
}

function fmt(n: number) {
  return Number.isFinite(n) ? String(n) : "n/a (no rows)";
}

export function evaluateGate(release: Release, survey: SurveyDefinition, t: Thresholds = THRESHOLDS): GateResult {
  const checks: GateCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Structure: only published answers, nothing that could identify or join
  const allowed = new Set(Object.keys(release.publicQuestions));
  const forbidden = new Set<string>([F.country, ...FLAW_BLOCK]);
  const badKeys = new Set<string>();
  for (const row of release.publicRows) {
    for (const key of Object.keys(row)) {
      if (!allowed.has(key) || forbidden.has(key) || key.endsWith("-others") || NON_ANSWER_KEYS.test(key))
        badKeys.add(key);
    }
  }
  for (const key of allowed) {
    if (forbidden.has(key) || key.endsWith("-others"))
      badKeys.add(key);
  }
  add("public file: answers only (no ids, timestamps, free text, country or flaw block)", badKeys.size === 0, badKeys.size ? `found ${[...badKeys].join(", ")}` : "ok");

  const flawAllowed = new Set<string>([FLAW_AGE, FLAW_REGION, ...FLAW_BLOCK]);
  const badFlawKeys = new Set(release.flawRows.flatMap(row => Object.keys(row).filter(key => !flawAllowed.has(key))));
  add("flaw file: age group, coarse region and the flaw block only (no join key)", badFlawKeys.size === 0, badFlawKeys.size ? `found ${[...badFlawKeys].join(", ")}` : "ok");

  // k-anonymity in the public file
  const rows = release.publicRows;
  const minors = rows.map(row => row[F.age] === 0);
  const blankAge = rows.filter(row => row[F.age] == null).length;
  add("public file: every row keeps its age group", blankAge === 0, blankAge ? `${blankAge} rows without age` : "ok");

  const kS2 = minK(kPerRow(rows, S2).filter((_, i) => !minors[i]));
  add(`adults: k >= ${t.kS2} on S2 (gender, age, region, education, experience, employment)`, kS2 >= t.kS2, `min k = ${fmt(kS2)}`);
  const kS3 = minK(kPerRow(rows, S3).filter((_, i) => !minors[i]));
  add(`adults: k >= ${t.kS3} on S3 (S2 + domain, seniority, organization, pay, bug bounty status)`, kS3 >= t.kS3, `min k = ${fmt(kS3)}`);
  const kMinors = minK(kPerRow(rows, MINOR_QI).filter((_, i) => minors[i]));
  add(`minors: k >= ${t.kMinors} on every identifying field they answer`, kMinors >= t.kMinors, `min k = ${fmt(kMinors)}`);

  // Flaw file: l-diversity, and k for minors
  const presence = flawPresenceFields(survey);
  const diversity = lDiversity(release.flawRows, row => flawClassKey(row, presence), FLAW_BLOCK, t.lFlaw);
  const worst = diversity.worst ? ` (${diversity.worst.field}, class of ${diversity.worst.size})` : "";
  add(`flaw file: l >= ${t.lFlaw} for every sensitive question in every class`, diversity.minL >= t.lFlaw, `min l = ${fmt(diversity.minL)}${worst}`);
  const flawMinors = release.flawRows.filter(row => row[FLAW_AGE] === 0);
  const flawMinorK = flawMinors.length ? Math.min(...countKeys(flawMinors, [FLAW_AGE, FLAW_REGION, ...presence]).values()) : Infinity;
  add(`flaw file: minors k >= ${t.kMinors}`, flawMinorK >= t.kMinors, flawMinors.length ? `min k = ${flawMinorK}` : "no minor rows");

  // Suppression budget
  const { stats } = release;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  add(
    `public file: at most ${pct(t.maxSuppression)} of identifying cells suppressed`,
    stats.suppressionRate <= t.maxSuppression,
    `${pct(stats.suppressionRate)} (${stats.suppressedCells} of ${stats.qiCells} cells; ${stats.withheldRows} rows withheld)`
  );
  add(
    `flaw file: at most ${pct(t.maxSuppression)} of rows withheld`,
    stats.flaw.suppressionRate <= t.maxSuppression,
    `${pct(stats.flaw.suppressionRate)} (${stats.flaw.withheldRows} of ${stats.flaw.candidates} rows)`
  );

  return { pass: checks.every(c => c.pass), checks };
}

export function formatGateReport(release: Release, gate: GateResult): string {
  const { stats } = release;
  const levels = Object.entries(stats.levels)
    .filter(([, level]) => level > 0)
    .map(([name, level]) => `${name} -> level ${level}`);
  const blanked = Object.entries(stats.suppressedByField).map(([name, n]) => `${name} ${n}`);
  const regions = Object.entries(stats.flaw.regionLevels).map(([group, level]) => `${group}: ${level}`);
  const lines = [
    `Release gate: ${gate.pass ? "PASS" : "FAIL (nothing written)"}`,
    `  input rows ${stats.inputRows}, public rows ${stats.publicRows} (${stats.withheldRows} withheld, ${stats.withheldMinors} of them minors)`,
    `  recoding: ${levels.length ? `owner's merges plus ${levels.join(", ")}` : "owner's merges only (level 0)"}`,
    `  cells hidden by field: ${blanked.length ? blanked.join(", ") : "none"}; other answers removed with them: ${stats.dependentsRemoved}`,
    `  flaw file: ${stats.flaw.rows} rows of ${stats.flaw.candidates}; region level by group (0 finest, 2 none): ${regions.join("; ") || "no rows"}`,
    ...gate.checks.map(c => `  [${c.pass ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`)
  ];
  return lines.join("\n");
}
