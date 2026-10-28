import type { SurveyLock } from "./lock";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { surveySections } from "../survey";
import { loadSurveyDir } from "./load";
import { verifySurvey } from "./verify";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("the real survey", () => {
  it("is checked exactly as the app serves it", () => {
    expect(loadSurveyDir(path.join(root, "survey"))).toEqual(surveySections);
  });

  // The same run as `pnpm verify-survey`: preconditions, the reviewed spec, exhaustive
  // exploration, pinned statistics and the positional-id lock
  it("passes every check, keeps its golden statistics and its lock", () => {
    const result = verifySurvey({
      sections: surveySections,
      specText: read("scripts/verify/spec.yml"),
      golden: JSON.parse(read("scripts/verify/golden.json")),
      lock: JSON.parse(read("survey/survey.lock.json")) as SurveyLock
    });
    expect(result.findings).toEqual([]);
    expect(result.goldenDiff).toEqual([]);
    expect(result.lock?.ok).toBe(true);
    expect(result.ok).toBe(true);
  }, 120_000);
});
