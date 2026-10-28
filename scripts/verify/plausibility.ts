/**
 * Plausibility evidence for the survey's edit rules (hide a choice, or ask "is that right?"),
 * rebuilt from stateofdev.ma's open answers. Also measures respondent burden per profile leaf
 * and writes the pairwise persona grid used by the other verification agents.
 *
 * Usage, from the repo root:
 *   pnpm tsx scripts/verify/plausibility.ts             report from the committed counts
 *   pnpm tsx scripts/verify/plausibility.ts --rebuild   recount from the upstream git refs first
 *   pnpm tsx scripts/verify/plausibility.ts --burden    add the per-leaf burden table
 *   pnpm tsx scripts/verify/plausibility.ts --grid      write tests/personas/grid.json
 *   --strict                                            exit 1 on a reproduction miss or a contradiction
 *
 * Method (docs/verification/method-audit.md): upstream choices are matched by LABEL, year by
 * year, to this survey's labels (never by index); shares are pooled over 2021-2025 with Wilson
 * 95% intervals. HIDE: 95% sure the share is under 0.5% (Wilson upper bound). CHECK: share under
 * 2%. Only aggregated counts are committed (upstream-counts.json), never answer rows.
 */
import type { Answers } from "../../src/lib/conditions";
import type { ConditionLeaf, ShowIfCondition, SurveyQuestion } from "../../src/lib/validators/survey-schema";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  conditionLeaves,
  evaluateCondition,
  getExclusiveChoiceIndices,
  getSoftCheckMessage,
  getVisibleChoiceIndices
} from "../../src/lib/conditions";
import { SurveyFileSchema } from "../../src/lib/validators/survey-schema";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COUNTS_FILE = path.join(ROOT, "scripts/verify/upstream-counts.json");
const GRID_FILE = path.join(ROOT, "tests/personas/grid.json");
const SURVEY_DIR = path.join(ROOT, "survey");

// ---------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------

const Z = 1.959964;
const HIDE_BELOW = 0.005;
const CHECK_BELOW = 0.02;

function wilson(x: number, n: number): [number, number] {
  if (n === 0)
    return [0, 1];
  const p = x / n;
  const z2 = Z * Z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

type Verdict = "HIDE" | "CHECK" | "FINE" | "NO DATA";

function verdictOf(x: number, n: number): Verdict {
  if (n === 0)
    return "NO DATA";
  if (wilson(x, n)[1] < HIDE_BELOW)
    return "HIDE";
  if (x / n < CHECK_BELOW)
    return "CHECK";
  return "FINE";
}

function pct(value: number, digits = 2): string {
  return `${(100 * value).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------------------------
// Upstream dimensions: each upstream question is found by its label, and each upstream choice
// is mapped by its label to one canonical label (this survey's wording where it exists)
// ---------------------------------------------------------------------------------------------

const DIMS = [
  "age",
  "education",
  "experience",
  "employment",
  "location",
  "plans",
  "usdAnswered",
  "mad",
  "usd",
  "tjm",
  "usdDaily",
  "unemployment",
  "social"
] as const;
type Dim = typeof DIMS[number];

interface DimSpec {
  question: RegExp;
  labels: Array<[string, RegExp]>;
}

const EMPLOYEE = "Employee (upstream full-time or part-time; Morocco or foreign employer)";
const FREELANCER = "Freelancer / independent (incl. full-time bug bounty, foreign clients)";
const FOUNDER = "Founder or running my own company";
const INTERN = "Internship or apprenticeship (incl. PFE, ANAPEC / Idmaj contract)";
const STUDENT = "Student (school, university, 1337, OFPPT; if you also work, pick your job)";
const LOOKING = "Looking for work";

const NONE_YET = "None yet (security has not been part of my job)";
const UNDER_1 = "Less than a year (incl. a current internship)";
const SELF_TAUGHT = "Self-taught (no formal IT or security education)";
const DOCTORAL = "University/Public school - Bac +8 (Doctoral)";
const MOROCCO = "Morocco (one of the 12 regions)";
const ABROAD = "Abroad (Europe, US & Canada, Middle East, Others)";
const WORKING_OUTSIDE = "Currently working outside Morocco";

function exact(labels: string[]): Array<[string, RegExp]> {
  return labels.map(label => [label, new RegExp(`^${normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)]);
}

const MAD_BANDS = [
  "< 4 000",
  "4 000 - 6 000",
  "6 000 - 8 000",
  "8 000 - 10 000",
  "10 000 - 12 000",
  "12 000 - 14 000",
  "14 000 - 16 000",
  "16 000 - 18 000",
  "18 000 - 20 000",
  "20 000 - 22 000",
  "22 000 - 25 000",
  "25 000 - 30 000",
  "> 30 000"
];
const USD_DAILY_BANDS = ["< 200", "200 - 500", "500 - 1 000", "1 000 - 2 000", "2 000 - 3 000", "3 000 - 5 000", "5 000 - 10 000", "> 10 000"];

