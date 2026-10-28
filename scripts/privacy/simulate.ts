// Simulated raw exports, shaped like scripts/export-results.ts output, for testing the
// release pipeline before real answers exist. Profiles (gender, age, region, education,
// experience, employment, pay) are resampled without replacement from stateofdev.ma 2023-2024
// (data/upstream-profiles.csv) and mapped onto our bands; pay bands nest, so the mapping is
// exact. Security fields come from the priors below (planning assumptions, not measurements).
// Every answer is drawn among the choices the respondent would actually see.
import type { Answers, AnswerValue } from "../../src/lib/conditions";
import type { SurveyQuestion } from "../../src/lib/validators/survey-schema";
import type { Random } from "./rng";
import type { SurveyDefinition } from "./survey-definition";
import type { UpstreamProfile } from "./upstream";
import { evaluateCondition, getExclusiveChoiceIndices, getVisibleChoiceIndices, pruneHiddenAnswers } from "../../src/lib/conditions";
import { isOtherChoice } from "../../src/lib/other-choice";
import { F } from "./fields";
import { chance, pickFrom, pickWeighted, seededRandom, shuffle } from "./rng";
import { loadUpstreamProfiles } from "./upstream";

export interface SimulationOptions {
  n: number;
  seed: number;
  /** Share of respondents under 18 (planning range: 0.02 to 0.05) */
  minorShare?: number;
}

export type RawRow = Record<string, AnswerValue>;

interface Respondent {
  up: UpstreamProfile;
  minor: boolean;
  random: Random;
  answers: Answers;
}

type Weights = Record<number, number>;
type Generator = (r: Respondent) => AnswerValue | undefined;

// --- Mappings from upstream (stateofdev.ma) indices to ours ---------------------------------

// Abroad: our country list by area (planning prior, upstream has no country)
const COUNTRY_BY_AREA: Record<number, Weights> = {
  12: { 0: 50, 1: 12, 2: 14, 3: 8, 4: 7, 5: 9 },
  13: { 6: 65, 7: 35 },
  14: { 8: 45, 9: 25, 10: 20, 11: 10 },
  15: { 12: 50, 13: 30, 14: 20 }
};

function mapEducation({ diploma, studied }: UpstreamProfile): number {
  const byDiploma: Weights = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 9 };
  switch (studied ?? -1) {
    case 4: return 6; // coding school
    case 3: return 7; // vocational
    case 2: return 5; // private school
    case 1: return diploma === 0 ? 2 : byDiploma[diploma ?? 1];
    case 0: return diploma === 0 ? 1 : 8; // self-taught, or a diploma in another field
    case 5: return 9;
    default: return byDiploma[diploma ?? 0];
  }
}

function mapEmployment({ employment }: UpstreamProfile, abroad: boolean, random: Random): number {
  switch (employment ?? -1) {
    case 0: return 3;
    case 1:
    case 3: return abroad || chance(0.08, random) ? 1 : 0; // some work remotely for foreign employers
    case 2: return 2;
    case 4: return 6;
    case 5: return 4;
    case 6: return 5;
    default: return 7;
  }
}

// Pay bands: ours are unions of upstream's, except upstream's "> 30 000" which we split
const MAD_FROM_UPSTREAM: Weights = { 0: 4, 1: 5, 2: 6, 3: 8, 4: 8, 5: 9, 6: 9, 7: 10, 8: 10, 9: 11, 10: 11, 11: 12 };
const TJM_FROM_UPSTREAM: Weights = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };
const USD_YEAR_FROM_UPSTREAM: Weights = { 0: 0, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5 };
const USD_DAY_FROM_UPSTREAM: Weights = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 };

// --- Priors for the security-specific questions ---------------------------------------------

const DOMAIN_PRIOR: Weights = { 0: 22, 1: 14, 2: 18, 3: 4, 4: 6, 5: 4, 6: 10, 7: 3, 8: 5, 9: 3, 10: 9, 11: 2 };
const DOMAIN_PRIOR_NEWCOMER: Weights = { 0: 35, 1: 8, 2: 10, 3: 2, 4: 4, 5: 2, 6: 3, 7: 3, 8: 2, 9: 0, 10: 30, 11: 1 };

const SENIORITY_BY_EXPERIENCE: Record<number, Weights> = {
  1: { 0: 90, 1: 10 },
  2: { 0: 65, 1: 30, 2: 5 },
  3: { 0: 10, 1: 50, 2: 30, 3: 5, 4: 4, 5: 1 },
  4: { 1: 25, 2: 40, 3: 15, 4: 12, 5: 8 },
  5: { 1: 8, 2: 35, 3: 20, 4: 22, 5: 15 },
  6: { 2: 20, 3: 15, 4: 30, 5: 35 },
  7: { 2: 15, 3: 15, 4: 30, 5: 40 }
};

