import type { FieldPolicy } from "./coarsen";
import type { Row } from "./fields";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeAnswers } from "../../src/lib/answers";
import { guardViolations, POLICIES } from "./coarsen";
import { writePublicRelease } from "./export-public";
import { EXPECTED_LABELS, F, FLAW_AGE, FLAW_BLOCK, FLAW_REGION, S2 } from "./fields";
import { evaluateGate } from "./gate";
import { kPerRow, lDiversity } from "./metrics";
import { buildRelease } from "./release";
import { seededRandom } from "./rng";
import { generateSample } from "./simulate";
import { loadSurvey } from "./survey-definition";

const survey = loadSurvey();

// Flaw answers cycling through enough patterns that every class of 6 has l >= 3
const FLAW_PATTERNS: Row[] = [
  { [F.flawNoticed]: 1 },
  { [F.flawNoticed]: 0, [F.flawReported]: 2, [F.flawWhyNot]: [1] },
  { [F.flawNoticed]: 0, [F.flawReported]: 0, [F.flawResponse]: [0] },
  { [F.flawNoticed]: 0, [F.flawReported]: 1, [F.flawWhyNot]: [2], [F.flawResponse]: [4] },
  { [F.flawNoticed]: 2 },
  { [F.flawNoticed]: 0, [F.flawReported]: 2, [F.flawWhyNot]: [0, 1] }
];
const HIDE_PATTERNS = [[3], [4], [0], [1, 2], [3], [2]];

let counter = 0;
function respondent(profile: Row, i: number, adult = true): Row {
  counter++;
  return {
    ...profile,
    ...FLAW_PATTERNS[i % FLAW_PATTERNS.length],
    ...(adult ? { [F.askedToHide]: HIDE_PATTERNS[i % HIDE_PATTERNS.length] } : {}),
    "tech-q-2": i % 4,
    "learning-q-3": [7],
    "learning-q-3-others": "a free text answer",
    "userId": `user-${counter}`,
    "lastUpdated": "2026-11-02T10:00:00.000Z"
  };
}

const EMPLOYEE: Row = {
  [F.gender]: 0,
  [F.age]: 2,
  [F.region]: 1,
  [F.education]: 3,
  [F.experience]: 3,
  [F.employment]: 0,
  [F.domain]: 2,
  [F.seniority]: 1,
  [F.bountyStatus]: 4,
  [F.certifications]: [2, 3],
  [F.incomeMad]: 9,
  [F.orgType]: 0
};

/**
 * Passes the gate only through the owner's merges: ages 35-44 and 45+, regions L'Oriental
 * and Draa-Tafilalet, experience 11-16 and 16+, Manager and Head of security, MAD 30-60k
 * and > 60k, and the country of people abroad all differ in the raw rows
 */
function passingFixture(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 6; i++)
    rows.push(respondent(EMPLOYEE, i));
  for (let i = 0; i < 6; i++) {
    rows.push(respondent({
      ...EMPLOYEE,
      [F.age]: i % 2 ? 3 : 4,
      [F.region]: i % 2 ? 4 : 7,
      [F.experience]: i % 2 ? 6 : 7,
      [F.domain]: 9,
      [F.seniority]: i % 2 ? 4 : 5,
      [F.incomeMad]: i % 2 ? 13 : 14,
      [F.orgType]: 3
    }, i));
  }
  for (let i = 0; i < 6; i++) {
    rows.push(respondent({
      ...EMPLOYEE,
      [F.region]: 12,
      [F.country]: i % 3,
      [F.employment]: 1,
      [F.incomeMad]: null,
      [F.incomeUsdYear]: 2,
      [F.domain]: 0,
      [F.bountyStatus]: 1,
      [F.bountyEarnings]: i % 2 ? 6 : 7
    }, i));
  }
  for (let i = 0; i < 6; i++) {
    rows.push(respondent({
      [F.gender]: 0,
      [F.age]: 0,
      [F.region]: 1,
      [F.domain]: 0,
      [F.bountyStatus]: 3,
      [F.certifications]: [0]
    }, i, false));
  }
  return rows;
}

function release(rows: Row[]) {
  return buildRelease(rows, survey, { random: seededRandom(1) });
}

describe("privacy: field ids", () => {
  it("still point at the expected questions", () => {
    for (const [id, fragment] of Object.entries(EXPECTED_LABELS))
      expect(survey.questions.get(id)?.label, id).toContain(fragment);
    expect(survey.questions.get(F.domain)!.choices[9]).toContain("CISO");
    expect(survey.questions.get(F.seniority)!.choices[5]).toContain("CISO");
    expect(survey.questions.get(F.region)!.choices.slice(12)).toEqual(["Europe", "US & Canada", "Middle East", "Others"]);
  });
});

describe("privacy: recoding rules", () => {
  it("fit the survey: every choice mapped, no merge the branching could undo", () => {
    expect(guardViolations(survey)).toEqual([]);
  });

  it("reject a merge across branches and a blanked field that others depend on", () => {
    const employment = survey.questions.get(F.employment)!;
    const unsafe: FieldPolicy[] = [
      {
        id: F.employment,
        name: "employment",
        levels: [[["Employee", employment.choices.slice(0, 2)], ...employment.choices.slice(2).map((c): [string, string[]] => [c, [c]])]],
        suppress: "blank"
      }
    ];
    const problems = guardViolations(survey, undefined, unsafe);
    expect(problems.some(p => p.includes("follow different branches"))).toBe(true);
    expect(problems.some(p => p.includes("depend on it"))).toBe(true);
  });

  it("keep the owner's merges at level 0", () => {
    const { publicQuestions } = release(passingFixture());
    expect(publicQuestions[F.age].choices).toContain("35 or older");
    expect(publicQuestions[F.region].choices).toContain("Abroad");
    expect(publicQuestions[F.region].choices).not.toContain("Europe");
    expect(publicQuestions[F.experience].choices).toContain("11 years or more");
    expect(publicQuestions[F.incomeMad].choices).toContain("> 30 000");
    expect(publicQuestions[F.bountyEarnings].choices).toContain("$5,000 or more");
    expect(publicQuestions[F.seniority].choices).not.toContain("Head of security / CISO");
    expect(publicQuestions[F.certifications].choices).toHaveLength(5);
    expect(POLICIES.every(p => p.levels.length >= 1)).toBe(true);
  });
});

