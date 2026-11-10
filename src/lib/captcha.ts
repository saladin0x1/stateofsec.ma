import { getSecret } from "astro:env/server";
import { createDocumentOnce } from "@/lib/firebase/database";
import { requireSecret } from "@/lib/secrets";

const SITEVERIFY_URL
  = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5000;
const USED_TOKENS_COLLECTION = "captcha_tokens";
// Turnstile tokens expire after 300 s, so old records only take space. Optional cleanup:
// a Firestore TTL policy on captcha_tokens.expireAt
const USED_TOKEN_RECORD_TTL_MS = 24 * 60 * 60 * 1000;
// Letters, digits and the separators of base64 and base64url, plus "." and ":"; Cloudflare's
// test token XXXX.DUMMY.TOKEN.XXXX fits too
export const CAPTCHA_TOKEN_FORMAT = /^[\w.:+/=-]+$/;

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Marks a solved captcha token as used: true the first time, false for any later or
 * parallel use. Siteverify alone let one solved token open many sessions when they were
 * sent at the same instant.
 */
export async function claimCaptchaToken(token: string): Promise<boolean> {
  const now = Date.now();
  return createDocumentOnce(USED_TOKENS_COLLECTION, await sha256Hex(token), {
    usedAt: { timestampValue: new Date(now).toISOString() },
    expireAt: { timestampValue: new Date(now + USED_TOKEN_RECORD_TTL_MS).toISOString() }
  });
}

interface SiteverifyResponse {
  "success": boolean;
  "hostname"?: string;
  "error-codes"?: string[];
}

// Required in production; in dev only enforced when a (test) secret is configured
export function getCaptchaSecret(): string | undefined {
  return import.meta.env.PROD
    ? requireSecret("TURNSTILE_SECRET_KEY")
    : getSecret("TURNSTILE_SECRET_KEY");
}

export async function isCaptchaValid({
  token,
  secret,
  hostname,
  remoteIp
}: {
  token: string;
  secret: string;
  hostname: string;
  remoteIp?: string;
}): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp)
    body.set("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS)
    });
    const data = await response.json() as SiteverifyResponse;
    if (!data.success) {
      console.error("Captcha rejected:", data["error-codes"]);
      return false;
    }
    // Test keys report a placeholder hostname, so the check only applies in production
    return !import.meta.env.PROD || data.hostname === hostname;
  }
  catch (error) {
    console.error("Error validating captcha:", error);
    return false;
  }
}
