/* eslint-disable no-console */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { isCaptchaValid } from "@/lib/captcha";
import { verifyIdToken } from "@/lib/firebase/server";
import { startSession } from "@/lib/session";

export const initSession = defineAction({
  accept: "json",
  input: z.object({
    idToken: z.string(),
    captchaToken: z.string().optional()
  }),
  handler: async ({ idToken, captchaToken }, { cookies }) => {
    /* Validate inputs */
    if (!captchaToken && import.meta.env.CAPTCHA_ENABLED === "true") {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "Captcha token is required"
      });
    }
    if (!idToken) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "No idToken provided"
      });
    }

    /* Validate captcha */
    if (captchaToken && import.meta.env.CAPTCHA_ENABLED === "true") {
      console.log("checking captcha ");

      const isValid = await isCaptchaValid(captchaToken);
      if (!isValid) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Invalid captcha"
        });
      }
    }

    /* Verify id token */
    let userId: string;
    try {
      userId = await verifyIdToken(idToken);
    }
    catch (error) {
      console.error("Error verifying id token:", error);
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "Invalid id token"
      });
    }

    await startSession(cookies, userId);
    console.log("user session created");
    return {
      success: true
    };
  }
});
