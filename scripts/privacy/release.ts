// Builds the public release from a raw export (scripts/export-results.ts output):
// 1. keep only published answers: no user id, no timestamps, no "-others" free text, no
//    country, no flaw block
// 2. recode the quasi-identifiers (coarsen.ts, level 0 = the owner's merges)
// 3. blank or withhold rare values, then the rare cells left (local suppression); a row that
//    still cannot reach the threshold is withheld
// 4. if more than the budget was suppressed, retry with coarser levels (fewest first)
// 5. the flaw block and "asked to hide" go to a separate file with no join key: only an
//    age group and a coarse region, coarsened further (or minors withheld) until l-diversity holds
// 6. both files are shuffled independently
import type { AnswerValue } from "../../src/lib/conditions";
import type { SurveyQuestion } from "../../src/lib/validators/survey-schema";
import type { CompiledLevel, FieldPolicy } from "./coarsen";
import type { Row } from "./fields";
import type { Random } from "./rng";
import type { SurveyDefinition } from "./survey-definition";
import { conditionLeaves } from "../../src/lib/conditions";
import { compileLevel, dependentsOf, guardViolations, POLICIES, POLICY_BY_ID, UNPUBLISHED } from "./coarsen";
import { F, FLAW_AGE, FLAW_BLOCK, FLAW_REGION, isAbroad, MINOR_QI, S2, S3, STRATA } from "./fields";
import { cellKey, countKeys, lDiversity, rowKey } from "./metrics";
import { cryptoRandom, shuffle } from "./rng";

export interface Thresholds {
  /** adults, on S2 and S3 */
  kS2: number;
  kS3: number;
  /** minors, on every identifying field they answer (MINOR_QI), in both files */
  kMinors: number;
  /** flaw file: distinct values of each sensitive question per class */
  lFlaw: number;
  /** share of quasi-identifier cells blanked, withheld or in withheld rows (each file) */
  maxSuppression: number;
}

export const THRESHOLDS: Thresholds = { kS2: 5, kS3: 3, kMinors: 5, lFlaw: 3, maxSuppression: 0.05 };

export interface PublicQuestion {
  label: string;
  choices: string[];
  multiple: boolean;
  required: boolean;
}

export interface ReleaseStats {
  inputRows: number;
  publicRows: number;
  /** recoding level used per field (0 = the owner's merges) */
  levels: Record<string, number>;
  qiCells: number;
  suppressedCells: number;
  suppressedByField: Record<string, number>;
  /** other answers removed because their presence would reveal a hidden cell */
  dependentsRemoved: number;
  withheldRows: number;
  withheldMinors: number;
  suppressionRate: number;
  flaw: {
    candidates: number;
    rows: number;
    withheldRows: number;
    suppressionRate: number;
    /**
     * Per age group (and presence pattern): 0 = Casablanca or Rabat / elsewhere in Morocco /
     * abroad, 1 = Morocco / abroad, 2 = no region, or the group's rows withheld
     */
    regionLevels: Record<string, number | "withheld">;
  };
}

export interface Release {
  publicRows: Row[];
  publicQuestions: Record<string, PublicQuestion>;
  flawRows: Row[];
  flawQuestions: Record<string, PublicQuestion>;
  stats: ReleaseStats;
  /** Never written: stratum of each public row, so reports can follow minors, women... */
  audit: { strata: Record<string, boolean[]> };
}

export interface ReleaseOptions {
  thresholds?: Thresholds;
  /** Fixed recoding levels by field id; otherwise level 0, coarser only when needed */
  levels?: Record<string, number>;
  /** Shuffle source; the default is the OS generator */
  random?: Random;
}

const QI_FIELDS = [...new Set([...S3, ...MINOR_QI])];

