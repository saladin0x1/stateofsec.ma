// Dry run of the public release on a raw export: prints the gate report, writes nothing.
// pnpm privacy:check --input=scripts/<export>.json [--k-s3=... what-if thresholds]
// Exit code 1 when the gate fails.
import process from "node:process";
import { arg, thresholdsFromArgs } from "./cli-args";
import { readRawExport } from "./export-public";
import { evaluateGate, formatGateReport } from "./gate";
import { buildRelease, THRESHOLDS } from "./release";
import { loadSurvey } from "./survey-definition";

const input = arg("input");
if (!input) {
  console.error("Usage: pnpm privacy:check --input=<raw export json> (see docs/privacy.md)");
  process.exit(2);
}
const thresholds = thresholdsFromArgs();
if (JSON.stringify(thresholds) !== JSON.stringify(THRESHOLDS))
  console.log(`What-if thresholds (export-public always uses the defaults): ${JSON.stringify(thresholds)}`);
const survey = loadSurvey();
const release = buildRelease(readRawExport(input), survey, { thresholds });
const gate = evaluateGate(release, survey, thresholds);
console.log(formatGateReport(release, gate));
process.exit(gate.pass ? 0 : 1);
