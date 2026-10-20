import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { requireSecret } from "@/lib/secrets";

// firebase-admin does not run on Cloudflare Workers, so ID tokens are verified and
// Google access tokens are minted directly with WebCrypto through jose
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const CLOCK_TOLERANCE_SECONDS = 5;

export function getProjectId() {
  return requireSecret("FIREBASE_PROJECT_ID");
}

// Claim checks follow https://firebase.google.com/docs/auth/admin/verify-id-tokens
export async function verifyIdToken(idToken: string): Promise<string> {
  const projectId = getProjectId();
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    clockTolerance: CLOCK_TOLERANCE_SECONDS
  });

  const latestAllowed = Math.floor(Date.now() / 1000) + CLOCK_TOLERANCE_SECONDS;
  if (typeof payload.iat !== "number" || payload.iat > latestAllowed)
    throw new Error("Invalid iat claim");
  if (typeof payload.auth_time !== "number" || payload.auth_time > latestAllowed)
    throw new Error("Invalid auth_time claim");
  if (!payload.sub)
    throw new Error("Missing sub claim");

  return payload.sub;
}

let cachedAccessToken: { token: string; expiresAt: number } | undefined;

export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000)
    return cachedAccessToken.token;

  const clientEmail = requireSecret("FIREBASE_CLIENT_EMAIL");
  // keys stored in single-line env vars keep their newlines escaped
  const privateKey = await importPKCS8(
    requireSecret("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    "RS256"
  );
  const assertion = await new SignJWT({ scope: FIRESTORE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok)
    throw new Error(`Google token exchange failed with status ${response.status}`);

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return cachedAccessToken.token;
}