const BOUNTY_STATUS: Record<"offensive" | "minor" | "other", Weights> = {
  offensive: { 0: 15, 1: 30, 2: 20, 3: 25, 4: 10 },
  minor: { 0: 8, 1: 20, 2: 15, 3: 45, 4: 12 },
  other: { 0: 3, 1: 10, 2: 15, 3: 25, 4: 47 }
};

// Index 4 is the minors' "$2,000 or more"; pickVisible drops what a respondent cannot see
const BOUNTY_EARNINGS: Record<number, number[]> = {
  0: [10, 15, 25, 20, 24, 12, 8, 3, 1, 6],
  1: [30, 25, 25, 8, 4.4, 3, 1, 0.3, 0.1, 7],
  2: [55, 25, 12, 3, 1.4, 1, 0.3, 0.1, 0, 5]
};

const MAD_BY_EXPERIENCE: Record<number, Weights> = {
  1: { 4: 30, 5: 40, 6: 20, 8: 10 },
  2: { 5: 25, 6: 35, 8: 30, 9: 10 },
  3: { 6: 15, 8: 40, 9: 30, 10: 10, 11: 5 },
  4: { 8: 25, 9: 35, 10: 20, 11: 12, 12: 5, 13: 3 },
  5: { 9: 25, 10: 25, 11: 25, 12: 12, 13: 12, 14: 1 },
  6: { 10: 15, 11: 25, 12: 20, 13: 35, 14: 5 },
  7: { 10: 15, 11: 25, 12: 20, 13: 35, 14: 5 }
};
const INTERN_STIPEND: Weights = { 0: 30, 1: 25, 2: 20, 3: 14, 5: 7, 6: 3, 7: 1 };

const ORG_BY_DOMAIN: Record<"offensive" | "soc" | "grc" | "other", Weights> = {
  offensive: { 0: 45, 1: 6, 2: 15, 3: 8, 4: 3, 5: 3, 6: 3, 7: 2, 8: 10, 9: 3, 10: 2 },
  soc: { 0: 35, 1: 3, 2: 18, 3: 14, 4: 7, 5: 6, 6: 5, 7: 4, 8: 4, 9: 3, 10: 1 },
  grc: { 0: 15, 1: 20, 2: 10, 3: 22, 4: 6, 5: 9, 6: 8, 7: 4, 8: 2, 9: 3, 10: 1 },
  other: { 0: 20, 1: 4, 2: 22, 3: 12, 4: 7, 5: 9, 6: 6, 7: 5, 8: 10, 9: 4, 10: 1 }
};

// Certifications, by index; exp >= 3 unlocks CISSP (pickVisible enforces it)
const CERTS_BASE = [0, 20, 12, 12, 6, 2, 5, 10, 4, 6, 10, 8, 5];

// Planning priors for the sensitive block
const FLAW_NOTICED: Weights = { 0: 42, 1: 40, 2: 8 };
const FLAW_REPORTED: Weights = { 0: 30, 1: 22, 2: 40, 3: 5 };
const FLAW_WHY_NOT = [30, 35, 30, 20, 18, 8, 25, 10, 5, 3];
const FLAW_RESPONSE = [30, 8, 30, 15, 35, 4, 3, 6, 3];

// --- Helpers -----------------------------------------------------------------------------------

function isOffensive(r: Respondent) {
  return r.answers[F.domain] === 0;
}

function experience(r: Respondent): number {
  const value = r.answers[F.experience];
  return typeof value === "number" ? value : 0;
}

export class Simulator {
  private readonly questions: Map<string, SurveyQuestion>;
  private readonly generators: Record<string, Generator>;

  constructor(private readonly survey: SurveyDefinition) {
    this.questions = survey.questions;
    this.generators = this.buildGenerators();
  }

  /** Draws a visible choice; weights of hidden choices are set to zero */
  private pickVisible(id: string, weights: Weights | number[], r: Respondent): number | undefined {
    const question = this.questions.get(id)!;
    const visible = new Set(getVisibleChoiceIndices(question, r.answers));
    const w = question.choices.map((_, i) => (visible.has(i) ? Number((weights as Weights)[i] ?? 0) : 0));
    if (w.every(x => x === 0)) {
      // Nothing allowed by the prior: fall back to the highest visible choice below the cap
      const options = [...visible];
      return options.length ? options[options.length - 1] : undefined;
    }
    return pickWeighted(w, r.random);
  }

