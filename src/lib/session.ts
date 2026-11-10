import type { AstroCookies } from "astro";
import { jwtVerify, SignJWT } from "jose";
import { requireSecret } from "@/lib/secrets";

// __Host-: browsers only accept it from this exact host, over HTTPS, with Path=/ and no
// Domain, so no subdomain can plant or replace it. Plain http in dev cannot set it
export const SESSION_COOKIE = import.meta.env.PROD ? "__Host-session" : "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 5;
// Required in every token: tokens issued before 2026-11-10 carry no audience, so they stop
// counting whatever cookie they are sent in. Change the value to end every session at once
export const SESSION_AUDIENCE = "stateofsec-session-v2";

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
    .setAudience(SESSION_AUDIENCE)
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

// After the last section: the next person on this browser must not continue this response
export function endSession(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax"
  });
}

// Returns the respondent id, or null when the cookie is missing, expired or tampered with
export async function getSessionUserId(cookies: AstroCookies): Promise<string | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token)
    return null;

  const key = getSessionKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: SESSION_AUDIENCE });
    return payload.sub ?? null;
  }
  catch {
    return null;
  }
}
