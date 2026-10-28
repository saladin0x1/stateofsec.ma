import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

// The survey YAML read directly, so personas are checked against the real questions
// (a persona that names a label or choice that no longer exists fails loudly)

export interface YamlQuestion {
  label: string;
  choices: string[];
  multiple?: boolean;
  required?: boolean;
}

export interface YamlSection {
  title: string;
  label: string;
  questions: YamlQuestion[];
}

const surveyDir = fileURLToPath(new URL("../../../survey", import.meta.url));

export const sections: YamlSection[] = readdirSync(surveyDir)
  .filter(file => file.endsWith(".yml"))
  .sort()
  .map(file => load(readFileSync(join(surveyDir, file), "utf8")) as YamlSection);

export interface QuestionRef {
  id: string;
  section: string;
  question: YamlQuestion;
}

// Question label -> its id and definition
export const questionsByLabel = new Map<string, QuestionRef>(
  sections.flatMap(section =>
    section.questions.map((question, index) => [
      question.label,
      { id: `${section.label}-q-${index}`, section: section.label, question }
    ] as const)
  )
);

export const sectionLabels = sections.map(section => section.label);