// Cells blanked first are the least useful for the report
const SUPPRESS_ORDER = [
  F.orgType,
  F.seniority,
  F.incomeUsdDay,
  F.incomeUsdYear,
  F.incomeTjm,
  F.incomeMad,
  F.bountyEarnings,
  F.certifications,
  F.bountyStatus,
  F.region,
  F.education,
  F.experience,
  F.domain,
  F.employment,
  F.gender
];
// Fields coarsened first when level 0 needs too much suppression
const RAISE_ORDER = [
  F.orgType,
  F.incomeUsdDay,
  F.incomeUsdYear,
  F.incomeTjm,
  F.incomeMad,
  F.bountyEarnings,
  F.seniority,
  F.bountyStatus,
  F.experience,
  F.education,
  F.region
];

interface Prepared {
  survey: SurveyDefinition;
  raw: Row[];
  publishedIds: string[];
  /** published answers of each raw row, before recoding */
  base: Row[];
  compiled: Map<string, CompiledLevel[]>;
  /** answers removed with a hidden field, for fields hidden with their dependents */
  dependents: Map<string, string[]>;
}

function isEmpty(value: AnswerValue | undefined) {
  return value == null || (Array.isArray(value) && value.length === 0);
}

function copy(value: AnswerValue | undefined): AnswerValue | undefined {
  return Array.isArray(value) ? [...value] : value;
}

function prepare(raw: readonly Row[], survey: SurveyDefinition): Prepared {
  const problems = guardViolations(survey);
  if (problems.length)
    throw new Error(`Recoding rules no longer fit the survey:\n- ${problems.join("\n- ")}`);
  const publishedIds = [...survey.questions.keys()].filter(id => !UNPUBLISHED.has(id));
  // Only answers given are published: skipped, not asked and hidden all look the same
  const base = raw.map((row) => {
    const out: Row = {};
    for (const id of publishedIds) {
      if (!isEmpty(row[id]))
        out[id] = copy(row[id]);
    }
    return out;
  });
  const compiled = new Map(POLICIES.map(policy => [
    policy.id,
    policy.levels.map((_, level) => compileLevel(policy, survey.questions.get(policy.id)!, level))
  ]));
  const qi = new Set<string>(QI_FIELDS);
  const dependents = new Map(
    POLICIES.filter(p => p.suppress === "dependents").map(p => [p.id, dependentsOf(survey, p.id, id => qi.has(id))])
  );
  return { survey, raw: [...raw], publishedIds, base, compiled, dependents };
}

function recodeValue(value: AnswerValue | undefined, level: CompiledLevel, field: string): AnswerValue | undefined {
  if (value == null)
    return value;
  const map = (old: number) => {
    const mapped = level.map[old];
    if (mapped === undefined)
      throw new Error(`Invalid answer ${old} for ${field}`);
    return mapped;
  };
  if (Array.isArray(value))
    return [...new Set(value.map(map))].sort((a, b) => a - b);
  if (typeof value !== "number")
    throw new Error(`Invalid answer for ${field}`);
  return map(value);
}

function recode(prepared: Prepared, levels: Record<string, number>): Row[] {
  return prepared.base.map((row) => {
    const out: Row = { ...row };
    for (const policy of POLICIES) {
      if (Object.hasOwn(out, policy.id))
        out[policy.id] = recodeValue(out[policy.id], prepared.compiled.get(policy.id)![levels[policy.id] ?? 0], policy.id);
    }
    return out;
  });
}

/** Rows as recoded at the given levels, before any suppression (for reports) */
export function recodeOnly(raw: readonly Row[], survey: SurveyDefinition, levels: Record<string, number> = {}): Row[] {
  return recode(prepare(raw, survey), levels);
}

interface Requirement {
  fields: string[];
  k: number;
  applies: (row: Row) => boolean;
}

interface MainResult {
  rows: Row[];
  alive: boolean[];
  qiCells: number;
  suppressedCells: number;
  suppressedByField: Record<string, number>;
  dependentsRemoved: number;
  withheldRows: number;
  withheldMinors: number;
  rate: number;
}

