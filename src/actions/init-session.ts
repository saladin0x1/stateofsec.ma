/* eslint-disable no-console */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { getCaptchaSecret, isCaptchaValid } from "@/lib/captcha";
import { verifyIdToken } from "@/lib/firebase/server";
import { startSession } from "@/lib/session";
import { SURVEY_OPEN } from "@/site-config.mjs";

export const initSession = defineAction({
  accept: "json",
  input: z.object({
    idToken: z.string(),
    captchaToken: z.string().optional()
  }),
  handler: async ({ idToken, captchaToken }, { cookies, url, clientAddress }) => {
    if (!SURVEY_OPEN) {
      throw new ActionError({
        code: "FORBIDDEN",
        message: "The survey is closed"
      });
    }

    /* Validate captcha */
    const captchaSecret = getCaptchaSecret();
    if (captchaSecret) {
      const isValid = !!captchaToken && await isCaptchaValid({
        token: captchaToken,
        secret: captchaSecret,
        hostname: url.hostname,
        remoteIp: clientAddress
      });
      if (!isValid) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Captcha verification failed"
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