describe("privacy: metrics", () => {
  it("count k over the whole file, a blank being a value of its own", () => {
    const rows: Row[] = [{ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1 }, { a: 1, b: null }];
    expect(kPerRow(rows, ["a", "b"])).toEqual([2, 2, 2, 2]);
    expect(kPerRow(rows, ["a"])).toEqual([4, 4, 4, 4]);
  });

  it("measure distinct l-diversity, skipping questions nobody in the class answered", () => {
    const rows: Row[] = [{ c: 0, s: 1 }, { c: 0, s: 2 }, { c: 0 }, { c: 1, s: 1 }, { c: 1, s: 1 }];
    const result = lDiversity(rows, row => String(row.c), ["s", "t"], 3);
    expect(result.minL).toBe(1);
    expect(result.worst?.key).toBe("1");
    // class "0" has 1, 2 and blank (l = 3); class "1" only 1 (l = 1): 2 of 5 rows below
    expect(result.rowsBelow).toBeCloseTo(0.4);
  });
});

describe("privacy: public release", () => {
  it("passes the gate on a file that only needs the owner's merges", () => {
    const rel = release(passingFixture());
    const gate = evaluateGate(rel, survey);
    expect(gate.checks.filter(c => !c.pass)).toEqual([]);
    expect(rel.stats.suppressedCells).toBe(0);
    expect(rel.stats.publicRows).toBe(24);
  });

  it("shuffles with the OS generator by default", () => {
    const rel = buildRelease(passingFixture(), survey);
    expect(rel.publicRows).toHaveLength(24);
    expect(rel.flawRows).toHaveLength(24);
  });

  it("publishes answers only, and the flaw block apart with no join key", () => {
    const rel = release(passingFixture());
    for (const row of rel.publicRows) {
      expect(Object.keys(row).filter(k => k.endsWith("-others") || k === "userId" || k === "lastUpdated")).toEqual([]);
      expect(row[F.country]).toBeUndefined();
      for (const id of FLAW_BLOCK)
        expect(row[id]).toBeUndefined();
    }
    const flawKeys = new Set(rel.flawRows.flatMap(row => Object.keys(row)));
    expect([...flawKeys].every(k => [FLAW_AGE, FLAW_REGION, ...FLAW_BLOCK].includes(k))).toBe(true);
    expect(rel.flawRows).toHaveLength(24);
  });

  it("fails the gate when a unique row reaches the public file", () => {
    const rel = release(passingFixture());
    rel.publicRows.push({ ...rel.publicRows[0], [F.gender]: 1, [F.education]: 4 });
    const gate = evaluateGate(rel, survey);
    expect(gate.pass).toBe(false);
    expect(gate.checks.find(c => c.name.includes("S2"))?.pass).toBe(false);
  });

  it("hides a unique respondent instead of publishing them", () => {
    const rows = passingFixture();
    rows.push(respondent({ ...EMPLOYEE, [F.gender]: 1, [F.region]: 8, [F.education]: 4, [F.experience]: 4, [F.employment]: 3 }, 0));
    const rel = release(rows);
    const adults = rel.publicRows.filter(row => row[F.age] !== 0);
    expect(Math.min(...kPerRow(adults, S2))).toBeGreaterThanOrEqual(5);
    expect(rel.stats.suppressedCells).toBeGreaterThan(0);
  });

  it("writes nothing when the gate fails", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "privacy-")), "data");
    const rows = Array.from({ length: 12 }, (_, i) => respondent({ ...EMPLOYEE, [F.region]: i, [F.experience]: 1 + (i % 7) }, i));
    expect(writePublicRelease(rows, out, { random: seededRandom(1) })).toBe(false);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("writes the four files when the gate passes", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "privacy-")), "data");
    expect(writePublicRelease(passingFixture(), out, { random: seededRandom(1) })).toBe(true);
    expect(fs.readdirSync(out).sort()).toEqual(["flaws-questions.json", "flaws.json", "questions.json", "results.json"]);
  });

  it("withholds minors' flaw answers when too few to keep l-diversity", () => {
    const rows = passingFixture().filter(row => row[F.age] !== 0);
    for (let i = 0; i < 6; i++)
      rows.push(respondent({ [F.gender]: 0, [F.age]: 0, [F.region]: 1, [F.domain]: 0, [F.bountyStatus]: 3, [F.certifications]: [0] }, 0, false));
    const rel = release(rows);
    expect(rel.flawRows.filter(row => row[FLAW_AGE] === 0)).toEqual([]);
    expect(Object.values(rel.stats.flaw.regionLevels)).toContain("withheld");
  });
});

describe("privacy: simulator", () => {
  it("is reproducible and stores only what the server would store", () => {
    const a = generateSample(survey, { n: 150, seed: 7, minorShare: 0.04 });
    const b = generateSample(survey, { n: 150, seed: 7, minorShare: 0.04 });
    expect(a).toEqual(b);
    expect(a.filter(row => row[F.age] === 0)).toHaveLength(6);
    for (const row of a) {
      const { userId: _id, lastUpdated: _at, ...answers } = row;
      expect(sanitizeAnswers(answers).toSave).toEqual(answers);
    }
  });
});