const isMinorRow = (row: Row) => row[F.age] === 0;

function suppressMain(prepared: Prepared, levels: Record<string, number>, t: Thresholds): MainResult {
  const rows = recode(prepared, levels);
  const { raw } = prepared;
  const alive = rows.map(() => true);
  const qiCellsOf = rows.map(row => QI_FIELDS.filter(f => !isEmpty(row[f])).length);
  const suppressedOf = rows.map(() => 0);
  const suppressedByField: Record<string, number> = {};
  let suppressedCells = 0;
  let dependentsRemoved = 0;
  let withheldRows = 0;
  let withheldMinors = 0;

  const level = (field: string) => prepared.compiled.get(field)![levels[field] ?? 0];
  const policyOf = (field: string): FieldPolicy => POLICY_BY_ID.get(field)!;

  // What the cell becomes once hidden (undefined: removed), or null if it cannot be hidden
  const hiddenValue = (i: number, field: string): { value: AnswerValue | undefined } | null => {
    const value = rows[i][field];
    if (isEmpty(value))
      return null;
    const policy = policyOf(field);
    if (policy.suppress === "blank" || policy.suppress === "dependents")
      return { value: undefined };
    if (policy.suppress === "withheld") {
      const compiled = level(field);
      const old = raw[i][field];
      if (compiled.withheldIndex === undefined || typeof old !== "number" || !compiled.withheldFrom!.has(old) || value === compiled.withheldIndex)
        return null;
      return { value: compiled.withheldIndex };
    }
    return null;
  };
  const presentDependents = (i: number, field: string) =>
    (prepared.dependents.get(field) ?? []).filter(id => Object.hasOwn(rows[i], id));
  const hide = (i: number, field: string) => {
    const hidden = hiddenValue(i, field);
    if (!hidden)
      return false;
    for (const id of presentDependents(i, field)) {
      delete rows[i][id];
      dependentsRemoved++;
    }
    if (hidden.value === undefined)
      delete rows[i][field];
    else
      rows[i][field] = hidden.value;
    suppressedCells++;
    suppressedOf[i]++;
    suppressedByField[field] = (suppressedByField[field] ?? 0) + 1;
    return true;
  };
  const withhold = (i: number) => {
    alive[i] = false;
    suppressedCells += qiCellsOf[i] - suppressedOf[i];
    withheldRows++;
    if (isMinorRow(rows[i]))
      withheldMinors++;
  };

  const requirements = requirementsFor(t);
  const members = (req: Requirement) => rows.flatMap((row, i) => (alive[i] && req.applies(row) ? [i] : []));

  // Rare values first: a value too rare to ever reach k is hidden wherever it appears
  for (const req of requirements) {
    const idx = members(req);
    for (const field of req.fields) {
      if (policyOf(field).suppress === "never")
        continue;
      const counts = new Map<string, number>();
      for (const i of idx) {
        const key = cellKey(rows[i][field]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const i of idx) {
        const key = cellKey(rows[i][field]);
        if (key !== "" && counts.get(key)! < req.k)
          hide(i, field);
      }
    }
  }

  // Then the rows still too rare, one cell at a time: the cheapest cell that joins a class
  // big enough, or else the one joining the biggest class
  for (let pass = 0; pass < 100; pass++) {
    let acted = false;
    const stuck = new Set<number>();
    for (const req of requirements) {
      const idx = members(req);
      const cells = new Map(idx.map(i => [i, req.fields.map(f => cellKey(rows[i][f]))]));
      const keyOf = new Map(idx.map(i => [i, cells.get(i)!.join("|")]));
      const counts = new Map<string, number>();
      for (const key of keyOf.values())
        counts.set(key, (counts.get(key) ?? 0) + 1);
      // Values that can never change bound the class a row can end up in
      const fixedKey = (i: number) => req.fields.map((f, j) => {
        const policy = policyOf(f);
        if (policy.suppress === "never")
          return cells.get(i)![j];
        if (policy.suppress === "withheld")
          return isAbroad(raw[i]) ? cells.get(i)![j] : "~";
        return "*";
      }).join("|");
      const fixedOf = new Map(idx.map(i => [i, fixedKey(i)]));
      const fixedCounts = new Map<string, number>();
      for (const key of fixedOf.values())
        fixedCounts.set(key, (fixedCounts.get(key) ?? 0) + 1);

      const violators = idx
        .filter(i => counts.get(keyOf.get(i)!)! < req.k)
        .sort((a, b) => counts.get(keyOf.get(a)!)! - counts.get(keyOf.get(b)!)! || a - b);
      for (const i of violators) {
        const key = keyOf.get(i)!;
        if (!alive[i] || counts.get(key)! >= req.k)
          continue;
        if (fixedCounts.get(fixedOf.get(i)!)! < req.k) {
          counts.set(key, counts.get(key)! - 1);
          withhold(i);
          continue;
        }
        let best: { field: string; key: string; size: number; cost: number } | undefined;
        for (const field of SUPPRESS_ORDER) {
          const j = req.fields.indexOf(field);
          if (j === -1)
            continue;
          const hidden = hiddenValue(i, field);
          if (!hidden)
            continue;
          const trial = [...cells.get(i)!];
          trial[j] = cellKey(hidden.value);
          const trialKey = trial.join("|");
          const size = counts.get(trialKey) ?? 0;
          const cost = 1 + presentDependents(i, field).length;
          const reaches = size + 1 >= req.k;
          const bestReaches = best !== undefined && best.size + 1 >= req.k;
          const better = !best
            || (reaches && (!bestReaches || cost < best.cost))
            || (!reaches && !bestReaches && (size > best.size || (size === best.size && cost < best.cost)));
          if (better)
            best = { field, key: trialKey, size, cost };
        }
        if (!best) {
          stuck.add(i);
          continue;
        }
        counts.set(key, counts.get(key)! - 1);
        hide(i, best.field);
        cells.set(i, req.fields.map(f => cellKey(rows[i][f])));
        keyOf.set(i, best.key);
        counts.set(best.key, (counts.get(best.key) ?? 0) + 1);
        acted = true;
      }
    }
    if (acted)
      continue;
    if (!stuck.size)
      break;
    for (const i of stuck) {
      if (alive[i])
        withhold(i);
    }
  }

  const qiCells = qiCellsOf.reduce((sum, n) => sum + n, 0);
  return {
    rows,
    alive,
    qiCells,
    suppressedCells,
    suppressedByField,
    dependentsRemoved,
    withheldRows,
    withheldMinors,
    rate: qiCells ? suppressedCells / qiCells : 0
  };
}

function requirementsFor(t: Thresholds): Requirement[] {
  return [
    { fields: S2, k: t.kS2, applies: row => !isMinorRow(row) },
    { fields: S3, k: t.kS3, applies: row => !isMinorRow(row) },
    { fields: MINOR_QI, k: t.kMinors, applies: isMinorRow }
  ];
}

/** Rows below a threshold before any suppression: the cheap guide for the level search */
function rowsAtRisk(prepared: Prepared, levels: Record<string, number>, t: Thresholds): number {
  const rows = recode(prepared, levels);
  const atRisk = new Set<number>();
  for (const req of requirementsFor(t)) {
    const idx = rows.flatMap((row, i) => (req.applies(row) ? [i] : []));
    const counts = countKeys(idx.map(i => rows[i]), req.fields);
    for (const i of idx) {
      if (counts.get(rowKey(rows[i], req.fields))! < req.k)
        atRisk.add(i);
    }
  }
  return atRisk.size;
}

// Coarser levels, one field at a time (the one leaving the fewest rows at risk), until the
// suppression fits the budget or every field is at its coarsest
function searchLevels(prepared: Prepared, t: Thresholds, fixed?: Record<string, number>) {
  const levels: Record<string, number> = Object.fromEntries(POLICIES.map(p => [p.id, fixed?.[p.id] ?? 0]));
  let result = suppressMain(prepared, levels, t);
  if (fixed)
    return { levels, result };
  while (result.rate > t.maxSuppression) {
    let bestField: string | undefined;
    let bestRisk = Infinity;
    for (const field of RAISE_ORDER) {
      if (levels[field] + 1 >= POLICY_BY_ID.get(field)!.levels.length)
        continue;
      const risk = rowsAtRisk(prepared, { ...levels, [field]: levels[field] + 1 }, t);
      if (risk < bestRisk) {
        bestRisk = risk;
        bestField = field;
      }
    }
    if (!bestField)
      break;
    levels[bestField]++;
    result = suppressMain(prepared, levels, t);
  }
  return { levels, result };
}

// --- Flaw file ----------------------------------------------------------------------------------

const FLAW_REGION_CHOICES = [
  "Casablanca-Settat or Rabat-Salé-Kénitra",
  "Elsewhere in Morocco",
  "Abroad",
  "Morocco"
];

function flawRegion(raw: Row, level: number): number | null {
  if (level >= 2)
    return null;
  if (isAbroad(raw))
    return 2;
  if (level === 1)
    return 3;
  // Rabat-Salé-Kénitra (0) or Casablanca-Settat (1)
  return raw[F.region] === 0 || raw[F.region] === 1 ? 0 : 1;
}

/**
 * Flaw questions whose visibility depends on answers outside the flaw file (e.g. "asked to
 * hide" is only asked to people with security work): whether they are present tells about
 * those answers, so classes are split on it
 */
export function flawPresenceFields(survey: SurveyDefinition): string[] {
  const inside = new Set<string>([...FLAW_BLOCK, F.age]);
  return FLAW_BLOCK.filter((id) => {
    const question = survey.questions.get(id)!;
    const conditions = [question.showIf, ...(question.optionShowIf ?? []).map(rule => rule.showIf)];
    return conditions.some(condition => conditionLeaves(condition).some(leaf => !inside.has(leaf.question)));
  });
}

export function flawClassKey(row: Row, presence: readonly string[]): string {
  return [cellKey(row[FLAW_AGE]), cellKey(row[FLAW_REGION]), ...presence.map(id => (Object.hasOwn(row, id) ? "1" : "0"))].join("|");
}

function buildFlaw(prepared: Prepared, t: Thresholds) {
  const { raw, survey } = prepared;
  const presence = flawPresenceFields(survey);
  const candidates = raw.flatMap((row, i) => (FLAW_BLOCK.some(id => !isEmpty(row[id])) ? [i] : []));
  const rows = new Map<number, Row>();
  for (const i of candidates) {
    const row: Row = { [FLAW_AGE]: raw[i][F.age] === 0 ? 0 : 1 };
    for (const id of FLAW_BLOCK) {
      if (!isEmpty(raw[i][id]))
        row[id] = copy(raw[i][id]);
    }
    rows.set(i, row);
  }

  // Coarsen the region separately in each age group (and presence pattern), as little as
  // the thresholds allow
  const subgroups = new Map<string, number[]>();
  for (const i of candidates) {
    const row = rows.get(i)!;
    const label = [
      row[FLAW_AGE] === 0 ? "minors" : "adults",
      ...presence.map(id => `${id} ${Object.hasOwn(row, id) ? "answered" : "absent"}`)
    ].join(", ");
    subgroups.set(label, [...(subgroups.get(label) ?? []), i]);
  }
  const passes = (group: number[], minors: boolean) => {
    const members = group.map(i => rows.get(i)!);
    if (lDiversity(members, row => flawClassKey(row, presence), FLAW_BLOCK, t.lFlaw).minL < t.lFlaw)
      return false;
    return !minors || Math.min(...countKeys(members, [FLAW_AGE, FLAW_REGION, ...presence]).values()) >= t.kMinors;
  };

  const regionLevels: Record<string, number | "withheld"> = {};
  const withheld = new Set<number>();
  for (const [label, group] of [...subgroups].sort(([a], [b]) => a.localeCompare(b))) {
    const minors = raw[group[0]][F.age] === 0;
    let chosen: number | undefined;
    for (let level = 0; level <= 2 && chosen === undefined; level++) {
      for (const i of group) {
        const region = flawRegion(raw[i], level);
        if (region === null)
          delete rows.get(i)![FLAW_REGION];
        else
          rows.get(i)![FLAW_REGION] = region;
      }
      if (passes(group, minors))
        chosen = level;
    }
    if (chosen === undefined && minors) {
      group.forEach(i => withheld.add(i));
      regionLevels[label] = "withheld";
    }
    else {
      // Adults failing even without a region stay at level 2: the gate reports it
      regionLevels[label] = chosen ?? 2;
    }
  }
  const kept = candidates.filter(i => !withheld.has(i));
  return {
    rows: kept.map(i => rows.get(i)!),
    stats: {
      candidates: candidates.length,
      rows: kept.length,
      withheldRows: withheld.size,
      suppressionRate: candidates.length ? withheld.size / candidates.length : 0,
      regionLevels
    }
  };
}

// --- Questions -----------------------------------------------------------------------------------

function publicQuestion(question: SurveyQuestion, choices = question.choices): PublicQuestion {
  return { label: question.label, choices, multiple: question.multiple ?? false, required: question.required ?? false };
}

export function buildRelease(raw: readonly Row[], survey: SurveyDefinition, options: ReleaseOptions = {}): Release {
  const t = options.thresholds ?? THRESHOLDS;
  const random = options.random ?? cryptoRandom;
  const prepared = prepare(raw, survey);
  const { levels, result } = searchLevels(prepared, t, options.levels);

  const publicQuestions: Record<string, PublicQuestion> = {};
  for (const id of prepared.publishedIds) {
    const question = survey.questions.get(id)!;
    const compiled = prepared.compiled.get(id)?.[levels[id] ?? 0];
    publicQuestions[id] = publicQuestion(question, compiled?.choices);
  }

  const kept = result.rows.flatMap((_, i) => (result.alive[i] ? [i] : []));
  const order = shuffle(kept, random);
  const strata = Object.fromEntries(
    Object.entries(STRATA).map(([name, test]) => [name, order.map(i => test(raw[i]))])
  );

  const flaw = buildFlaw(prepared, t);
  const flawQuestions: Record<string, PublicQuestion> = {
    [FLAW_AGE]: { label: "Age group", choices: ["Younger than 18", "18 or older"], multiple: false, required: true },
    [FLAW_REGION]: {
      label: "Where the respondent lives (coarse; blank when too few answers to show it)",
      choices: FLAW_REGION_CHOICES,
      multiple: false,
      required: false
    }
  };
  for (const id of FLAW_BLOCK)
    flawQuestions[id] = publicQuestion(survey.questions.get(id)!);

  return {
    publicRows: order.map(i => result.rows[i]),
    publicQuestions,
    flawRows: shuffle(flaw.rows, random),
    flawQuestions,
    stats: {
      inputRows: raw.length,
      publicRows: kept.length,
      levels: Object.fromEntries(POLICIES.map(p => [p.name, levels[p.id]])),
      qiCells: result.qiCells,
      suppressedCells: result.suppressedCells,
      suppressedByField: Object.fromEntries(
        Object.entries(result.suppressedByField).map(([id, n]) => [POLICY_BY_ID.get(id)!.name, n])
      ),
      dependentsRemoved: result.dependentsRemoved,
      withheldRows: result.withheldRows,
      withheldMinors: result.withheldMinors,
      suppressionRate: result.rate,
      flaw: flaw.stats
    },
    audit: { strata }
  };
}
