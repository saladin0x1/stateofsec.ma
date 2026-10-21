/* eslint-disable no-console */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { InvalidAnswersError, sanitizeAnswers } from "@/lib/answers";
import { saveAnswers } from "@/lib/firebase/database";
import { getSessionUserId } from "@/lib/session";
import { SURVEY_OPEN } from "@/site-config.mjs";

export const submitAnswers = defineAction({
  accept: "json",
  input: z.object({
    answers: z.record(
      z.string(),
      z.union([z.number(), z.string().max(200), z.array(z.number()), z.null()])
    )
  }),
  handler: async ({ answers }, { cookies }) => {
    if (!SURVEY_OPEN) {
      throw new ActionError({
        code: "FORBIDDEN",
        message: "The survey is closed"
      });
    }

    /* Verify Session */
    const userId = await getSessionUserId(cookies);
    if (!userId) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "No session is active, please initialize a session first"
      });
    }

    /* Validate answers against the survey definition */
    let sanitized: ReturnType<typeof sanitizeAnswers>;
    try {
      sanitized = sanitizeAnswers(answers);
    }
    catch (error) {
      if (error instanceof InvalidAnswersError) {
        throw new ActionError({ code: "BAD_REQUEST", message: error.message });
      }
      throw error;
    }

    /* Save answers to database */
    try {
      await saveAnswers(userId, sanitized.toSave, sanitized.toDelete);
      console.log("answers saved");
    }
    catch (error) {
      console.error("Error saving answers:", error);
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error saving answers"
      });
    }
  }
});