const SPECS: Record<Dim, DimSpec> = {
  age: {
    question: /what is your age/,
    labels: exact(["Younger than 18 years", "18 to 24 years", "25 to 34 years", "35 to 44 years", "45 or older"])
  },
  // 2021-2024 asked the highest diploma (level), 2025 the education background (path): the
  // level labels map to the University bands, so only 2025 feeds the school-type labels
  education: {
    question: /highest diploma|education background/,
    labels: [
      [SELF_TAUGHT, /^self-taught/],
      ["University/Public school - Bac +2/+3 (Bachelor's)", /bac \+2/],
      ["University/Public school - Bac +5 (Master's)", /bac \+5/],
      [DOCTORAL, /bac \+8/],
      ["Private engineering/tech school", /^private engineering/],
      ["Coding school (1337, YouCode, Solicode, etc.)", /^coding school/],
      ["Vocational/Technical training (OFPPT, etc.)", /^vocational/],
      ["Other field's diploma (career transition)", /^other field/],
      ["Other", /^other$/]
    ]
  },
  experience: {
    question: /years have you been coding professionally/,
    labels: [
      [NONE_YET, /^i don't have any professional/],
      [UNDER_1, /^less than a year$/],
      ...exact(["1-2 years", "3-4 years", "5-6 years", "7-10 years", "11-16 years", "16+ years"])
    ]
  },
  employment: {
    question: /employment status/,
    labels: [
      [EMPLOYEE, /full-time|part-time/],
      [FREELANCER, /^freelancer/],
      [FOUNDER, /^founder/],
      [INTERN, /^internship/],
      [STUDENT, /^student/],
      [LOOKING, /^looking for work/],
      ["Other", /^other$/]
    ]
  },
  location: {
    question: /where are you currently located/,
    labels: [
      [MOROCCO, /^(?:rabat|casablanca|marrakech|tanger|l'oriental|f.s-|b.ni |dr.a-|souss|guelmim|la.youne|dakhla)/],
      [ABROAD, /^(?:europe|us & canada|middle east|others)$/]
    ]
  },
  plans: {
    question: /plans to work outside morocco/,
    labels: exact(["Yes, in the next 12 months", "Yes, in the next 24 months", "Still hesitating", WORKING_OUTSIDE, "No"])
  },
  // Not an upstream question: whether the row answered the yearly USD salary (foreign employer)
  usdAnswered: { question: /gross salary range per year in usd/, labels: [["no", /^$/], ["yes", /^$/]] },
  mad: { question: /net salary range per month in mad/, labels: exact(MAD_BANDS) },
  usd: {
    question: /gross salary range per year in usd/,
    labels: [
      ...exact(["< 20 000", "20 000 - 25 000", "25 000 - 30 000"]),
      // 2021-2024 printed "30 500 - 40 000" (and nothing for 25 000 - 30 500)
      ["30 000 - 40 000", /^30 [05]00 - 40 000$/],
      ...exact(["40 000 - 50 000", "50 000 - 60 000", "60 000 - 80 000", "80 000 - 100 000", "100 000 - 120 000", "120 000 - 150 000", "150 000 - 200 000", "> 200 000"])
    ]
  },
  tjm: {
    question: /per day in mad/,
    labels: exact(["< 1 000", "1 000 - 1 500", "1 500 - 2 000", "2 000 - 2 500", "2 500 - 3 000", "3 000 - 4 000", "4 000 - 5 000", "> 5 000"])
  },
  usdDaily: { question: /daily gross wage in usd/, labels: exact(USD_DAILY_BANDS) },
  unemployment: {
    question: /unemployed after graduation/,
    labels: [
      ["None, I worked straight after my graduation", /^none, i worked straight after my graduation$/],
      ...exact(["Up to 3 months", "Up to 6 months", "Up to 1 year", "More than 1 year"])
    ]
  },
  social: {
    question: /primary social network/,
    labels: [
      ["LinkedIn", /^linkedin$/],
      ["X (Twitter)", /^(?:x \(twitter\)|twitter)$/],
      ["YouTube", /^youtube$/],
      ["Discord", /^discord$/],
      ["Reddit", /^reddit$/],
      ["Instagram", /^instagram$/],
      ["Telegram", /^telegram$/],
      ["Facebook", /^facebook$/],
      ["WhatsApp", /^whatsapp$/],
      ["Slack", /^slack$/],
      ["Gitter", /^gitter$/],
      ["None", /^none$/],
      ["Other", /^other$/]
    ]
  }
};

// Cross-tabs kept in the counts file. A row enters a table when its last column is answered;
// the profile table keeps every row. -1 means "not answered" (or not asked that year)
const TABLES = {
  profile: ["age", "education", "experience", "employment"],
  income: ["experience", "employment", "mad"],
  usd: ["location", "employment", "experience", "usd"],
  plans: ["location", "employment", "usdAnswered", "plans"],
  tjm: ["experience", "tjm"],
  usdDaily: ["location", "usdDaily"],
  unemployment: ["education", "employment", "unemployment"],
  social: ["social"]
} satisfies Record<string, Dim[]>;
type Table = keyof typeof TABLES;

const SOURCES: Record<string, string> = {
  2021: "upstream/master:results/2021/data",
  2022: "upstream/master:results/2022/data",
  2023: "upstream/master:results/2023/data",
  2024: "upstream/master:results/2024/data",
  2025: "upstream/2025-resultes:results/2025/data"
};
const POOLED = ["2021", "2022", "2023", "2024", "2025"];
const PUBLISHED = ["2021", "2022", "2023", "2024"];

interface CountsFile {
  about: string;
  sources: Record<string, string>;
  rows: Record<string, number>;
  dims: Record<Dim, string[]>;
  matched: Record<string, Partial<Record<Dim, Record<string, string | null>>>>;
  tables: Record<Table, Record<string, number[][]>>;
  multiPick2025: Array<{ question: string; picks: number[] }>;
  helped2025: { question: string; answered: number; exitOnly: number; exitWithOthers: number };
}

function normalize(label: string): string {
  return label
    .normalize("NFC")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Upstream labels are committed for the audit trail, without their emoji
function clean(label: string): string {
  return label.replace(/\p{Extended_Pictographic}/gu, "").replace(/️/g, "").replace(/\s+/g, " ").trim();
}

interface UpstreamQuestion {
  label: string;
  choices?: string[];
}
type UpstreamRow = Record<string, unknown>;

function gitShow(ref: string): string {
  return execFileSync("git", ["show", ref], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function rebuildCounts(): CountsFile {
  const dims = Object.fromEntries(DIMS.map(dim => [dim, SPECS[dim].labels.map(([label]) => label)])) as Record<Dim, string[]>;
  const counts: CountsFile = {
    about: "Aggregated counts of stateofdev.ma's open answers (2021-2025), regenerated by `pnpm tsx scripts/verify/plausibility.ts --rebuild`. Choices are matched by label to the canonical labels in `dims`; `matched` lists every upstream label and where it went (null: not used). Table cells are [dim indices..., count], -1 = not answered. No answer rows are stored.",
    sources: SOURCES,
    rows: {},
    dims,
    matched: {},
    tables: Object.fromEntries(Object.keys(TABLES).map(table => [table, {}])) as CountsFile["tables"],
    multiPick2025: [],
    helped2025: { question: "", answered: 0, exitOnly: 0, exitWithOthers: 0 }
  };

  for (const [year, base] of Object.entries(SOURCES)) {
    const questions = JSON.parse(gitShow(`${base}/questions.json`)) as Record<string, UpstreamQuestion>;
    const rows = (JSON.parse(gitShow(`${base}/results.json`)) as { results: UpstreamRow[] }).results;
    counts.rows[year] = rows.length;
    counts.matched[year] = {};

    const resolved = new Map<Dim, { id: string; map: number[] }>();
    for (const dim of DIMS) {
      const spec = SPECS[dim];
      const found = Object.entries(questions).filter(([, q]) => spec.question.test(normalize(q.label)));
      if (found.length > 1)
        throw new Error(`${year}: ${found.length} upstream questions match ${dim}`);
      if (found.length === 0)
        continue;
      const [id, question] = found[0];
      const choices = question.choices ?? [];
      if (dim === "usdAnswered") {
        resolved.set(dim, { id, map: [] });
        continue;
      }
      const map = choices.map(choice => spec.labels.findIndex(([, re]) => re.test(normalize(choice))));
      resolved.set(dim, { id, map });
      counts.matched[year][dim] = Object.fromEntries(
        choices.map((choice, index) => [clean(choice), map[index] === -1 ? null : spec.labels[map[index]][0]])
      );
    }

    const valueOf = (row: UpstreamRow, dim: Dim): number => {
      const entry = resolved.get(dim);
      if (!entry)
        return -1;
      const raw = row[entry.id];
      if (dim === "usdAnswered")
        return raw == null ? 0 : 1;
      if (typeof raw !== "number")
        return -1;
      return entry.map[raw] ?? -1;
    };

    for (const [table, columns] of Object.entries(TABLES) as Array<[Table, Dim[]]>) {
      const cells = new Map<string, number>();
      for (const row of rows) {
        const values = columns.map(dim => valueOf(row, dim));
        if (table !== "profile" && values[values.length - 1] === -1)
          continue;
        const key = values.join(",");
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
      counts.tables[table][year] = [...cells.entries()]
        .map(([key, n]) => [...key.split(",").map(Number), n])
        .sort((a, b) => a.join(",").localeCompare(b.join(","), "en", { numeric: true }));
    }

    if (year === "2025") {
      for (const [id, question] of Object.entries(questions)) {
        const label = normalize(question.label);
        const answered = rows.map(row => row[id]).filter((value): value is number[] => Array.isArray(value) && value.length > 0);
        if (/\(pick 3(?: max)?\)/.test(label)) {
          const picks: number[] = [];
          for (const value of answered)
            picks[value.length] = (picks[value.length] ?? 0) + 1;
          counts.multiPick2025.push({ question: clean(question.label), picks: Array.from(picks, n => n ?? 0) });
        }
        if (/helped your career/.test(label)) {
          const exit = (question.choices ?? []).findIndex(choice => /hasn't helped/i.test(choice));
          counts.helped2025 = {
            question: clean(question.label),
            answered: answered.length,
            exitOnly: answered.filter(value => value.length === 1 && value[0] === exit).length,
            exitWithOthers: answered.filter(value => value.length > 1 && value.includes(exit)).length
          };
        }
      }
    }
  }
  return counts;
}

function writeJson(file: string, data: unknown): void {
  // One line per cell or short list of numbers, so diffs stay readable
  const inline = (_: string, value: unknown) =>
    Array.isArray(value) && value.every(item => typeof item === "number") ? `@@${JSON.stringify(value)}` : value;
  const text = JSON.stringify(data, inline, 2).replace(/"@@(\[[^"]*\])"/g, "$1");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`);
}

// ---------------------------------------------------------------------------------------------
// Measuring shares in the counts
// ---------------------------------------------------------------------------------------------

type Selector = Partial<Record<Dim, string[]>>;

function measure(counts: CountsFile, table: Table, years: string[], given: Selector, target: Selector): { x: number; n: number } {
  const columns: Dim[] = TABLES[table];
  const indexSets = (selector: Selector) => Object.entries(selector).map(([dim, labels]) => {
    const column = columns.indexOf(dim as Dim);
    if (column === -1)
      throw new Error(`table ${table} has no ${dim} column`);
    const indices = labels.map((label) => {
      const index = counts.dims[dim as Dim].indexOf(label);
      if (index === -1)
        throw new Error(`unknown ${dim} label: ${label}`);
      return index;
    });
    return { column, indices: new Set(indices) };
  });
  const givenSets = indexSets(given);
  const targetSets = indexSets(target);
  let x = 0;
  let n = 0;
  for (const year of years) {
    for (const cell of counts.tables[table][year] ?? []) {
      const count = cell[cell.length - 1];
      if (!givenSets.every(({ column, indices }) => indices.has(cell[column])))
        continue;
      if (targetSets.some(({ column }) => cell[column] === -1))
        continue;
      n += count;
      if (targetSets.every(({ column, indices }) => indices.has(cell[column])))
        x += count;
    }
  }
  return { x, n };
}

// ---------------------------------------------------------------------------------------------
// Survey loading and the questions the rules refer to (found by label, not by position)
// ---------------------------------------------------------------------------------------------

interface FlatQuestion {
  id: string;
  q: SurveyQuestion;
  sectionShowIf?: ShowIfCondition;
}

function loadSurvey(): { flat: FlatQuestion[]; hash: string } {
  const files = fs.readdirSync(SURVEY_DIR).filter(file => file.endsWith(".yml")).sort();
  const hash = createHash("sha256");
  const sections = files.map((file) => {
    const text = fs.readFileSync(path.join(SURVEY_DIR, file), "utf8");
    hash.update(text);
    return SurveyFileSchema.parse(yaml.load(text));
  }).sort((a, b) => a.position - b.position);
  const flat: FlatQuestion[] = [];
  for (const section of sections) {
    section.questions.forEach((q, index) => {
      flat.push({ id: `${section.label}-q-${index}`, q, sectionShowIf: section.showIf });
    });
  }
  return { flat, hash: hash.digest("hex") };
}

const SURVEY_Q = {
  age: /^What is your age\?$/,
  location: /^Where are you currently located\?$/,
  education: /^What is your IT or security education\?/,
  experience: /^How many years have you worked in security\?/,
  employment: /current employment situation/,
  domain: /security domain best describes/,
  seniority: /seniority level/,
  bugBounty: /take part in bug bounty/,
  income: /^Net monthly income in MAD/,
  tjm: /daily rate \(TJM\) in MAD/,
  usd: /^Gross yearly salary in USD/,
  usdDaily: /daily rate in USD/,
  plans: /plans to work outside Morocco/
} as const;
type SurveyKey = keyof typeof SURVEY_Q;

function findQuestion(flat: FlatQuestion[], key: SurveyKey): FlatQuestion {
  const found = flat.filter(fq => SURVEY_Q[key].test(fq.q.label));
  if (found.length !== 1)
    throw new Error(`expected one survey question for ${key}, found ${found.length}`);
  return found[0];
}

function choiceIndex(fq: FlatQuestion, label: string): number {
  const index = fq.q.choices.indexOf(label);
  if (index === -1)
    throw new Error(`"${label}" is not a choice of ${fq.id}`);
  return index;
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

interface SurveyRule {
  question: SurveyKey;
  options: string[];
  // The rule's condition (becomes the soft check's `when`)
  when: Partial<Record<SurveyKey, string[]>>;
  // Other answers the question needs to be shown with these options (not part of the rule)
  context?: Partial<Record<SurveyKey, string>>;
  // Copy for the soft check this rule proposes when the survey has none
  message?: string;
}

interface Rule {
  id: string;
  text: string;
  table?: Table;
  given?: Selector;
  target?: Selector;
  // Years whose question measures the same thing as ours (default: 2021-2025 pooled)
  years?: string[];
  survey?: SurveyRule;
  // The upstream share bounds ours from above (our band is a sub-band of the measured one)
  upperBound?: string;
  // Class when the verdict is not a rarity: impossible by definition, or a judgment without data
  judgment?: "hard" | "soft" | "fine";
  note?: string;
}

const EMPLOYEE_MA = "Employee of an organization in Morocco (public or private, incl. nearshore)";
const EMPLOYEE_FOREIGN = "Employee of a foreign organization (abroad or remote, incl. employer-of-record)";

const AGE_18_24 = ["18 to 24 years"];
const AGE_25_34 = ["25 to 34 years"];
const AGE_35_PLUS = ["35 to 44 years", "45 or older"];
const EXP_UNDER_3 = [NONE_YET, UNDER_1, "1-2 years"];
const EXP_SURVEY_UNDER_3 = [UNDER_1, "1-2 years"];
const EXP_5_PLUS = ["5-6 years", "7-10 years", "11-16 years", "16+ years"];
const EXP_7_PLUS = ["7-10 years", "11-16 years", "16+ years"];
const EXP_11_PLUS = ["11-16 years", "16+ years"];
const ABROAD_REGIONS = ["Europe", "US & Canada", "Middle East", "Others"];
const MAD_8K_PLUS = MAD_BANDS.slice(3);
const WORKING = [EMPLOYEE, FREELANCER, FOUNDER, "Other"];

// The published figures (docs/survey-redesign.md, "Validation method"), on 2021-2024
interface Published {
  text: string;
  published: number;
  tolerance: number;
  table: Table;
  given: Selector;
  target: Selector;
  definition: string;
}

const PUBLISHED_FIGURES: Published[] = [
  {
    text: "Founders among 18-24",
    published: 0.011,
    tolerance: 0.0005,
    table: "profile",
    given: { age: AGE_18_24 },
    target: { employment: [FOUNDER] },
    definition: "P(founder | 18-24), employment answered"
  },
  {
    text: "Self-taught among 35+ founders",
    published: 0.15,
    tolerance: 0.005,
    table: "profile",
    given: { age: AGE_35_PLUS, employment: [FOUNDER] },
    target: { education: [SELF_TAUGHT] },
    definition: "P(self-taught | 35+ founder); the survey-order share P(founder | 35+ self-taught) is printed below"
  },
  {
    text: "No experience among 35+ (career switchers)",
    published: 0.05,
    tolerance: 0.005,
    table: "profile",
    given: { age: AGE_35_PLUS, employment: WORKING },
    target: { experience: [NONE_YET] },
    definition: "P(no experience | 35+ in work: employee, freelancer, founder, other); all 35+ printed below"
  },
  {
    text: "11+ years among 18-24",
    published: 0.0008,
    tolerance: 0.00005,
    table: "profile",
    given: { age: AGE_18_24 },
    target: { experience: EXP_11_PLUS },
    definition: "P(11-16 or 16+ years | 18-24), experience answered"
  }
];

// Pairs along age -> education -> experience -> employment (the order the survey asks them),
// so each share is P(later answer | earlier answers)
const PAIR_RULES: Rule[] = [
  {
    id: "exp-5-6-at-18-24",
    text: "5-6 years | 18-24",
    table: "profile",
    given: { age: AGE_18_24 },
    target: { experience: ["5-6 years"] },
    survey: { question: "experience", options: ["5-6 years"], when: { age: AGE_18_24 } }
  },
  {
    id: "exp-7-10-at-18-24",
    text: "7-10 years | 18-24",
    table: "profile",
    given: { age: AGE_18_24 },
    target: { experience: ["7-10 years"] },
    survey: { question: "experience", options: ["7-10 years"], when: { age: AGE_18_24 } }
  },
  {
    id: "exp-11-plus-at-18-24",
    text: "11+ years | 18-24",
    table: "profile",
    given: { age: AGE_18_24 },
    target: { experience: EXP_11_PLUS },
    survey: { question: "experience", options: EXP_11_PLUS, when: { age: AGE_18_24 } }
  },
  {
    id: "exp-11-16-at-25-34",
    text: "11-16 years | 25-34",
    table: "profile",
    given: { age: AGE_25_34 },
    target: { experience: ["11-16 years"] },
    survey: { question: "experience", options: ["11-16 years"], when: { age: AGE_25_34 } }
  },
  {
    id: "exp-16-plus-at-25-34",
    text: "16+ years | 25-34",
    table: "profile",
    given: { age: AGE_25_34 },
    target: { experience: ["16+ years"] },
    survey: { question: "experience", options: ["16+ years"], when: { age: AGE_25_34 } }
  },
  {
    id: "exp-none-at-35-plus",
    text: "No experience | 35+",
    table: "profile",
    given: { age: AGE_35_PLUS },
    target: { experience: [NONE_YET] },
    survey: { question: "experience", options: [NONE_YET], when: { age: AGE_35_PLUS } }
  },
  {
    id: "doctorate-at-18-24",
    text: "Doctorate (Bac +8) | 18-24",
    table: "profile",
    given: { age: AGE_18_24 },
    target: { education: [DOCTORAL] },
    years: ["2025"],
    survey: { question: "education", options: [DOCTORAL], when: { age: AGE_18_24 } },
    note: "2021-2024 asked the highest diploma COMPLETED; ours counts doctorates in progress, as 2025 does"
  },
  {
    id: "doctorate-at-25-34",
    text: "Doctorate (Bac +8) | 25-34",
    table: "profile",
    given: { age: AGE_25_34 },
    target: { education: [DOCTORAL] },
    years: ["2025"],
    survey: { question: "education", options: [DOCTORAL], when: { age: AGE_25_34 } },
    note: "same construct note; borderline at the 2% line"
  },
  {
    id: "founder-at-18-24",
    text: "Founder | 18-24",
    table: "profile",
    given: { age: AGE_18_24 },
    target: { employment: [FOUNDER] },
    survey: { question: "employment", options: [FOUNDER], when: { age: AGE_18_24 } }
  },
  {
    id: "founder-under-3y",
    text: "Founder | under 3 years",
    table: "profile",
    given: { experience: EXP_UNDER_3 },
    target: { employment: [FOUNDER] },
    survey: { question: "employment", options: [FOUNDER], when: { experience: EXP_UNDER_3 } }
  },
  {
    id: "founder-at-35-plus-self-taught",
    text: "Founder | 35+ self-taught",
    table: "profile",
    given: { age: AGE_35_PLUS, education: [SELF_TAUGHT] },
    target: { employment: [FOUNDER] },
    survey: { question: "employment", options: [FOUNDER], when: { age: AGE_35_PLUS, education: [SELF_TAUGHT] } }
  },
  {
    id: "intern-at-35-plus",
    text: "Intern | 35+",
    table: "profile",
    given: { age: AGE_35_PLUS },
    target: { employment: [INTERN] },
    survey: { question: "employment", options: [INTERN], when: { age: AGE_35_PLUS } }
  },
  {
    id: "intern-5-plus-years",
    text: "Intern | 5+ years",
    table: "profile",
    given: { experience: EXP_5_PLUS },
    target: { employment: [INTERN] },
    survey: { question: "employment", options: [INTERN], when: { experience: EXP_5_PLUS } }
  },
  {
    id: "student-at-35-plus",
    text: "Student | 35+",
    table: "profile",
    given: { age: AGE_35_PLUS },
    target: { employment: [STUDENT] },
    survey: { question: "employment", options: [STUDENT], when: { age: AGE_35_PLUS } }
  },
  {
    id: "student-7-plus-years",
    text: "Student | 7+ years",
    table: "profile",
    given: { experience: EXP_7_PLUS },
    target: { employment: [STUDENT] },
    survey: { question: "employment", options: [STUDENT], when: { experience: EXP_7_PLUS } }
  },
  {
    id: "looking-at-35-plus",
    text: "Looking for work | 35+",
    table: "profile",
    given: { age: AGE_35_PLUS },
    target: { employment: [LOOKING] },
    survey: { question: "employment", options: [LOOKING], when: { age: AGE_35_PLUS } },
    note: "owner decision: never checked (sensitive situation)"
  }
];

const EDIT_RULES: Rule[] = [
  {
    id: "income-over-60k-under-3y",
    text: "MAD > 60 000 | under 3 years",
    table: "income",
    given: { experience: EXP_SURVEY_UNDER_3 },
    target: { mad: ["> 30 000"] },
    upperBound: "upstream tops out at > 30 000, which contains > 60 000",
    survey: {
      question: "income",
      options: ["> 60 000"],
      when: { experience: EXP_SURVEY_UNDER_3 },
      context: { employment: EMPLOYEE_MA },
      message: "Just checking: more than 60 000 MAD a month with under 3 years of security work is rare. Is that right?"
    }
  },
  {
    id: "intern-over-8k",
    text: "Intern stipend > 8 000 MAD",
    table: "income",
    given: { employment: [INTERN] },
    target: { mad: MAD_8K_PLUS },
    survey: { question: "income", options: ["> 8 000"], when: { employment: [INTERN] } },
    note: "upstream interns answered a CDI salary question (self-selected): no basis for a check either way"
  },
  {
    id: "senior-under-4k",
    text: "MAD < 4 000 | 7+ years, employee",
    table: "income",
    given: { experience: EXP_7_PLUS, employment: [EMPLOYEE] },
    target: { mad: ["< 4 000"] },
    survey: {
      question: "income",
      options: ["< 4 000"],
      when: { experience: EXP_7_PLUS, employment: [EMPLOYEE_MA] },
      message: "Just checking: under 4 000 MAD a month after 7 or more years of security work is rare. Is that right?"
    }
  },
  {
    id: "tjm-over-5k-under-3y",
    text: "TJM > 5 000 MAD | under 3 years",
    table: "tjm",
    given: { experience: EXP_SURVEY_UNDER_3 },
    target: { tjm: ["> 5 000"] },
    survey: { question: "tjm", options: ["> 5 000"], when: { experience: EXP_SURVEY_UNDER_3 } }
  },
  {
    id: "abroad-low-usd",
    text: "USD < 20 000/yr | employee living abroad",
    table: "usd",
    given: { location: [ABROAD], employment: [EMPLOYEE] },
    target: { usd: ["< 20 000"] },
    survey: {
      question: "usd",
      options: ["< 20 000"],
      when: { location: ABROAD_REGIONS },
      context: { employment: EMPLOYEE_FOREIGN },
      message: "Just checking: under $20,000 a year while living abroad is rare. Is this your yearly gross pay?"
    }
  },
  {
    id: "usd-daily-2k-plus",
    text: "USD >= 2 000 per DAY | freelancer abroad",
    table: "usdDaily",
    given: {},
    target: { usdDaily: USD_DAILY_BANDS.slice(4) },
    survey: {
      question: "usdDaily",
      options: ["2 000 - 5 000", "> 5 000"],
      when: {},
      message: "Just checking: this is your rate per DAY, not per month. Is that right?"
    },
    note: "not rare but a unit error (>= $440k a year at 220 days): a unit check, outside the rarity rule"
  },
  {
    id: "junior-11-plus",
    text: "Junior seniority | 11+ years",
    judgment: "soft",
    survey: {
      question: "seniority",
      options: ["Junior / entry-level"],
      when: { experience: EXP_11_PLUS },
      context: { domain: "Security operations (SOC) / blue team" },
      message: "Just checking: a junior role after 11 or more years of security work is rare. Is that right?"
    },
    note: "no seniority field upstream; possible after a change of specialty, so confirm, never hide"
  },
  {
    id: "exploring-7-plus",
    text: "\"Still exploring\" domain | 7+ years",
    judgment: "soft",
    survey: {
      question: "domain",
      options: ["Still exploring / no specific area yet"],
      when: { experience: EXP_7_PLUS },
      message: "Just checking: \"still exploring\" after 7 or more years of security work is rare. Is that right?"
    },
    note: "no domain field upstream; a generalist IT career is plausible, so confirm, never hide"
  },
  {
    id: "working-outside-from-morocco",
    text: "\"Currently working outside Morocco\" | living in Morocco",
    table: "plans",
    given: { location: [MOROCCO] },
    target: { plans: [WORKING_OUTSIDE] },
    judgment: "hard",
    note: "impossible as written; respondents use it for remote work for foreign employers: fix the wording, do not hide"
  },
  {
    id: "working-outside-from-morocco-usd",
    text: "  same, among those paid in USD by a foreign employer",
    table: "plans",
    given: { location: [MOROCCO], usdAnswered: ["yes"] },
    target: { plans: [WORKING_OUTSIDE] },
    judgment: "hard"
  },
  {
    id: "working-outside-while-looking",
    text: "\"Currently working outside Morocco\" | looking for work or student",
    table: "plans",
    given: { employment: [LOOKING, STUDENT] },
    target: { plans: [WORKING_OUTSIDE] },
    judgment: "hard",
    note: "contradiction as written; read as \"living abroad\": fix the wording"
  }
];

// ---------------------------------------------------------------------------------------------
// Rules in the survey: is the option hidden, or confirmed, for the rule's condition?
// ---------------------------------------------------------------------------------------------

type Status = "hidden" | "soft check" | "partial" | "none";

function answerCombos(flat: FlatQuestion[], when: SurveyRule["when"], context: SurveyRule["context"] = {}): Answers[] {
  const base: Answers = {};
  for (const [key, label] of Object.entries(context) as Array<[SurveyKey, string]>) {
    const fq = findQuestion(flat, key);
    base[fq.id] = choiceIndex(fq, label);
  }
  let combos: Answers[] = [base];
  for (const [key, labels] of Object.entries(when) as Array<[SurveyKey, string[]]>) {
    const fq = findQuestion(flat, key);
    combos = combos.flatMap(combo => labels.map(label => ({ ...combo, [fq.id]: choiceIndex(fq, label) })));
  }
  return combos;
}

function surveyStatus(flat: FlatQuestion[], rule: SurveyRule): Status {
  const fq = findQuestion(flat, rule.question);
  let hidden = 0;
  let checked = 0;
  let total = 0;
  for (const answers of answerCombos(flat, rule.when, rule.context)) {
    const visible = getVisibleChoiceIndices(fq.q, answers);
    for (const option of rule.options) {
      const index = choiceIndex(fq, option);
      total++;
      if (!visible.includes(index))
        hidden++;
      else if (getSoftCheckMessage(fq.q, index, answers))
        checked++;
    }
  }
  if (hidden === total)
    return "hidden";
  if (checked === total)
    return "soft check";
  return hidden + checked > 0 ? "partial" : "none";
}

function expectedStatus(verdict: Verdict | "hard" | "soft" | "fine"): Status | undefined {
  if (verdict === "HIDE")
    return "hidden";
  if (verdict === "CHECK" || verdict === "soft")
    return "soft check";
  if (verdict === "FINE" || verdict === "fine")
    return "none";
  return undefined;
}

// Builds the soft check a rule proposes, as YAML would hold it
function proposedSoftCheck(flat: FlatQuestion[], rule: SurveyRule): { question: FlatQuestion; check: NonNullable<SurveyQuestion["softChecks"]>[number] } {
  const message = rule.message ?? "Just checking: this answer is rare. Is that right?";
  const question = findQuestion(flat, rule.question);
  const leaves: ConditionLeaf[] = (Object.entries(rule.when) as Array<[SurveyKey, string[]]>).map(([key, labels]) => {
    const guard = findQuestion(flat, key);
    return { question: guard.id, in: labels.map(label => choiceIndex(guard, label)) };
  });
  const when: ShowIfCondition | undefined = leaves.length === 0 ? undefined : leaves.length === 1 ? leaves[0] : { all: leaves };
  return { question, check: { options: rule.options, ...(when ? { when } : {}), message } };
}

// ---------------------------------------------------------------------------------------------
// Walking the survey: depth-first over classes of guard answers (answers every condition treats
// the same are interchangeable), with the real condition engine
// ---------------------------------------------------------------------------------------------

interface Engine {
  flat: FlatQuestion[];
  classes: Map<string, number[][]>;
  words: Map<string, { label: number; choices: number[] }>;
}

function allLeaves(fq: FlatQuestion): ConditionLeaf[] {
  return [
    ...conditionLeaves(fq.sectionShowIf),
    ...conditionLeaves(fq.q.showIf),
    ...(fq.q.optionShowIf ?? []).flatMap(rule => conditionLeaves(rule.showIf)),
    ...(fq.q.softChecks ?? []).flatMap(check => conditionLeaves(check.when))
  ];
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildEngine(flat: FlatQuestion[]): Engine {
  const leavesByGuard = new Map<string, ConditionLeaf[]>();
  for (const fq of flat) {
    for (const leaf of allLeaves(fq))
      leavesByGuard.set(leaf.question, [...(leavesByGuard.get(leaf.question) ?? []), leaf]);
  }
  const classes = new Map<string, number[][]>();
  for (const [guardId, leaves] of leavesByGuard) {
    const fq = flat.find(item => item.id === guardId);
    if (!fq)
      throw new Error(`condition on unknown question ${guardId}`);
    if (fq.q.multiple)
      throw new Error(`guard ${guardId} is a multi-select`);
    const groups = new Map<string, number[]>();
    fq.q.choices.forEach((label, value) => {
      const signature = `${leaves.map(leaf => (evaluateCondition(leaf, { [guardId]: value }) ? "1" : "0")).join("")}|${(fq.q.softChecks ?? []).map(check => (check.options.includes(label) ? "1" : "0")).join("")}`;
      groups.set(signature, [...(groups.get(signature) ?? []), value]);
    });
    classes.set(guardId, [...groups.values()]);
  }
  const words = new Map(flat.map(fq => [fq.id, { label: countWords(fq.q.label), choices: fq.q.choices.map(countWords) }]));
  return { flat, classes, words };
}

function isVisible(fq: FlatQuestion, answers: Answers): boolean {
  return evaluateCondition(fq.sectionShowIf, answers) && evaluateCondition(fq.q.showIf, answers);
}

interface PathStats {
  screens: number;
  multi: number;
  requiredMulti: number;
  options: number;
  words: number;
  softPossible: number;
  softFired: number;
}

interface NodeHook {
  (fq: FlatQuestion, answers: Answers, visible: number[]): void;
}

function softPossible(fq: FlatQuestion, answers: Answers, visible: number[]): boolean {
  return (fq.q.softChecks ?? []).some(check =>
    evaluateCondition(check.when, answers)
    && check.options.some(option => visible.includes(fq.q.choices.indexOf(option))));
}

// With `dedupe`, a subtree is walked once per question and live guard answers (the guards a
// later condition still reads): enough for per-question observations, not for per-path counts
function walkAll(engine: Engine, onPath: (answers: Answers, stats: PathStats) => void, onNode?: NodeHook, dedupe = false): number {
  const { flat, classes, words } = engine;
  const answers: Answers = {};
  const live: string[][] = flat.map(() => []);
  for (let i = flat.length - 1; i >= 0; i--) {
    const later = new Set(i + 1 < flat.length ? live[i + 1] : []);
    allLeaves(flat[i]).forEach(leaf => later.add(leaf.question));
    live[i] = [...later];
  }
  const visited = new Set<string>();
  let paths = 0;
  const step = (index: number, stats: PathStats): void => {
    if (index === flat.length) {
      paths++;
      onPath(answers, stats);
      return;
    }
    if (dedupe) {
      const key = `${index}|${live[index].map(id => answers[id] ?? "-").join(",")}`;
      if (visited.has(key))
        return;
      visited.add(key);
    }
    const fq = flat[index];
    if (!isVisible(fq, answers)) {
      step(index + 1, stats);
      return;
    }
    const visible = getVisibleChoiceIndices(fq.q, answers);
    onNode?.(fq, answers, visible);
    const count = words.get(fq.id);
    const next: PathStats = {
      screens: stats.screens + 1,
      multi: stats.multi + (fq.q.multiple ? 1 : 0),
      requiredMulti: stats.requiredMulti + (fq.q.multiple && fq.q.required ? 1 : 0),
      options: stats.options + visible.length,
      words: stats.words + (count ? count.label + visible.reduce((sum, v) => sum + count.choices[v], 0) : 0),
      softPossible: stats.softPossible + (softPossible(fq, answers, visible) ? 1 : 0),
      softFired: stats.softFired
    };
    const guardClasses = classes.get(fq.id);
    if (!guardClasses) {
      step(index + 1, next);
      return;
    }
    for (const members of guardClasses) {
      const value = members.find(member => visible.includes(member));
      if (value === undefined)
        continue;
      answers[fq.id] = value;
      const fired = getSoftCheckMessage(fq.q, value, answers) ? 1 : 0;
      step(index + 1, { ...next, softFired: next.softFired + fired });
      delete answers[fq.id];
    }
    // An optional guard can be skipped, which hides its dependents
    if (!fq.q.required)
      step(index + 1, next);
  };
  step(0, { screens: 0, multi: 0, requiredMulti: 0, options: 0, words: 0, softPossible: 0, softFired: 0 });
  return dedupe ? visited.size : paths;
}

// ---------------------------------------------------------------------------------------------
// Contradiction check of a rule set: every soft check can fire, no two checks fire on the same
// pick, every visible question keeps at least two choices, every choice is visible somewhere
// ---------------------------------------------------------------------------------------------

interface RuleSetReport {
  paths: number;
  deadSoftChecks: string[];
  shadowed: string[];
  thinQuestions: string[];
  deadOptions: string[];
}

function checkRuleSet(flat: FlatQuestion[]): RuleSetReport {
  const engine = buildEngine(flat);
  const reached = new Set<string>();
  const shadowed = new Set<string>();
  const minVisible = new Map<string, number>();
  const seen = new Map<string, Set<number>>();
  const paths = walkAll(engine, () => {}, (fq, answers, visible) => {
    minVisible.set(fq.id, Math.min(minVisible.get(fq.id) ?? Infinity, visible.length));
    const optionsSeen = seen.get(fq.id) ?? new Set<number>();
    visible.forEach(v => optionsSeen.add(v));
    seen.set(fq.id, optionsSeen);
    const checks = fq.q.softChecks ?? [];
    for (const v of visible) {
      const label = fq.q.choices[v];
      const firing = checks.map((check, k) => ({ check, k })).filter(({ check }) => check.options.includes(label) && evaluateCondition(check.when, answers));
      firing.forEach(({ k }) => reached.add(`${fq.id}#${k}`));
      if (firing.length > 1)
        shadowed.add(`${fq.id} "${label}": checks ${firing.map(({ k }) => k).join(" and ")} both fire (only the first message shows)`);
    }
  }, true);
  const deadSoftChecks: string[] = [];
  const deadOptions: string[] = [];
  for (const fq of flat) {
    (fq.q.softChecks ?? []).forEach((check, k) => {
      if (!reached.has(`${fq.id}#${k}`))
        deadSoftChecks.push(`${fq.id} check ${k} (${check.options.join(", ")}): never fires (option hidden whenever its condition holds)`);
    });
    const optionsSeen = seen.get(fq.id);
    fq.q.choices.forEach((label, v) => {
      if (optionsSeen && !optionsSeen.has(v))
        deadOptions.push(`${fq.id} "${label}"`);
    });
  }
  const thinQuestions = [...minVisible.entries()].filter(([, n]) => n < 2).map(([id, n]) => `${id}: ${n} visible choice(s) on some path`);
  return { paths, deadSoftChecks, shadowed: [...shadowed], thinQuestions, deadOptions };
}

// ---------------------------------------------------------------------------------------------
// Burden per profile leaf (age -> education -> experience -> employment)
// ---------------------------------------------------------------------------------------------

// Reading speed: 150 words a minute, for readers of English as a second or third language (an
// L1 adult reads non-fiction silently at about 238 wpm, Brysbaert 2019; L2 readers are slower).
// Overheads: 3 s to map an answer, tap and go on for a single choice, 6 s for a multi-select
// (several taps), 5 s for each "is that right?" prompt that fires
const WPM = 150;
const WPM_FAST = 200;
const SINGLE_S = 3;
const MULTI_S = 6;
const SOFT_S = 5;

function seconds(stats: PathStats, wpm = WPM): number {
  return (stats.words / wpm) * 60 + (stats.screens - stats.multi) * SINGLE_S + stats.multi * MULTI_S + stats.softFired * SOFT_S;
}

const EMPLOYMENT_SHORT = ["employee (MA org)", "employee (foreign org)", "freelancer", "founder", "intern", "student", "looking for work", "other"];

function leafOf(flat: FlatQuestion[], answers: Answers): string {
  const age = answers[findQuestion(flat, "age").id];
  const education = answers[findQuestion(flat, "education").id];
  const experience = answers[findQuestion(flat, "experience").id];
  const employment = answers[findQuestion(flat, "employment").id];
  if (age === 0)
    return "01 under 18";
  if (education === 0)
    return "02 lycee (18-24)";
  const label = EMPLOYMENT_SHORT[employment as number] ?? `employment ${String(employment)}`;
  return experience === 0
    ? `${String(3 + (employment as number)).padStart(2, "0")} no security experience, ${label}`
    : `${String(11 + (employment as number)).padStart(2, "0")} security experience, ${label}`;
}

interface Distribution {
  values: Map<number, number>;
  total: number;
}

function addTo(distribution: Distribution, value: number): void {
  distribution.values.set(value, (distribution.values.get(value) ?? 0) + 1);
  distribution.total++;
}

function quantile(distribution: Distribution, q: number): number {
  const sorted = [...distribution.values.entries()].sort((a, b) => a[0] - b[0]);
  let seenSoFar = 0;
  for (const [value, n] of sorted) {
    seenSoFar += n;
    if (seenSoFar >= q * distribution.total)
      return value;
  }
  return sorted.length ? sorted[sorted.length - 1][0] : 0;
}

function newDistribution(): Distribution {
  return { values: new Map(), total: 0 };
}

// A typical respondent for each leaf: Casablanca, mid profile, common downstream answers
function typicalPath(engine: Engine, leafAnswers: Record<SurveyKey, string> | Partial<Record<SurveyKey, string>>, extra: Record<string, number>): PathStats {
  const { flat, words } = engine;
  const answers: Answers = {};
  const stats: PathStats = { screens: 0, multi: 0, requiredMulti: 0, options: 0, words: 0, softPossible: 0, softFired: 0 };
  const preferred = new Map<string, number>();
  for (const [key, label] of Object.entries(leafAnswers) as Array<[SurveyKey, string]>) {
    const fq = findQuestion(flat, key);
    preferred.set(fq.id, choiceIndex(fq, label));
  }
  for (const [id, value] of Object.entries(extra))
    preferred.set(id, value);
  for (const fq of flat) {
    if (!isVisible(fq, answers))
      continue;
    const visible = getVisibleChoiceIndices(fq.q, answers);
    const count = words.get(fq.id);
    stats.screens++;
    stats.multi += fq.q.multiple ? 1 : 0;
    stats.requiredMulti += fq.q.multiple && fq.q.required ? 1 : 0;
    stats.options += visible.length;
    stats.words += count ? count.label + visible.reduce((sum, v) => sum + count.choices[v], 0) : 0;
    stats.softPossible += softPossible(fq, answers, visible) ? 1 : 0;
    if (engine.classes.has(fq.id)) {
      const wanted = preferred.get(fq.id);
      const value = wanted !== undefined && visible.includes(wanted) ? wanted : visible[0];
      answers[fq.id] = value;
      stats.softFired += getSoftCheckMessage(fq.q, value, answers) ? 1 : 0;
    }
  }
  return stats;
}

function burdenReport(flat: FlatQuestion[]): string[] {
  const engine = buildEngine(flat);
  const leaves = new Map<string, { screens: Distribution; options: Distribution; minutes: Distribution; requiredMulti: Distribution; softMax: number }>();
  let longest: PathStats | undefined;
  let shortest: PathStats | undefined;
  const paths = walkAll(engine, (answers, stats) => {
    const key = leafOf(flat, answers);
    const leaf = leaves.get(key) ?? { screens: newDistribution(), options: newDistribution(), minutes: newDistribution(), requiredMulti: newDistribution(), softMax: 0 };
    addTo(leaf.screens, stats.screens);
    addTo(leaf.options, stats.options);
    addTo(leaf.minutes, Math.round(seconds(stats) / 6) / 10);
    addTo(leaf.requiredMulti, stats.requiredMulti);
    leaf.softMax = Math.max(leaf.softMax, stats.softPossible);
    leaves.set(key, leaf);
    if (!longest || stats.screens > longest.screens)
      longest = { ...stats };
    if (!shortest || stats.screens < shortest.screens)
      shortest = { ...stats };
  });

  const ids = (key: SurveyKey) => findQuestion(flat, key).id;
  const typicalExtra = (experienced: boolean): Record<string, number> => ({
    [ids("location")]: 1,
    [ids("domain")]: experienced ? 2 : 10,
    [ids("bugBounty")]: experienced ? 4 : 3,
    [flat.find(fq => /How often do you use AI tools/.test(fq.q.label))?.id ?? ""]: 1,
    [flat.find(fq => /noticed one or more security flaws/.test(fq.q.label))?.id ?? ""]: 1,
    [ids("plans")]: 2
  });

  const lines: string[] = [];
  lines.push(`Class paths walked: ${paths}. Shortest ${shortest?.screens ?? 0} screens, longest ${longest?.screens ?? 0}.`);
  lines.push(`Minutes = words / ${WPM} wpm + ${SINGLE_S} s per single choice + ${MULTI_S} s per multi-select + ${SOFT_S} s per soft check fired.`);
  lines.push("Typical path: Casablanca, 25-34 (18-24 for lycee), Bac +5, 3-4 years if experienced; SOC domain and no bug bounty if");
  lines.push("experienced, else \"Still exploring\" and \"Not yet\"; AI occasionally; no flaw noticed; \"Still hesitating\" about abroad.");
  lines.push("");
  lines.push(`${"leaf".padEnd(48)} ${"paths".padStart(6)}  screens min/med/max  options med  req-multi med  soft max  min med (typical @150 / @200 wpm)`);
  for (const [key, leaf] of [...leaves.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const match = /^\d+ (.*)$/.exec(key);
    const name = match ? match[1] : key;
    const employment = EMPLOYMENT_SHORT.findIndex(label => name.endsWith(label));
    const experienced = name.startsWith("security experience");
    const profile: Partial<Record<SurveyKey, string>> = name.startsWith("under 18")
      ? { age: "Younger than 18 years" }
      : name.startsWith("lycee")
        ? { age: "18 to 24 years", education: "Still at lycée / preparing the Bac (incl. repeating or candidat libre)" }
        : {
            age: "25 to 34 years",
            education: "University/Public school - Bac +5 (Master's)",
            experience: experienced ? "3-4 years" : NONE_YET,
            employment: findQuestion(flat, "employment").q.choices[employment]
          };
    const typical = typicalPath(engine, profile, typicalExtra(experienced));
    lines.push(`${name.padEnd(48)} ${String(leaf.screens.total).padStart(6)}  ${`${quantile(leaf.screens, 0)}/${quantile(leaf.screens, 0.5)}/${quantile(leaf.screens, 1)}`.padStart(19)}  ${String(quantile(leaf.options, 0.5)).padStart(11)}  ${String(quantile(leaf.requiredMulti, 0.5)).padStart(13)}  ${String(leaf.softMax).padStart(8)}  ${quantile(leaf.minutes, 0.5).toFixed(1).padStart(4)} (${typical.screens} screens, ${typical.options} options: ${(seconds(typical) / 60).toFixed(1)} / ${(seconds(typical, WPM_FAST) / 60).toFixed(1)})`);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Persona grid: every value of every fork answer at least once, every pair of fork answer
// classes that meet in one question's conditions, every soft check, plus extremes
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Walk {
  forks: Answers;
  targets: Set<string>;
  screens: number;
}

function interactionSites(flat: FlatQuestion[]): Array<{ owner: string; byGuard: Map<string, ConditionLeaf[]> }> {
  return flat.map((fq) => {
    const byGuard = new Map<string, ConditionLeaf[]>();
    for (const leaf of allLeaves(fq))
      byGuard.set(leaf.question, [...(byGuard.get(leaf.question) ?? []), leaf]);
    return { owner: fq.id, byGuard };
  }).filter(site => site.byGuard.size > 1);
}

function classOf(engine: Engine, guard: string, value: number): number {
  return (engine.classes.get(guard) ?? []).findIndex(members => members.includes(value));
}

function randomWalk(engine: Engine, rng: () => number, sites: ReturnType<typeof interactionSites>, chain: string[]): Walk {
  const answers: Answers = {};
  const targets = new Set<string>();
  let screens = 0;
  for (const fq of engine.flat) {
    if (!isVisible(fq, answers))
      continue;
    screens++;
    if (!engine.classes.has(fq.id))
      continue;
    const visible = getVisibleChoiceIndices(fq.q, answers);
    if (!fq.q.required && rng() < 0.1)
      continue;
    const value = visible[Math.floor(rng() * visible.length)];
    answers[fq.id] = value;
    targets.add(`${fq.id}=${value}`);
    (fq.q.softChecks ?? []).forEach((check, k) => {
      if (check.options.includes(fq.q.choices[value]) && evaluateCondition(check.when, answers) && getSoftCheckMessage(fq.q, value, answers) === check.message)
        targets.add(`soft:${fq.id}#${k}`);
    });
  }
  for (const site of sites) {
    const guards = [...site.byGuard.keys()].filter(guard => answers[guard] !== undefined);
    for (let a = 0; a < guards.length; a++) {
      for (let b = a + 1; b < guards.length; b++) {
        const signature = (guard: string) => (site.byGuard.get(guard) ?? []).map(leaf => (evaluateCondition(leaf, answers) ? "1" : "0")).join("");
        targets.add(`${site.owner}|${guards[a]}:${signature(guards[a])}|${guards[b]}:${signature(guards[b])}`);
      }
    }
  }
  // Full pairwise over the profile chain (age, education, experience, employment)
  const answeredChain = chain.filter(guard => typeof answers[guard] === "number");
  for (let a = 0; a < answeredChain.length; a++) {
    for (let b = a + 1; b < answeredChain.length; b++) {
      const [ga, gb] = [answeredChain[a], answeredChain[b]];
      targets.add(`chain|${ga}:${classOf(engine, ga, answers[ga] as number)}|${gb}:${classOf(engine, gb, answers[gb] as number)}`);
    }
  }
  return { forks: { ...answers }, targets, screens };
}

interface Persona {
  name: string;
  why: string;
  skipsOptional: boolean;
  answers: Record<string, string | string[]>;
  otherText: Record<string, string>;
  expected: { screens: number; softChecks: Record<string, string> };
}

function isOther(label: string): boolean {
  return /^others?$/i.test(label.trim());
}

function personaFrom(engine: Engine, forks: Answers, seed: number, why: string, skipsOptional = false): Persona {
  const answers: Answers = {};
  const byLabel: Record<string, string | string[]> = {};
  const otherText: Record<string, string> = {};
  const softChecks: Record<string, string> = {};
  let screens = 0;
  let position = 0;
  for (const fq of engine.flat) {
    if (!isVisible(fq, answers))
      continue;
    screens++;
    position++;
    const visible = getVisibleChoiceIndices(fq.q, answers);
    const choices = fq.q.choices;
    if (engine.classes.has(fq.id)) {
      const value = forks[fq.id];
      if (typeof value !== "number" || !visible.includes(value))
        continue; // an optional guard left unanswered
      answers[fq.id] = value;
      byLabel[fq.q.label] = choices[value];
      if (isOther(choices[value]))
        otherText[fq.q.label] = "Persona test answer";
      const message = getSoftCheckMessage(fq.q, value, answers);
      if (message)
        softChecks[fq.q.label] = message;
      continue;
    }
    if (skipsOptional && !fq.q.required)
      continue;
    const exclusive = new Set(getExclusiveChoiceIndices(fq.q));
    const plain = visible.filter(v => !exclusive.has(v) && !isOther(choices[v]));
    const pool = plain.length ? plain : visible;
    if (!fq.q.multiple) {
      byLabel[fq.q.label] = choices[pool[(seed * 7 + position * 3) % pool.length]];
      continue;
    }
    const visibleExclusive = visible.filter(v => exclusive.has(v));
    if (visibleExclusive.length && (seed + position) % 5 === 0) {
      byLabel[fq.q.label] = [choices[visibleExclusive[0]]];
      continue;
    }
    const picks = Math.min(1 + ((seed + position) % 3), pool.length);
    const start = (seed * 5 + position) % pool.length;
    byLabel[fq.q.label] = Array.from({ length: picks }, (_, k) => choices[pool[(start + k) % pool.length]]);
  }
  const short = (key: SurveyKey, max = 22) => {
    const fq = findQuestion(engine.flat, key);
    const value = answers[fq.id];
    return typeof value === "number" ? fq.q.choices[value].replace(/\s*\(.*$/, "").slice(0, max) : "-";
  };
  const name = [short("age"), short("education"), short("experience"), short("employment"), short("domain"), short("bugBounty")].join(" | ");
  return { name, why, skipsOptional, answers: byLabel, otherText, expected: { screens, softChecks } };
}

function buildGrid(flat: FlatQuestion[], hash: string): Record<string, unknown> {
  const labels = new Set<string>();
  for (const fq of flat) {
    if (labels.has(fq.q.label))
      throw new Error(`question label used twice, personas cannot key on it: ${fq.q.label}`);
    labels.add(fq.q.label);
  }
  const engine = buildEngine(flat);
  const sites = interactionSites(flat);
  const rng = mulberry32(20261027);
  const chain = (["age", "education", "experience", "employment"] as SurveyKey[]).map(key => findQuestion(flat, key).id);
  const pool: Walk[] = Array.from({ length: 40000 }, () => randomWalk(engine, rng, sites, chain));
  const universe = new Set<string>();
  pool.forEach(walk => walk.targets.forEach(target => universe.add(target)));

  const covered = new Set<string>();
  const chosen: Walk[] = [];
  for (;;) {
    let best: Walk | undefined;
    let bestGain = 0;
    for (const walk of pool) {
      let gain = 0;
      for (const target of walk.targets) {
        if (!covered.has(target))
          gain++;
      }
      if (gain > bestGain) {
        bestGain = gain;
        best = walk;
      }
    }
    if (!best)
      break;
    chosen.push(best);
    best.targets.forEach(target => covered.add(target));
  }

  const personas: Persona[] = chosen.map((walk, index) => personaFrom(engine, walk.forks, index + 1, "pairwise cover"));

  // Extremes: longest and shortest walks, the youngest and oldest ends, and skipping every optional
  const byScreens = [...pool].sort((a, b) => a.screens - b.screens);
  const age = findQuestion(flat, "age");
  const experience = findQuestion(flat, "experience");
  const pick = (predicate: (walk: Walk) => boolean) => pool.filter(predicate).sort((a, b) => b.screens - a.screens)[0];
  const extremes: Array<[Walk | undefined, string, boolean]> = [
    [byScreens[byScreens.length - 1], "extreme: longest path in the sample", false],
    [byScreens[0], "extreme: shortest path in the sample", false],
    [pick(walk => walk.forks[age.id] === 0), "extreme: youngest, longest minor path (flaw block and bug bounty included)", false],
    [pick(walk => walk.forks[age.id] === 4 && walk.forks[experience.id] === 7), "extreme: oldest with 16+ years", false],
    [byScreens[byScreens.length - 1], "extreme: longest path, every optional question skipped", true]
  ];
  extremes.forEach(([walk, why, skips], index) => {
    if (walk)
      personas.push(personaFrom(engine, walk.forks, chosen.length + index + 1, why, skips));
  });

  const singles = [...universe].filter(target => /^[a-z0-9-]+-q-\d+=\d+$/.test(target));
  const softs = [...universe].filter(target => target.startsWith("soft:"));
  const pairs = [...universe].filter(target => target.includes("|") && !target.startsWith("chain|"));
  const chainPairs = [...universe].filter(target => target.startsWith("chain|"));
  const allSoft = flat.reduce((sum, fq) => sum + (fq.q.softChecks?.length ?? 0), 0);
  const allSingles = [...engine.classes.keys()].reduce((sum, id) => sum + (flat.find(fq => fq.id === id)?.q.choices.length ?? 0), 0);
  return {
    about: "Persona grid for walkthroughs: answers keyed by question label -> choice label (arrays for multi-selects). Generated by `pnpm tsx scripts/verify/plausibility.ts --grid` from the survey YAML with the real condition engine; regenerate when surveySha256 no longer matches survey/*.yml. Questions missing from `answers` are not shown to that persona or are skipped (optional). `expected.screens` counts every question shown, skipped ones included; `expected.softChecks` lists the \"is that right?\" prompts to confirm.",
    surveySha256: hash,
    coverage: {
      forkValues: `${singles.length} of ${allSingles} fork answers reachable in the sample, all covered`,
      pairs: `${pairs.length} interacting pairs of fork answer classes (two guards in one question's conditions), all covered`,
      profileChain: `${chainPairs.length} pairs of answer classes over age, education, experience and employment, all covered`,
      softChecks: `${softs.length} of ${allSoft} soft checks fired, all covered`,
      sample: `${pool.length} seeded random walks; greedy cover`
    },
    personas
  };
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

function row(...cells: Array<[string, number]>): string {
  return cells.map(([text, width]) => (width < 0 ? text.padStart(-width) : text.padEnd(width))).join(" ");
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const strict = args.has("--strict");
  let problems = 0;

  if (args.has("--rebuild")) {
    writeJson(COUNTS_FILE, rebuildCounts());
    console.log(`Rebuilt ${path.relative(ROOT, COUNTS_FILE)} from the upstream git refs.\n`);
  }
  const counts = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8")) as CountsFile;
  const { flat, hash } = loadSurvey();

  // Canonical labels must still be this survey's labels, or the cross-check is silently wrong
  const surveyLabels: Partial<Record<Dim, SurveyKey>> = { age: "age", education: "education", experience: "experience", employment: "employment" };
  for (const [dim, key] of Object.entries(surveyLabels) as Array<[Dim, SurveyKey]>) {
    const choices = findQuestion(flat, key).q.choices;
    for (const label of counts.dims[dim]) {
      if (label !== EMPLOYEE && !choices.includes(label)) {
        console.log(`[X] canonical ${dim} label not in the survey: ${label}`);
        problems++;
      }
    }
  }

  const rowsIn = (years: string[]) => years.reduce((sum, year) => sum + (counts.rows[year] ?? 0), 0);
  console.log("PLAUSIBILITY EVIDENCE (stateofdev.ma open answers, matched by label)");
  console.log(`Rows: ${POOLED.map(year => `${year} ${counts.rows[year]}`).join(", ")}; 2021-2024 = ${rowsIn(PUBLISHED)}, 2021-2025 = ${rowsIn(POOLED)}.`);
  console.log(`HIDE: Wilson 95% upper bound < ${pct(HIDE_BELOW, 1)}. CHECK: share < ${pct(CHECK_BELOW, 0)}. Shares are P(later answer | earlier answers).\n`);

  console.log("1. Published figures (2021-2024, as published)");
  for (const figure of PUBLISHED_FIGURES) {
    const { x, n } = measure(counts, figure.table, PUBLISHED, figure.given, figure.target);
    const share = n ? x / n : 0;
    const ok = Math.abs(share - figure.published) <= figure.tolerance;
    if (!ok)
      problems++;
    console.log(row([figure.text, 44], [`${x}/${n}`, -10], [pct(share, share < 0.01 ? 3 : 2), -8], [`published ~${pct(figure.published, figure.published < 0.01 ? 2 : 1)}`, 18], [ok ? "match: yes" : "match: NO", 10]));
    console.log(`    ${figure.definition}`);
  }
  const reverse = measure(counts, "profile", PUBLISHED, { age: AGE_35_PLUS, education: [SELF_TAUGHT] }, { employment: [FOUNDER] });
  const allOld = measure(counts, "profile", PUBLISHED, { age: AGE_35_PLUS }, { experience: [NONE_YET] });
  console.log(`    survey order: P(founder | 35+ self-taught) = ${reverse.x}/${reverse.n} = ${pct(reverse.x / reverse.n, 1)}; P(no experience | all 35+) = ${allOld.x}/${allOld.n} = ${pct(allOld.x / allOld.n, 1)}`);
  console.log("");

  const header = row(["rule", 44], ["x/n", -10], ["share", -7], ["Wilson 95%", -16], ["verdict", -8], ["", 1], ["survey now", 12], ["", 0]);
  const describe = (rule: Rule, years: string[]): { line: string; verdict: Verdict | "hard" | "soft" | "fine"; status?: Status } => {
    let verdict: Verdict | "hard" | "soft" | "fine" = rule.judgment ?? "NO DATA";
    let measured = "";
    let pooledNote = "";
    if (rule.table && rule.given && rule.target) {
      const { x, n } = measure(counts, rule.table, rule.years ?? years, rule.given, rule.target);
      if (rule.years) {
        const pooled = measure(counts, rule.table, years, rule.given, rule.target);
        pooledNote = `\n    measured on ${rule.years.join(", ")} only; pooled ${years[0]}-${years[years.length - 1]}: ${pooled.x}/${pooled.n} = ${pct(pooled.x / pooled.n, 2)} (${verdictOf(pooled.x, pooled.n)})`;
      }
      const [low, high] = wilson(x, n);
      const rarity = verdictOf(x, n);
      if (!rule.judgment)
        verdict = rarity;
      measured = row([`${x}/${n}`, -10], [n ? pct(x / n, 2) : "-", -7], [n ? `${pct(low, 2)}-${pct(high, 2)}` : "-", -16]);
    }
    else {
      measured = row(["no field", -10], ["-", -7], ["-", -16]);
    }
    const status = rule.survey ? surveyStatus(flat, rule.survey) : undefined;
    const expected = expectedStatus(verdict);
    const agreement = !status || !expected ? "" : status === expected ? "agrees" : `differs (expected ${expected})`;
    const line = `${row([rule.text, 44])} ${measured} ${row([verdict === "NO DATA" ? "-" : verdict.toUpperCase(), -8], ["", 1], [status ?? "-", 12])} ${agreement}${pooledNote}${rule.upperBound ? `\n    upper bound: ${rule.upperBound}` : ""}${rule.note ? `\n    note: ${rule.note}` : ""}`;
    return { line, verdict, status };
  };

  console.log("2. Profile pairs (pooled 2021-2025)");
  console.log(header);
  for (const rule of PAIR_RULES) {
    const { line, verdict, status } = describe(rule, POOLED);
    console.log(line);
    // Errors: a hide the data does not support (real answers lost), or a missing hide.
    // A soft check more or less is a warning: it costs one confirmation tap, no data
    const expected = expectedStatus(verdict);
    if (status && expected && status !== expected && (status === "hidden" || expected === "hidden"))
      problems++;
  }
  console.log("");

  console.log("3. Edit rules beyond the profile pairs (pooled 2021-2025; classes: hard = impossible, soft = rare, fine)");
  console.log(header);
  const proposals: Rule[] = [];
  for (const rule of EDIT_RULES) {
    const { line, verdict, status } = describe(rule, POOLED);
    console.log(line);
    const unitCheck = rule.id === "usd-daily-2k-plus";
    if (rule.survey && status === "none" && (verdict === "CHECK" || verdict === "soft" || unitCheck))
      proposals.push(rule);
  }
  const usdMorocco = measure(counts, "usd", POOLED, { location: [MOROCCO], employment: [EMPLOYEE] }, { usd: ["< 20 000"] });
  console.log(`    context: USD < 20 000 among employees living in Morocco (remote for a foreign employer) = ${usdMorocco.x}/${usdMorocco.n} = ${pct(usdMorocco.x / usdMorocco.n, 1)}`);
  console.log("");

  console.log("4. Rule-set contradictions (the survey's rules plus the proposed soft checks above)");
  const patched: FlatQuestion[] = flat.map(fq => ({ ...fq, q: { ...fq.q, softChecks: fq.q.softChecks ? [...fq.q.softChecks] : undefined } }));
  for (const rule of proposals) {
    if (!rule.survey)
      continue;
    const { question, check } = proposedSoftCheck(patched, rule.survey);
    question.q.softChecks = [...(question.q.softChecks ?? []), check];
    console.log(`    + proposed soft check on ${question.id} ${JSON.stringify(check.options)}${check.when ? ` when ${JSON.stringify(check.when)}` : ""}`);
  }
  const pairHides = PAIR_RULES.filter(rule => rule.survey && rule.table && rule.given && rule.target)
    .filter((rule) => {
      const { x, n } = measure(counts, rule.table as Table, rule.years ?? POOLED, rule.given as Selector, rule.target as Selector);
      return verdictOf(x, n) === "HIDE" && rule.survey && surveyStatus(patched, rule.survey) === "soft check";
    });
  const ruleSet = checkRuleSet(patched);
  console.log(`    every reachable class of answers walked: ${ruleSet.paths} distinct (question, live guard answers) states`);
  const listing = (title: string, items: string[]) => {
    console.log(`    ${title}: ${items.length === 0 ? "none" : ""}`);
    items.forEach(item => console.log(`      - ${item}`));
  };
  listing("soft checks that can never fire", ruleSet.deadSoftChecks);
  listing("picks where two soft checks fire", ruleSet.shadowed);
  listing("questions left with under 2 choices", ruleSet.thinQuestions);
  listing("choices never shown", ruleSet.deadOptions);
  listing("HIDE verdicts implemented as soft checks", pairHides.map(rule => rule.text));
  problems += ruleSet.deadSoftChecks.length + ruleSet.thinQuestions.length + pairHides.length;
  console.log("");

  console.log("5. Upstream evidence for the question audit");
  for (const { question, picks } of counts.multiPick2025) {
    const answered = picks.reduce((sum, n) => sum + n, 0);
    const over = picks.slice(4).reduce((sum, n) => sum + n, 0);
    const [low, high] = wilson(over, answered);
    console.log(`    2025 "${question}": ${over}/${answered} = ${pct(over / answered, 1)} picked more than 3 (${pct(low, 1)}-${pct(high, 1)}); picks 1..${picks.length - 1}: ${picks.slice(1).join(", ")}`);
  }
  const helped = counts.helped2025;
  console.log(`    2025 "${helped.question}": "hasn't helped" alone ${helped.exitOnly}/${helped.answered} = ${pct(helped.exitOnly / helped.answered, 1)}; combined with a way it helped ${helped.exitWithOthers}`);
  for (const years of [["2021"], ["2022"], ["2023"], ["2024"], ["2025"]]) {
    const total = measure(counts, "social", years, {}, { social: counts.dims.social }).n;
    const share = (labels: string[]) => measure(counts, "social", years, {}, { social: labels }).x;
    console.log(`    ${years[0]} primary social network (n=${total}): Facebook ${pct(share(["Facebook"]) / total, 1)}, WhatsApp ${pct(share(["WhatsApp"]) / total, 1)}, None ${pct(share(["None"]) / total, 1)}, Other ${pct(share(["Other"]) / total, 1)}${total && !Object.values(counts.matched[years[0]].social ?? {}).includes("Facebook") ? " (no Facebook, WhatsApp or None choice that year)" : ""}`);
  }
  const selfTaught = measure(counts, "unemployment", POOLED, { education: [SELF_TAUGHT] }, { unemployment: ["None, I worked straight after my graduation"] });
  const selfTaughtAnswered = measure(counts, "profile", POOLED, { education: [SELF_TAUGHT] }, { employment: counts.dims.employment });
  console.log(`    self-taught respondents answering "unemployed after graduation": ${selfTaught.n} (of ${selfTaughtAnswered.n} with employment answered); ${pct(selfTaught.x / selfTaught.n, 1)} of them say they worked straight after "graduation"`);
  for (const [label, given] of [["living in Morocco", { location: [MOROCCO] }], ["living in Morocco, paid in USD by a foreign employer", { location: [MOROCCO], usdAnswered: ["yes"] }], ["living abroad", { location: [ABROAD] }]] as Array<[string, Selector]>) {
    const { x, n } = measure(counts, "plans", POOLED, given, { plans: [WORKING_OUTSIDE] });
    console.log(`    "${WORKING_OUTSIDE}" among respondents ${label}: ${x}/${n} = ${pct(x / n, 1)}`);
  }
  const daily = measure(counts, "usdDaily", POOLED, {}, { usdDaily: USD_DAILY_BANDS.slice(6) });
  console.log(`    freelancers abroad claiming $5,000+ per DAY: ${daily.x}/${daily.n} = ${pct(daily.x / daily.n, 1)}`);
  console.log("");

  if (args.has("--burden")) {
    console.log("6. Burden per profile leaf (current YAML)");
    burdenReport(flat).forEach(line => console.log(`    ${line}`));
    console.log("");
  }

  if (args.has("--grid")) {
    const grid = buildGrid(flat, hash);
    writeJson(GRID_FILE, grid);
    console.log(`Wrote ${path.relative(ROOT, GRID_FILE)}: ${(grid.personas as unknown[]).length} personas. ${JSON.stringify(grid.coverage)}`);
  }

  console.log(problems === 0 ? "[OK] reproduced, consistent" : `[!] ${problems} problem(s): see above`);
  if (strict && problems > 0)
    process.exit(1);
}

main();
