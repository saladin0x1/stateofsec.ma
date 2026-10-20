import type { AstroCookies } from "astro";
import { jwtVerify, SignJWT } from "jose";
import { requireSecret } from "@/lib/secrets";

const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 5;

function getSessionKey() {
  const secret = requireSecret("SESSION_SECRET");
  if (secret.length < 32)
    throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function startSession(cookies: AstroCookies, userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionKey());

  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS
  });
}

// Returns the respondent id, or null when the cookie is missing, expired or tampered with
export async function getSessionUserId(cookies: AstroCookies): Promise<string | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token)
    return null;

  const key = getSessionKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.sub ?? null;
  }
  catch {
    return null;
  }
}
