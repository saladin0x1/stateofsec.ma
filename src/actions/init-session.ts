/* eslint-disable no-console */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { withGenericErrors } from "@/lib/action-errors";
import { CAPTCHA_TOKEN_FORMAT, claimCaptchaToken, getCaptchaSecret, isCaptchaValid } from "@/lib/captcha";
import { verifyIdToken } from "@/lib/firebase/server";
import { startSession } from "@/lib/session";
import { SURVEY_OPEN } from "@/site-config.mjs";

function captchaFailed(): never {
  throw new ActionError({
    code: "UNAUTHORIZED",
    message: "Captcha verification failed"
  });
}

export const initSession = defineAction({
  accept: "json",
  input: z.object({
    // A Firebase ID token is about 1 KB; Turnstile documents 2048 characters as its maximum.
    // The token alphabet is fixed so no padded or re-encoded copy of one token can pass as
    // another for the one-time check (no spaces, control characters, % or non-ASCII)
    idToken: z.string().max(4096),
    captchaToken: z.string().max(2048).regex(CAPTCHA_TOKEN_FORMAT).optional()
  }),
  handler: async ({ idToken, captchaToken }, { cookies, url, clientAddress }) => withGenericErrors("initSession", async () => {
    if (!SURVEY_OPEN) {
      throw new ActionError({
        code: "FORBIDDEN",
        message: "The survey is closed"
      });
    }

    /* Verify id token first: a local check, so a bad request does not use up the captcha */
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

    /* Validate captcha, then claim it: each solved token opens one session at most.
       Siteverify first, so only solved tokens ever reach Firestore; parallel copies that
       siteverify lets through all meet the same atomic claim, and one wins */
    const captchaSecret = getCaptchaSecret();
    if (captchaSecret) {
      if (!captchaToken)
        captchaFailed();
      const isValid = await isCaptchaValid({
        token: captchaToken,
        secret: captchaSecret,
        hostname: url.hostname,
        remoteIp: clientAddress
      });
      if (!isValid)
        captchaFailed();
      // Dev uses Cloudflare's test keys, whose token is always the same, and must not
      // write to the production database
      if (import.meta.env.PROD && !await claimCaptchaToken(captchaToken)) {
        console.error("Captcha token reused");
        captchaFailed();
      }
    }

    await startSession(cookies, userId);
    console.log("user session created");
    return {
      success: true
    };
  })
});
