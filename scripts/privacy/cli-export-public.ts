// Writes the public release from a raw export, only with --allow-rows and if the release
// gate passes (this year: charts and totals only, so it refuses by default).
// pnpm export-public --input=scripts/<export>.json --output=results/<year>/data [--allow-rows]
// Thresholds are fixed here on purpose; privacy:check takes what-if values.
import process from "node:process";
import { arg } from "./cli-args";
import { readRawExport, writePublicRelease } from "./export-public";

const input = arg("input");
const output = arg("output");
if (!input || !output) {
  console.error("Usage: pnpm export-public --input=<raw export json> --output=results/<year>/data");
  process.exit(2);
}
const allowRows = process.argv.includes("--allow-rows");
process.exit(writePublicRelease(readRawExport(input), output, { allowRows }) ? 0 : 1);
