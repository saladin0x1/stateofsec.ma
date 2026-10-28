import type { SurveyQuestion, SurveyQuestionsYamlFile } from "../../src/lib/validators/survey-schema";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { validateSurveyFile } from "../../src/lib/validators/survey-schema";

export interface SurveyDefinition {
  sections: SurveyQuestionsYamlFile[];
  /** Every question by id (`<section label>-q-<index>`), in survey order */
  questions: Map<string, SurveyQuestion>;
}

export const DEFAULT_SURVEY_DIR = fileURLToPath(new URL("../../survey", import.meta.url));

// Same loading as scripts/generate-questions.ts (the YAML imports in src/lib/survey.ts need Vite)
export function loadSurvey(dir = DEFAULT_SURVEY_DIR): SurveyDefinition {
  const files = fs.readdirSync(dir).filter(file => file.endsWith(".yml")).sort();
  const sections = files.map(file =>
    validateSurveyFile(yaml.load(fs.readFileSync(path.join(dir, file), "utf8")), file)
  );
  const questions = new Map<string, SurveyQuestion>();
  for (const section of sections) {
    section.questions.forEach((question, index) => {
      questions.set(`${section.label}-q-${index}`, question);
    });
  }
  return { sections, questions };
}
