// Recoding rules for the public file. Level 0 of each field is the owner's decision
// (docs/privacy.md lists every merge); higher levels are coarser fallbacks the release only
// uses when level 0 cannot meet the thresholds within the suppression budget.
//
// A merge must not be undoable from the survey's branching: if two merged choices lead to
// different follow-up questions (showIf) or options (optionShowIf), which questions a row
// answered gives the original choice away. guardViolations() checks every level against
// the survey, and the release refuses to run if one fails.
import type { ConditionLeaf, ShowIfCondition, SurveyQuestion } from "../../src/lib/validators/survey-schema";
import type { SurveyDefinition } from "./survey-definition";
import { conditionLeaves } from "../../src/lib/conditions";
import { F, FLAW_BLOCK } from "./fields";

/** [new label, old labels]; old labels must match the survey choices exactly */
export type Group = [label: string, members: string[]];

export interface FieldPolicy {
  id: string;
  name: string;
  /** Level 0 first; "identity" keeps the survey's choices */
  levels: Array<Group[] | "identity">;
  /**
   * How a single cell is hidden when its row is too rare:
   * - "blank": removed (only for fields no published question depends on)
   * - "dependents": removed together with every other answer whose presence or options
   *   depend on it (see dependentsOf), so the branching cannot give it back
   * - "withheld": replaced by `withheld.label`, for the old choices in `withheld.from` only
   * - "never": kept (age: minors and adults are reported separately)
   */
  suppress: "blank" | "dependents" | "withheld" | "never";
  withheld?: { label: string; from: string[] };
}

const MOROCCO = [
  "Rabat-Salé-Kénitra",
  "Casablanca-Settat",
  "Marrakech-Safi",
  "Tanger-Tétouan-Al Hoceïma",
  "L'Oriental",
  "Fès-Meknès",
  "Béni Mellal-Khénifra",
  "Drâa-Tafilalet",
  "Souss-Massa",
  "Guelmim-Oued Noun",
  "Laâyoune-Sakia El Hamra",
  "Dakhla-Oued Ed Dahab"
];
const ABROAD = ["Europe", "US & Canada", "Middle East", "Others"];

const EDU = {
  lycee: "Still at lycée / preparing the Bac (incl. repeating or candidat libre)",
  selfTaught: "Self-taught (no formal IT or security education)",
  bachelor: "University/Public school - Bac +2/+3 (Bachelor's)",
  master: "University/Public school - Bac +5 (Master's)",
  doctorate: "University/Public school - Bac +8 (Doctoral)",
  privateSchool: "Private engineering/tech school",
  codingSchool: "Coding school (1337, YouCode, Solicode, etc.)",
  vocational: "Vocational/Technical training (OFPPT, etc.)",
  otherField: "Other field's diploma (career transition)",
  other: "Other"
};

const EXP = {
  none: "None yet (security has not been part of my job)",
  underOne: "Less than a year (incl. a current internship)",
  oneTwo: "1-2 years",
  threeFour: "3-4 years",
  fiveSix: "5-6 years",
  sevenTen: "7-10 years",
  elevenSixteen: "11-16 years",
  sixteenPlus: "16+ years"
};

const ORG = [
  "Security firm (MSSP / SOC, pentest or consulting firm, integrator, vendor)",
  "Big Four / audit & advisory",
  "IT services / ESN / nearshore (incl. regie placements)",
  "Bank / insurance / fintech",
  "Telecom / ISP",
  "Public administration",
  "State-owned company / public establishment (OCP, ONEE, CDG, etc.)",
  "Industry / energy / OT",
  "Tech / software company (startup to big tech, e-commerce)",
  "Other company (in-house team)",
  "Other"
];

const PREFER = "Prefer not to say";
const NO_DAY_RATE = "I don't bill by the day (e.g. full-time bug bounty)";

/** Groups that keep every choice as is, except the listed merges */
function keep(choices: string[], merges: Group[] = []): Group[] {
  const merged = new Map(merges.flatMap(([, members]) => members.map(m => [m, members[0]])));
  return choices.flatMap((choice): Group[] => {
    if (!merged.has(choice))
      return [[choice, [choice]]];
    if (merged.get(choice) !== choice)
      return [];
    return merges.filter(([, members]) => members[0] === choice);
  });
}

