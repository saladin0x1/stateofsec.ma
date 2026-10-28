/**
 * Exhaustive model check of the survey's branching (see src/lib/verify/explore.ts).
 *
 *   pnpm verify-survey                  check; fails on any finding, golden change or lock break
 *   pnpm verify-survey --update-golden  also rewrite scripts/verify/golden.json (review the diff)
 *
 * Inputs: survey/*.yml, scripts/verify/spec.yml (invariants, human-reviewed),
 * scripts/verify/golden.json (pinned statistics), survey/survey.lock.json (positional ids)
 */
/* eslint-disable node/prefer-global/process */
import type { SurveyLock } from "../src/lib/verify/lock";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurveyDir } from "../src/lib/verify/load";
import { formatReport, verifySurvey } from "../src/lib/verify/verify";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = {
  survey: path.join(root, "survey"),
  spec: path.join(root, "scripts/verify/spec.yml"),
  golden: path.join(root, "scripts/verify/golden.json"),
  lock: path.join(root, "survey/survey.lock.json")
};

function readJson(file: string): unknown {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
}

const updateGolden = process.argv.includes("--update-golden");
const golden = readJson(files.golden);
const result = verifySurvey({
  sections: loadSurveyDir(files.survey),
  specText: fs.readFileSync(files.spec, "utf8"),
  golden: updateGolden ? undefined : golden,
  lock: readJson(files.lock) as SurveyLock | undefined
});

let goldenUpdated = false;
if (updateGolden && result.golden) {
  fs.writeFileSync(files.golden, `${JSON.stringify(result.golden, null, 2)}\n`);
  goldenUpdated = true;
}
const goldenMissing = !updateGolden && golden === undefined;
console.log(formatReport(result, { goldenUpdated, goldenMissing }));
process.exit(result.ok && !goldenMissing ? 0 : 1);
