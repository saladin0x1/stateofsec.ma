import type { SurveySections } from "./model";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { validateSurveyFile } from "../validators/survey-schema";

/** Parses survey YAML texts with the app's schema, in position order (the engine's order) */
export function parseSurvey(files: Array<{ name: string; text: string }>): SurveySections {
  return files
    .map(file => validateSurveyFile(yaml.load(file.text), file.name))
    .sort((a, b) => a.position - b.position);
}

/** Loads every survey/*.yml file of a directory */
export function loadSurveyDir(dir: string): SurveySections {
  const names = fs.readdirSync(dir).filter(name => name.endsWith(".yml")).sort();
  return parseSurvey(names.map(name => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") })));
}