const MAD = [
  "No income / unpaid",
  "< 1 500",
  "1 500 - 2 500",
  "2 500 - 4 000",
  "< 4 000",
  "4 000 - 6 000",
  "6 000 - 8 000",
  "> 8 000",
  "8 000 - 12 000",
  "12 000 - 16 000",
  "16 000 - 20 000",
  "20 000 - 25 000",
  "25 000 - 30 000",
  "30 000 - 60 000",
  "> 60 000",
  PREFER
];

const CERT = {
  none: "None yet",
  entry: "Entry-level / free (ISC2 CC, Google, Cisco NetAcad, Fortinet FCF)",
  comptia: "CompTIA (Security+, CySA+, PenTest+)",
  ceh: "CEH (Certified Ethical Hacker)",
  oscp: "OSCP",
  offsec: "Other OffSec (OSEP, OSWE, OSED, etc.)",
  handsOn: "Hands-on offensive (CRTP, CRTO, PNPT, BSCP)",
  ine: "INE / Hack The Box (eJPT, eCPPT, CPTS)",
  cissp: "CISSP / CISM / CISA",
  iso: "ISO 27001 / 27005 / EBIOS RM",
  vendor: "Network vendor certs (Fortinet NSE 4+, Palo Alto, Cisco, Check Point, Huawei)",
  cloud: "Microsoft / cloud (SC-200, AZ-500, AWS, GCP)",
  other: "Other"
};

const BOUNTY = [
  "Nothing",
  "No cash, only swag / points / Hall of Fame",
  "Less than $500",
  "$500 - $1,999",
  "$2,000 or more",
  "$2,000 - $4,999",
  "$5,000 - $19,999",
  "$20,000 - $49,999",
  "$50,000 or more",
  PREFER
];