  private pickMany(id: string, weights: number[], count: number, r: Respondent): number[] {
    const question = this.questions.get(id)!;
    const visible = new Set(getVisibleChoiceIndices(question, r.answers));
    const exclusive = new Set(getExclusiveChoiceIndices(question));
    const w = question.choices.map((_, i) => (visible.has(i) && !exclusive.has(i) ? weights[i] ?? 1 : 0));
    const picks = new Set<number>();
    for (let i = 0; i < count && w.some(x => x > 0); i++) {
      const pick = pickWeighted(w, r.random);
      picks.add(pick);
      w[pick] = 0;
    }
    return [...picks].sort((a, b) => a - b);
  }

  private buildGenerators(): Record<string, Generator> {
    const optional = (p: number, r: Respondent) => chance(p, r.random);
    return {
      [F.gender]: r => r.up.gender,
      [F.age]: r => (r.minor ? 0 : r.up.age),
      [F.region]: r => r.up.region,
      [F.country]: r => pickFrom(COUNTRY_BY_AREA[r.up.region!], r.random),
      [F.education]: r => (r.answers[F.age] === 1 && chance(0.03, r.random) ? 0 : mapEducation(r.up)),
      [F.experience]: (r) => {
        const visible = getVisibleChoiceIndices(this.questions.get(F.experience)!, r.answers);
        return Math.min(r.up.experience ?? 0, Math.max(...visible));
      },
      [F.employment]: r => mapEmployment(r.up, (r.answers[F.region] as number) >= 12, r.random),
      [F.domain]: (r) => {
        const newcomer = r.minor || r.answers[F.employment] === 5 || experience(r) === 0;
        return this.pickVisible(F.domain, newcomer ? DOMAIN_PRIOR_NEWCOMER : DOMAIN_PRIOR, r);
      },
      [F.seniority]: r => (optional(0.05, r) ? null : this.pickVisible(F.seniority, SENIORITY_BY_EXPERIENCE[experience(r)], r)),
      [F.bountyStatus]: r =>
        pickFrom(BOUNTY_STATUS[r.minor ? "minor" : isOffensive(r) ? "offensive" : "other"], r.random),
      [F.certifications]: (r) => {
        const exp = experience(r);
        const pNone = r.minor || exp === 0 ? 0.6 : exp <= 2 ? 0.4 : exp <= 4 ? 0.25 : 0.15;
        if (chance(pNone, r.random))
          return [0];
        const weights = [...CERTS_BASE];
        if (isOffensive(r)) {
          weights[4] *= 3;
          weights[6] *= 2;
          weights[7] *= 2;
        }
        if (r.answers[F.domain] === 6 || r.answers[F.domain] === 9) {
          weights[8] *= 4;
          weights[9] *= 3;
        }
        return this.pickMany(F.certifications, weights, 1 + pickWeighted([55, 30, 15], r.random), r);
      },
      [F.incomeMad]: (r) => {
        if (optional(0.05, r))
          return null;
        if (optional(0.06, r))
          return 15;
        const employment = r.answers[F.employment];
        if (employment === 4)
          return this.pickVisible(F.incomeMad, INTERN_STIPEND, r);
        if (employment !== 0 && optional(0.1, r))
          return 0;
        if (r.up.mad != null) {
          const band = r.up.mad === 12 ? (chance(0.15, r.random) ? 14 : 13) : MAD_FROM_UPSTREAM[r.up.mad];
          return band;
        }
        return this.pickVisible(F.incomeMad, MAD_BY_EXPERIENCE[experience(r)], r);
      },
      [F.incomeTjm]: (r) => {
        if (optional(0.05, r))
          return null;
        if (optional(0.06, r))
          return 6;
        if (optional(0.1, r))
          return 5;
        return r.up.tjm != null ? TJM_FROM_UPSTREAM[r.up.tjm] : pickWeighted([30, 35, 20, 10, 5], r.random);
      },
      [F.incomeUsdYear]: (r) => {
        if (optional(0.05, r))
          return null;
        if (optional(0.06, r))
          return 6;
        return r.up.usdYear != null ? USD_YEAR_FROM_UPSTREAM[r.up.usdYear] : pickWeighted([15, 15, 30, 25, 10, 5], r.random);
      },
      [F.incomeUsdDay]: (r) => {
        if (optional(0.05, r))
          return null;
        if (optional(0.06, r))
          return 6;
        if (optional(0.1, r))
          return 5;
        return r.up.usdDay != null ? USD_DAY_FROM_UPSTREAM[r.up.usdDay] : pickWeighted([35, 35, 20, 8, 2], r.random);
      },
      [F.orgType]: (r) => {
        if (optional(0.05, r))
          return null;
        const domain = r.answers[F.domain];
        const key = domain === 0 ? "offensive" : domain === 2 || domain === 3 ? "soc" : domain === 6 || domain === 9 ? "grc" : "other";
        return this.pickVisible(F.orgType, ORG_BY_DOMAIN[key], r);
      },
      [F.bountyEarnings]: (r) => {
        if (optional(0.05, r))
          return null;
        return this.pickVisible(F.bountyEarnings, BOUNTY_EARNINGS[r.answers[F.bountyStatus] as number], r);
      },
      [F.flawNoticed]: r => (optional(0.1, r) ? null : pickFrom(FLAW_NOTICED, r.random)),
      [F.flawReported]: r => (optional(0.03, r) ? null : pickFrom(FLAW_REPORTED, r.random)),
      [F.flawWhyNot]: (r) => {
        if (optional(0.03, r))
          return [9];
        return this.pickMany(F.flawWhyNot, FLAW_WHY_NOT, 1 + pickWeighted([50, 35, 15], r.random), r);
      },
      [F.flawResponse]: (r) => {
        if (optional(0.03, r))
          return [8];
        return this.pickMany(F.flawResponse, FLAW_RESPONSE, 1 + pickWeighted([60, 30, 10], r.random), r);
      },
      [F.askedToHide]: (r) => {
        const roll = pickWeighted([62, 8, 30], r.random);
        if (roll === 0)
          return [3];
        if (roll === 1)
          return [4];
        return this.pickMany(F.askedToHide, [10, 9, 15], 1 + pickWeighted([75, 25], r.random), r);
      }
    };
  }

