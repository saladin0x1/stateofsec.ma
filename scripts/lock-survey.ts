/**
 * Positional-id lock (survey/survey.lock.json, see src/lib/verify/lock.ts).
 *
 *   pnpm lock-survey            check the survey against the lock
 *   pnpm lock-survey --update   rewrite the lock (after launch: only adds new ids)
 *
 * Before launch ("launched": false) differences are reported and allowed. Set "launched" to
 * true when the survey opens; from then on changing an existing id fails this check and
 * pnpm verify-survey, because stored answers would change meaning
 */
/* eslint-disable node/prefer-global/process */
import type { SurveyLock } from "../src/lib/verify/lock";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurveyDir } from "../src/lib/verify/load";
import { checkLock, updateLock } from "../src/lib/verify/lock";
import { buildModel } from "../src/lib/verify/model";

const root = fileURLToPath(new URL("..", import.meta.url));
const lockFile = path.join(root, "survey/survey.lock.json");
const model = buildModel(loadSurveyDir(path.join(root, "survey")));
const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, "utf8")) as SurveyLock : undefined;

if (process.argv.includes("--update")) {
  const { lock: next, refused } = updateLock(lock, model);
  if (!next) {
    console.error("[X] The survey is launched: these ids changed meaning and cannot be relocked:");
    refused.forEach(line => console.error(`    ${line}`));
    console.error("    Revert the change, or add a new question instead of editing an existing one.");
    process.exit(1);
  }
  fs.writeFileSync(lockFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[OK] Wrote ${path.relative(root, lockFile)} (${Object.keys(next.questions).length} ids, launched: ${next.launched})`);
  process.exit(0);
}

if (!lock) {
  console.error("[X] No survey/survey.lock.json: run pnpm lock-survey --update");
  process.exit(1);
}
const status = checkLock(lock, model);
const lines = [...status.changed, ...status.removed.map(id => `${id}: removed`), ...status.added.map(id => `${id}: not locked`)];
if (lines.length === 0) {
  console.log(`[OK] ${Object.keys(lock.questions).length} ids match the lock (launched: ${lock.launched})`);
  process.exit(0);
}
const head = lock.launched
  ? "[X] The survey is launched and these ids differ from the lock:"
  : "Lock differs from the survey (allowed before launch; pnpm lock-survey --update to refresh):";
console.log(head);
lines.forEach(line => console.log(`    ${line}`));
process.exit(status.ok ? 0 : 1);