export const POLICIES: FieldPolicy[] = [
  { id: F.gender, name: "gender", levels: ["identity"], suppress: "blank" },
  {
    id: F.age,
    name: "age",
    levels: [[
      ["Younger than 18 years", ["Younger than 18 years"]],
      ["18 to 24 years", ["18 to 24 years"]],
      ["25 to 34 years", ["25 to 34 years"]],
      ["35 or older", ["35 to 44 years", "45 or older"]]
    ]],
    suppress: "never"
  },
  {
    id: F.region,
    name: "region",
    levels: [
      [
        ["Rabat-Salé-Kénitra", ["Rabat-Salé-Kénitra"]],
        ["Casablanca-Settat", ["Casablanca-Settat"]],
        ["Marrakech-Safi", ["Marrakech-Safi"]],
        ["Tanger-Tétouan-Al Hoceïma", ["Tanger-Tétouan-Al Hoceïma"]],
        ["Fès-Meknès", ["Fès-Meknès"]],
        ["Souss-Massa and the southern regions", ["Souss-Massa", "Guelmim-Oued Noun", "Laâyoune-Sakia El Hamra", "Dakhla-Oued Ed Dahab"]],
        ["L'Oriental, Béni Mellal-Khénifra and Drâa-Tafilalet", ["L'Oriental", "Béni Mellal-Khénifra", "Drâa-Tafilalet"]],
        ["Abroad", ABROAD]
      ],
      [
        ["Rabat-Salé-Kénitra", ["Rabat-Salé-Kénitra"]],
        ["Casablanca-Settat", ["Casablanca-Settat"]],
        ["Elsewhere in Morocco", MOROCCO.slice(2)],
        ["Abroad", ABROAD]
      ],
      [
        ["Morocco", MOROCCO],
        ["Abroad", ABROAD]
      ]
    ],
    suppress: "withheld",
    withheld: { label: "Morocco (region not shown)", from: MOROCCO }
  },
  {
    id: F.education,
    name: "education",
    levels: [
      "identity",
      [
        ["Still at lycée / preparing the Bac", [EDU.lycee]],
        // Self-taught stays apart: they skip the unemployment-after-graduation question, so
        // whether it was answered would undo the merge
        [EDU.selfTaught, [EDU.selfTaught]],
        ["Coding school or a diploma in another field", [EDU.codingSchool, EDU.otherField]],
        ["University Bac +2/+3 (Bachelor's), or other", [EDU.bachelor, EDU.other]],
        ["University Bac +5/+8, or private engineering school", [EDU.master, EDU.doctorate, EDU.privateSchool]],
        [EDU.vocational, [EDU.vocational]]
      ]
    ],
    suppress: "dependents"
  },
  {
    id: F.experience,
    name: "experience",
    levels: [
      [
        [EXP.none, [EXP.none]],
        [EXP.underOne, [EXP.underOne]],
        [EXP.oneTwo, [EXP.oneTwo]],
        [EXP.threeFour, [EXP.threeFour]],
        [EXP.fiveSix, [EXP.fiveSix]],
        [EXP.sevenTen, [EXP.sevenTen]],
        ["11 years or more", [EXP.elevenSixteen, EXP.sixteenPlus]]
      ],
      [
        [EXP.none, [EXP.none]],
        [EXP.underOne, [EXP.underOne]],
        [EXP.oneTwo, [EXP.oneTwo]],
        ["3-6 years", [EXP.threeFour, EXP.fiveSix]],
        ["7 years or more", [EXP.sevenTen, EXP.elevenSixteen, EXP.sixteenPlus]]
      ],
      [
        [EXP.none, [EXP.none]],
        ["Less than 3 years", [EXP.underOne, EXP.oneTwo]],
        ["3 years or more", [EXP.threeFour, EXP.fiveSix, EXP.sevenTen, EXP.elevenSixteen, EXP.sixteenPlus]]
      ]
    ],
    suppress: "dependents"
  },
  { id: F.employment, name: "employment", levels: ["identity"], suppress: "dependents" },
  { id: F.domain, name: "domain", levels: ["identity"], suppress: "dependents" },
  {
    id: F.seniority,
    name: "seniority",
    levels: [
      [
        ["Junior / entry-level", ["Junior / entry-level"]],
        ["Mid-level", ["Mid-level"]],
        ["Senior", ["Senior"]],
        ["Lead / Principal (no direct reports)", ["Lead / Principal (no direct reports)"]],
        ["Manager or head of security / CISO", ["Manager (leads a team)", "Head of security / CISO"]]
      ],
      [
        ["Junior or mid-level", ["Junior / entry-level", "Mid-level"]],
        ["Senior or lead", ["Senior", "Lead / Principal (no direct reports)"]],
        ["Manager or head of security / CISO", ["Manager (leads a team)", "Head of security / CISO"]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.orgType,
    name: "organization type",
    levels: [
      "identity",
      [
        ["Security firm, Big Four or IT services", ORG.slice(0, 3)],
        ["Bank, insurance, fintech or telecom", ORG.slice(3, 5)],
        ["Public administration or state-owned company", ORG.slice(5, 7)],
        ["Industry, tech or other company", ORG.slice(7, 10)],
        ["Other", ["Other"]]
      ],
      [
        ["Private sector", [...ORG.slice(0, 5), ...ORG.slice(7, 10)]],
        ["Public administration or state-owned company", ORG.slice(5, 7)],
        ["Other", ["Other"]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.incomeMad,
    name: "income (MAD)",
    levels: [
      keep(MAD, [["> 30 000", ["30 000 - 60 000", "> 60 000"]]]),
      [
        ["No income / unpaid", ["No income / unpaid"]],
        ["< 4 000", ["< 1 500", "1 500 - 2 500", "2 500 - 4 000", "< 4 000"]],
        ["4 000 - 8 000", ["4 000 - 6 000", "6 000 - 8 000"]],
        ["> 8 000 (interns)", ["> 8 000"]],
        ["8 000 - 16 000", ["8 000 - 12 000", "12 000 - 16 000"]],
        ["16 000 - 25 000", ["16 000 - 20 000", "20 000 - 25 000"]],
        ["> 25 000", ["25 000 - 30 000", "30 000 - 60 000", "> 60 000"]],
        [PREFER, [PREFER]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.incomeTjm,
    name: "daily rate (MAD)",
    levels: [
      "identity",
      [
        ["< 2 000", ["< 1 000", "1 000 - 2 000"]],
        ["2 000 - 5 000", ["2 000 - 3 000", "3 000 - 5 000"]],
        ["> 5 000", ["> 5 000"]],
        [NO_DAY_RATE, [NO_DAY_RATE]],
        [PREFER, [PREFER]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.incomeUsdYear,
    name: "salary (USD)",
    levels: [
      "identity",
      [
        ["< 30 000", ["< 20 000", "20 000 - 30 000"]],
        ["30 000 - 80 000", ["30 000 - 50 000", "50 000 - 80 000"]],
        ["> 80 000", ["80 000 - 120 000", "> 120 000"]],
        [PREFER, [PREFER]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.incomeUsdDay,
    name: "daily rate (USD)",
    levels: [
      "identity",
      [
        ["< 1 000", ["< 500", "500 - 1 000"]],
        ["1 000 - 5 000", ["1 000 - 2 000", "2 000 - 5 000"]],
        ["> 5 000", ["> 5 000"]],
        [NO_DAY_RATE, [NO_DAY_RATE]],
        [PREFER, [PREFER]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.bountyStatus,
    name: "bug bounty status",
    levels: [
      "identity",
      [
        ["Yes, regularly or now and then", ["Yes, regularly", "Yes, now and then"]],
        ["Tried it, no longer active", ["Tried it, no longer active"]],
        ["Not yet, learning or planning to", ["Not yet, learning or planning to"]],
        ["No", ["No"]]
      ]
    ],
    suppress: "dependents"
  },
  {
    id: F.bountyEarnings,
    name: "bug bounty earnings",
    levels: [
      keep(BOUNTY, [["$5,000 or more", ["$5,000 - $19,999", "$20,000 - $49,999", "$50,000 or more"]]]),
      [
        ["Nothing or only swag / points / Hall of Fame", BOUNTY.slice(0, 2)],
        ["Less than $2,000", BOUNTY.slice(2, 4)],
        ["$2,000 or more", BOUNTY.slice(4, 9)],
        [PREFER, [PREFER]]
      ]
    ],
    suppress: "blank"
  },
  {
    id: F.certifications,
    name: "certifications",
    levels: [[
      ["None yet", [CERT.none]],
      ["Entry-level (free certificates, CompTIA)", [CERT.entry, CERT.comptia]],
      ["Intermediate (CEH, hands-on offensive, INE / Hack The Box, ISO 27001, vendor or cloud)", [CERT.ceh, CERT.handsOn, CERT.ine, CERT.iso, CERT.vendor, CERT.cloud]],
      ["Advanced (OSCP and other OffSec, CISSP / CISM / CISA)", [CERT.oscp, CERT.offsec, CERT.cissp]],
      ["Other", [CERT.other]]
    ]],
    suppress: "blank"
  }
];

export const POLICY_BY_ID = new Map(POLICIES.map(p => [p.id, p]));

// Questions never published in the main file: the flaw block (separate file) and the
// country of people abroad (dropped)
export const UNPUBLISHED = new Set<string>([F.country, ...FLAW_BLOCK]);

export interface CompiledLevel {
  choices: string[];
  /** old choice index -> new choice index */
  map: number[];
  /** new index of the withheld value, if the field has one */
  withheldIndex?: number;
  /** old indices that may be withheld */
  withheldFrom?: Set<number>;
}

export function compileLevel(policy: FieldPolicy, question: SurveyQuestion, level: number): CompiledLevel {
  const spec = policy.levels[level];
  const groups: Group[] = spec === "identity" ? question.choices.map(c => [c, [c]]) : spec;
  const map: number[] = Array.from({ length: question.choices.length }, () => -1);
  groups.forEach(([, members], newIndex) => {
    for (const member of members) {
      const old = question.choices.indexOf(member);
      if (old === -1)
        throw new Error(`${policy.id} (${policy.name}) level ${level}: no choice "${member}" in the survey`);
      if (map[old] !== -1)
        throw new Error(`${policy.id} (${policy.name}) level ${level}: "${member}" is in two groups`);
      map[old] = newIndex;
    }
  });
  const missing = question.choices.filter((_, i) => map[i] === -1);
  if (missing.length)
    throw new Error(`${policy.id} (${policy.name}) level ${level}: choices not mapped: ${missing.join(", ")}`);

  const choices = groups.map(([label]) => label);
  if (policy.suppress !== "withheld" || !policy.withheld)
    return { choices, map };
  const withheldFrom = new Set(policy.withheld.from.map(label => question.choices.indexOf(label)));
  // At a level where the withheld choices are already one group, withholding adds nothing
  const targets = new Set([...withheldFrom].map(old => map[old]));
  if (targets.size === 1)
    return { choices, map };
  return { choices: [...choices, policy.withheld.label], map, withheldIndex: choices.length, withheldFrom };
}

// --- Guard analysis -----------------------------------------------------------------------------

interface Guard {
  /** the published question whose visibility or options the condition controls */
  id: string;
  where: string;
  condition: ShowIfCondition;
}

/** Every condition of the published questions (question showIf, section showIf, optionShowIf) */
function publishedGuards(survey: SurveyDefinition, published: (id: string) => boolean): Guard[] {
  const guards: Guard[] = [];
  for (const section of survey.sections) {
    section.questions.forEach((question, index) => {
      const id = `${section.label}-q-${index}`;
      if (!published(id))
        return;
      if (section.showIf)
        guards.push({ id, where: `section ${section.label}`, condition: section.showIf });
      if (question.showIf)
        guards.push({ id, where: id, condition: question.showIf });
      for (const rule of question.optionShowIf ?? [])
        guards.push({ id, where: `${id} options ${rule.options.join(" / ")}`, condition: rule.showIf });
    });
  }
  return guards;
}

/**
 * Published answers that must go when `field` is hidden: every question whose presence or
 * options depend on it, then on those, and so on. Quasi-identifiers are not removed: they
 * are part of the compared values, so rows that look alike agree on them anyway
 */
export function dependentsOf(
  survey: SurveyDefinition,
  field: string,
  isQuasiIdentifier: (id: string) => boolean,
  published: (id: string) => boolean = id => !UNPUBLISHED.has(id)
): string[] {
  const guards = publishedGuards(survey, published);
  const found = new Set<string>();
  const queue = [field];
  while (queue.length) {
    const current = queue.shift()!;
    for (const guard of guards) {
      if (found.has(guard.id) || guard.id === field || isQuasiIdentifier(guard.id))
        continue;
      if (conditionLeaves(guard.condition).some(leaf => leaf.question === current)) {
        found.add(guard.id);
        queue.push(guard.id);
      }
    }
  }
  return [...survey.questions.keys()].filter(id => found.has(id));
}

function leafValue(leaf: ConditionLeaf, value: number): boolean {
  if (leaf.equals != null)
    return value === leaf.equals;
  if (leaf.notEquals != null)
    return value !== leaf.notEquals;
  if (leaf.in)
    return leaf.in.includes(value);
  return !leaf.notIn!.includes(value);
}

/** Which published guards reference this question; empty means it can be blanked safely */
export function guardsOn(survey: SurveyDefinition, questionId: string, published: (id: string) => boolean) {
  return publishedGuards(survey, published).flatMap(guard =>
    conditionLeaves(guard.condition)
      .filter(leaf => leaf.question === questionId)
      .map(leaf => ({ where: guard.where, leaf }))
  );
}

/**
 * Problems with the policies against the current survey: merges whose members follow
 * different branches, blanked fields that something depends on, unmapped choices
 */
export function guardViolations(
  survey: SurveyDefinition,
  published: (id: string) => boolean = id => !UNPUBLISHED.has(id),
  policies: FieldPolicy[] = POLICIES
): string[] {
  const problems: string[] = [];
  for (const policy of policies) {
    const question = survey.questions.get(policy.id);
    if (!question) {
      problems.push(`${policy.id} (${policy.name}): not in the survey`);
      continue;
    }
    const guards = guardsOn(survey, policy.id, published);
    const signature = (old: number) => guards.map(g => (leafValue(g.leaf, old) ? "1" : "0")).join("");
    const sameBranch = (olds: number[], what: string) => {
      const signatures = new Set(olds.map(signature));
      if (signatures.size > 1) {
        const where = guards.filter((_, i) => new Set(olds.map(o => signature(o)[i])).size > 1).map(g => g.where);
        problems.push(`${policy.id} (${policy.name}) ${what}: merged choices follow different branches (${[...new Set(where)].join("; ")})`);
      }
    };
    policy.levels.forEach((_, level) => {
      let compiled: CompiledLevel;
      try {
        compiled = compileLevel(policy, question, level);
      }
      catch (error) {
        problems.push((error as Error).message);
        return;
      }
      compiled.choices.forEach((label, newIndex) => {
        const olds = compiled.map.flatMap((n, old) => (n === newIndex ? [old] : []));
        sameBranch(olds, `level ${level} "${label}"`);
      });
      if (compiled.withheldFrom)
        sameBranch([...compiled.withheldFrom], `withheld "${policy.withheld!.label}"`);
    });
    if (policy.suppress === "blank" && guards.length)
      problems.push(`${policy.id} (${policy.name}) is blanked when rare, but ${guards.map(g => g.where).join("; ")} depend on it`);
  }
  return problems;
}
