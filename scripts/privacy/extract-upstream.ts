// Rebuilds data/upstream-profiles.csv from stateofdev.ma's published open data (ODbL,
// GeeksBlaBla and contributors), read from the `upstream` git remote. The simulator only
// needs the profile and pay columns, so only those are kept, with upstream's choice indices.
// Run: pnpm tsx scripts/privacy/extract-upstream.ts (after `git fetch upstream`)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { UPSTREAM_COLUMNS, UPSTREAM_CSV } from "./upstream";

// 2023 and 2024 share these question ids and choice indices (2024 only adds an "Other"
// at the end of diploma and employment)
const SOURCE: Record<(typeof UPSTREAM_COLUMNS)[number], string | null> = {
  year: null,
  gender: "profile-q-0",
  age: "profile-q-1",
  region: "profile-q-2",
  diploma: "profile-q-4",
  studied: "education-q-0",
  experience: "profile-q-5",
  employment: "work-q-0",
  mad: "work-q-5",
  tjm: "work-q-6",
  usdYear: "work-q-7",
  usdDay: "work-q-8"
};
const YEARS = ["2023", "2024"];

function readUpstream(year: string) {
  const json = execFileSync("git", ["show", `upstream/master:results/${year}/data/results.json`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  return (JSON.parse(json) as { results: Record<string, unknown>[] }).results;
}

function cell(value: unknown) {
  return typeof value === "number" ? String(value) : "";
}

function main() {
  const lines = [UPSTREAM_COLUMNS.join(",")];
  for (const year of YEARS) {
    for (const row of readUpstream(year)) {
      const age = row["profile-q-1"];
      if (typeof age !== "number" || typeof row["profile-q-0"] !== "number" || typeof row["profile-q-2"] !== "number")
        continue;
      // Adults need the whole S2 profile; minors only answered gender, age and region here
      const adultFields = ["profile-q-4", "profile-q-5", "work-q-0"];
      if (age > 0 && !adultFields.every(id => typeof row[id] === "number"))
        continue;
      lines.push(UPSTREAM_COLUMNS.map(column => column === "year" ? year : cell(row[SOURCE[column]!])).join(","));
    }
  }
  const target = fileURLToPath(new URL(UPSTREAM_CSV, import.meta.url));
  fs.writeFileSync(target, `${lines.join("\n")}\n`);
  console.log(`[OK] ${lines.length - 1} rows written to ${path.relative(process.cwd(), target)}`);
}

main();