  // Questions without a prior: a uniform pick among the visible choices, sometimes skipped
  private generic(id: string, question: SurveyQuestion, r: Respondent): AnswerValue | undefined {
    if (!question.required && chance(0.05, r.random))
      return question.multiple ? [] : null;
    if (!question.multiple)
      return this.pickVisible(id, question.choices.map(() => 1), r);
    const exclusive = getExclusiveChoiceIndices(question);
    const visibleExclusive = getVisibleChoiceIndices(question, r.answers).filter(i => exclusive.includes(i));
    if (visibleExclusive.length && chance(0.1, r.random))
      return [visibleExclusive[0]];
    return this.pickMany(id, question.choices.map(() => 1), 1 + pickWeighted([40, 35, 25], r.random), r);
  }

  respondent(up: UpstreamProfile, minor: boolean, random: Random, index: number): RawRow {
    const r: Respondent = { up, minor, random, answers: {} };
    for (const section of this.survey.sections) {
      if (!evaluateCondition(section.showIf, r.answers))
        continue;
      section.questions.forEach((question, i) => {
        const id = `${section.label}-q-${i}`;
        if (!evaluateCondition(question.showIf, r.answers))
          return;
        const generator = this.generators[id];
        const value = generator ? generator(r) : this.generic(id, question, r);
        if (value === undefined)
          return;
        r.answers[id] = value;
        const picks = Array.isArray(value) ? value : [value];
        const otherPicked = picks.some(v => typeof v === "number" && isOtherChoice(question.choices[v] ?? ""));
        if (otherPicked && chance(0.5, random))
          r.answers[`${id}-others`] = `free text ${index}`;
      });
    }
    // Same pruning as the server, as a safety net
    const answers = pruneHiddenAnswers(this.survey.sections, r.answers);
    const day = 1 + Math.floor(random() * 28);
    return {
      ...answers,
      userId: `sim${Math.floor(random() * 2 ** 48).toString(36)}${index}`,
      lastUpdated: `2026-11-${String(day).padStart(2, "0")}T${String(Math.floor(random() * 24)).padStart(2, "0")}:00:00.000Z`
    };
  }
}

let cachedPool: UpstreamProfile[] | undefined;

export function generateSample(survey: SurveyDefinition, { n, seed, minorShare = 0.03 }: SimulationOptions): RawRow[] {
  cachedPool ??= loadUpstreamProfiles();
  const random = seededRandom(seed);
  const adults = shuffle(cachedPool.filter(p => (p.age ?? 0) > 0), random);
  const minors = cachedPool.filter(p => p.age === 0);
  const nMinors = Math.round(n * minorShare);
  const nAdults = n - nMinors;
  if (nAdults > adults.length)
    throw new Error(`Only ${adults.length} upstream adult profiles: n must be at most ${adults.length + nMinors}`);

  const simulator = new Simulator(survey);
  const rows: RawRow[] = [];
  for (let i = 0; i < nAdults; i++)
    rows.push(simulator.respondent(adults[i], false, random, i));
  // Few upstream minors: resampled with replacement (only gender and region come from them)
  for (let i = 0; i < nMinors; i++)
    rows.push(simulator.respondent(minors[Math.floor(random() * minors.length)], true, random, nAdults + i));
  return shuffle(rows, random);
}
