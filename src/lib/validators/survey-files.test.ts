import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ValidationSeverity } from "./constants";
import { validateAllSurveyFiles } from "./survey-validator";

// The live survey must validate: CI runs tests but builds with astro directly, so this is
// what stops a broken survey (e.g. a label split by a comma in a YAML list) from merging
describe("survey files", () => {
  it("pass the survey validator", () => {
    const report = validateAllSurveyFiles(path.resolve(__dirname, "../../../survey"));
    const errors = [
      ...report.fileResults.flatMap(result => result.errors ?? []),
      ...report.crossFileErrors
    ]
      .filter(error => error.severity === ValidationSeverity.ERROR)
      .map(error => `${error.path}: ${error.message}`);
    expect(errors).toEqual([]);
    expect(report.success).toBe(true);
  });
});
