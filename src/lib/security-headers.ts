// Security headers for every response the worker renders (server pages and actions). The
// prerendered pages are served as static assets without the worker: public/_headers gives
// them the same headers, so keep the two in sync
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

// Pages and endpoints that depend on the respondent's session: never cached
const PRIVATE_PREFIXES = ["/survey", "/thanks", "/_actions/"];

// A real submit is a few KB of choice indexes and "Other" text of at most 200 characters
export const MAX_ACTION_BODY_BYTES = 64 * 1024;

function isPrivate(pathname: string) {
  return PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function setHeaders(headers: Headers, pathname: string) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    headers.set(name, value);
  if (isPrivate(pathname))
    headers.set("Cache-Control", "private, no-store");
}

/**
 * Adds the security headers. The response is changed in place when it can be: Astro keeps the
 * session cookie on its own response object, so a copy would drop it. A response with
 * immutable headers (e.g. Response.redirect) is copied instead; Astro sets no cookie on those.
 */
export function withSecurityHeaders(response: Response, pathname: string): Response {
  try {
    setHeaders(response.headers, pathname);
    return response;
  }
  catch {
    const copy = new Response(response.body, response);
    setHeaders(copy.headers, pathname);
    return copy;
  }
}

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Turns away a JSON action request that is too large (413) or not valid JSON (400), before
 * Astro parses it: a malformed body used to end in a 500, and nothing capped the size.
 * Other content types are left to Astro, which refuses them.
 */
export async function rejectBadActionBody(request: Request): Promise<Response | undefined> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_ACTION_BODY_BYTES)
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    return undefined;
  const text = await request.clone().text();
  if (new TextEncoder().encode(text).length > MAX_ACTION_BODY_BYTES)
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  try {
    JSON.parse(text);
  }
  catch {
    return errorResponse(400, "BAD_REQUEST", "Malformed JSON");
  }
  return undefined;
}
