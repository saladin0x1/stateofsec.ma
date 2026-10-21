import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { validateSurveyFile } from "@/lib/validators/survey-schema";
import profileQuestionsRaw from "@/survey/1-profile.yml";
import rolesQuestionsRaw from "@/survey/2-roles.yml";
import learningQuestionsRaw from "@/survey/3-learning.yml";
import workQuestionsRaw from "@/survey/4-work.yml";
import techQuestionsRaw from "@/survey/5-tech.yml";
import communityQuestionsRaw from "@/survey/6-community.yml";

// Shared by the survey page and the submit action so both see the same questions
export const surveySections: SurveyQuestionsYamlFile[] = [
  validateSurveyFile(profileQuestionsRaw, "1-profile.yml"),
  validateSurveyFile(rolesQuestionsRaw, "2-roles.yml"),
  validateSurveyFile(learningQuestionsRaw, "3-learning.yml"),
  validateSurveyFile(workQuestionsRaw, "4-work.yml"),
  validateSurveyFile(techQuestionsRaw, "5-tech.yml"),
  validateSurveyFile(communityQuestionsRaw, "6-community.yml")
];
