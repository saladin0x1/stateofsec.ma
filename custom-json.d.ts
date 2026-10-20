/**
 * This file is used to define the types for the results.json and questions.json files
 * Mainly to prevent code editor from loading typing from json files which is can be very heavy
 */

interface Question {
  label: string;
  choices: string[];
  multiple: boolean | null;
  required: boolean | null;
}

interface QuestionMap {
  [key: string]: Question;
}

interface Results {
  results: {
    [key: string]: number | number[] | string | string[] | null | undefined;
  }[];
}

declare module "@/results/*/results.json" {
  const value: Results;
  export default value;
}

declare module "@/results/*/questions.json" {
  const value: QuestionMap;
  export default value;
}
