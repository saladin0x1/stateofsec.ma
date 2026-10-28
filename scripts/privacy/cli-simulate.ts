// Simulated releases: disclosure metrics before and after coarsening, and the gate verdict.
// pnpm privacy:simulate [--n=300,800,2000] [--minors=0.02,0.05] [--seed=1] [--k-s3=... what-if]
import type { Row } from "./fields";
import type { KSummary } from "./metrics";
import { numbers, thresholdsFromArgs } from "./cli-args";
import { F, FLAW_BLOCK, MINOR_QI, S1, S2, S3, STRATA } from "./fields";
import { evaluateGate, formatGateReport } from "./gate";
import { lDiversity, rowKey, stratumK } from "./metrics";
import { buildRelease, recodeOnly } from "./release";
import { seededRandom } from "./rng";
import { generateSample } from "./simulate";
import { loadSurvey } from "./survey-definition";

const survey = loadSurvey();
const thresholds = thresholdsFromArgs();
const sizes = numbers("n", [300, 800, 2000]);
const minorShares = numbers("minors", [0.02, 0.05]);
const [seed] = numbers("seed", [1]);

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);
const cell = (s: KSummary) => (s.rows ? `${pct(s.unique)} ${pct(s.under5)} ${String(s.minK).padStart(3)}` : "      -     ");
const withCountry = (fields: string[]) => [...fields, F.country];

const SETS: Array<[name: string, fields: string[]]> = [["S1", S1], ["S2", S2], ["S3", S3]];

function report(n: number, minorShare: number) {
  const raw = generateSample(survey, { n, seed, minorShare });
  const recoded = recodeOnly(raw, survey);
  const release = buildRelease(raw, survey, { thresholds, random: seededRandom(seed) });
  const rawStrata = Object.fromEntries(Object.entries(STRATA).map(([name, test]) => [name, raw.map(r => test(r))]));
  const minors = raw.filter(r => r[F.age] === 0).length;

  console.log(`\n=== n=${n}, minors ${pct(minorShare).trim()} (${minors} rows), seed ${seed}`);
  console.log("Share of rows unique (k=1), share with k<5, and smallest k; classes counted over the whole file");
  console.log(`${"stratum".padEnd(11)}${"set".padEnd(8)}${"raw export".padEnd(16)}${"owner merges".padEnd(16)}released`);
  for (const stratum of Object.keys(STRATA)) {
    const sets: Array<[string, string[]]> = stratum === "minors" ? [...SETS, ["minorQI", MINOR_QI]] : SETS;
    for (const [name, fields] of sets) {
      const before = stratumK(raw, rawStrata[stratum], withCountry(fields));
      const merged = stratumK(recoded, rawStrata[stratum], fields);
      const after = stratumK(release.publicRows, release.audit.strata[stratum], fields);
      console.log(`${stratum.padEnd(11)}${name.padEnd(8)}${cell(before).padEnd(16)}${cell(merged).padEnd(16)}${cell(after)}`);
    }
  }

  // Flaw answers left in the main file (classes = S2 with country) vs the separate flaw file
  const answered = (row: Row) => FLAW_BLOCK.some(id => row[id] != null);
  const inMain = lDiversity(raw.filter(answered), row => rowKey(row, withCountry(S2)), FLAW_BLOCK, thresholds.lFlaw);
  console.log(`flaw block, if left in the main file: min l ${inMain.minL}, ${pct(inMain.rowsBelow).trim()} of answering rows in classes with l < ${thresholds.lFlaw}`);
  console.log(formatGateReport(release, evaluateGate(release, survey, thresholds)));
}

for (const n of sizes) {
  for (const minorShare of minorShares)
    report(n, minorShare);
}
