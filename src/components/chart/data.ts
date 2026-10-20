// Register each published year here once its results are exported, e.g.
// import Questions_2026 from "@/results/2026/data/questions.json";
// import DATA_2026 from "@/results/2026/data/results.json";

export type Year = string;
export type Question = globalThis.Question;
export type QuestionMap = globalThis.QuestionMap;
export type Results = globalThis.Results;

export interface SurveyData {
  questions: QuestionMap;
  results: Results["results"];
}

const surveyData: Partial<Record<Year, SurveyData>> = {};

export function getSurveyData(year: Year): SurveyData | undefined {
  return surveyData[year];
}
