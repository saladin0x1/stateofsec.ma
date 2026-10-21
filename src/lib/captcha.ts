import { getSecret } from "astro:env/server";
import { requireSecret } from "@/lib/secrets";

const SITEVERIFY_URL
  = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
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
