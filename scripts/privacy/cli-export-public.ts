// Writes the public release from a raw export, only if the release gate passes.
// pnpm export-public --input=scripts/<export>.json --output=results/<year>/data
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
process.exit(writePublicRelease(readRawExport(input), output) ? 0 : 1);
