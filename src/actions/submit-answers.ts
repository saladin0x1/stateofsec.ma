/* eslint-disable no-console */
import type { Answers } from "@/lib/conditions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { withGenericErrors } from "@/lib/action-errors";
import { isAnswersShape } from "@/lib/answer-shape";
import { InvalidAnswersError, reachedSectionIndex, sanitizeAnswers } from "@/lib/answers";
import { saveAnswers } from "@/lib/firebase/database";
import { getSessionUserId } from "@/lib/session";
import { SURVEY_OPEN } from "@/site-config.mjs";

export const submitAnswers = defineAction({
  accept: "json",
  input: z.object({
    // One cheap pass with a single short error: Astro validates the input before the
    // handler, so this runs for anyone, with or without a session
    answers: z.custom<Answers>(isAnswersShape, "Invalid answers"),
    // Label of the section being submitted: stored fields of later sections are kept
    // (missing or unknown, e.g. a client from an older deploy: nothing is deleted)
    section: z.string().max(64).optional()
  }),
  handler: async ({ answers, section }, { cookies }) => withGenericErrors("submitAnswers", async () => {
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
      sanitized = sanitizeAnswers(answers, reachedSectionIndex(section));
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
  })
});
