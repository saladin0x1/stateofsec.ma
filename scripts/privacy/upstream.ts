import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Columns of data/upstream-profiles.csv: stateofdev.ma 2023-2024 answers (ODbL, GeeksBlaBla
// and contributors), with upstream's choice indices. Empty cells are unanswered questions
export const UPSTREAM_COLUMNS = [
  "year",
  "gender",
  "age",
  "region",
  "diploma",
  "studied",
  "experience",
  "employment",
  "mad",
  "tjm",
  "usdYear",
  "usdDay"
] as const;
export const UPSTREAM_CSV = "data/upstream-profiles.csv";

export type UpstreamProfile = Record<(typeof UPSTREAM_COLUMNS)[number], number | null>;

export function loadUpstreamProfiles(): UpstreamProfile[] {
  const file = fileURLToPath(new URL(UPSTREAM_CSV, import.meta.url));
  const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split("\n");
  if (header !== UPSTREAM_COLUMNS.join(","))
    throw new Error(`Unexpected columns in ${UPSTREAM_CSV}: ${header}`);
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(
      UPSTREAM_COLUMNS.map((column, i) => [column, cells[i] === "" ? null : Number(cells[i])])
    ) as UpstreamProfile;
  });
}
