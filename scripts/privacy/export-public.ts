import type { Row } from "./fields";
import type { ReleaseOptions } from "./release";
import fs from "node:fs";
import path from "node:path";
import { evaluateGate, formatGateReport } from "./gate";
import { buildRelease } from "./release";
import { loadSurvey } from "./survey-definition";

export const PUBLIC_FILES = {
  results: "results.json",
  questions: "questions.json",
  flaws: "flaws.json",
  flawQuestions: "flaws-questions.json"
} as const;

/** Reads a raw export: `{ results: [...] }` (export-results output) or a bare array */
export function readRawExport(file: string): Row[] {
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { results?: Row[] } | Row[];
  const rows = Array.isArray(data) ? data : data.results;
  if (!Array.isArray(rows))
    throw new Error(`${file}: expected { "results": [...] } or an array of answers`);
  return rows;
}

// Owners' decision for 2026: charts and totals only, no row-level file (docs/privacy.md).
// Writing one takes an explicit allowRows (--allow-rows) once the owners decide otherwise
export interface WriteOptions extends ReleaseOptions {
  allowRows?: boolean;
}

/**
 * Builds the public release and writes it only if row-level files are allowed and the gate
 * passes. The gate report is printed either way.
 * @returns whether the files were written
 */
export function writePublicRelease(raw: Row[], outputDir: string, options: WriteOptions = {}): boolean {
  const survey = loadSurvey();
  const release = buildRelease(raw, survey, options);
  const gate = evaluateGate(release, survey, options.thresholds);
  console.log(formatGateReport(release, gate));
  if (!options.allowRows) {
    console.error(`[REFUSED] Nothing written to ${outputDir}: row-level files are not published this year (charts and totals only, docs/privacy.md); pass --allow-rows once the owners decide otherwise`);
    return false;
  }
  if (!gate.pass) {
    console.error(`[REFUSED] Nothing written to ${outputDir}: the release does not meet the thresholds (see docs/privacy.md)`);
    return false;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const write = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(data, null, 2)}\n`);
    console.log(`[OK] ${path.join(outputDir, name)}`);
  };
  write(PUBLIC_FILES.results, { results: release.publicRows });
  write(PUBLIC_FILES.questions, release.publicQuestions);
  write(PUBLIC_FILES.flaws, { results: release.flawRows });
  write(PUBLIC_FILES.flawQuestions, release.flawQuestions);
  return true;
}
