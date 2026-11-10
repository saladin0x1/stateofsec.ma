import { errorResponse, rejectBadActionBody } from "@/lib/security-headers";

// Astro runs an action for more URLs than the two the client calls: other spellings of the
// path (`//_actions/x`), names inherited from Object.prototype (`/_actions/constructor`),
// `/_actions/<name>.orThrow`, and `?_action=<name>` on any server-rendered page (HTML form
// actions, which this site does not use). Only the exact paths below get through, and only
// as JSON POSTs within the body cap. Nothing else on the site takes a request body, so every
// other method than GET and HEAD is refused before any route reads one (the server islands
// endpoint, unused here, would otherwise parse a body of any size).
export const ACTION_ROUTE_PATTERN = "/_actions/[...path]";
export const SERVER_ISLAND_ROUTE_PATTERN = "/_server-islands/[name]";
export const ACTION_PATHS: ReadonlySet<string> = new Set([
  "/_actions/initSession",
  "/_actions/submitAnswers"
]);

function notFound() {
  return errorResponse(404, "NOT_FOUND", "Not found");
}

function methodNotAllowed(allow: string) {
  const response = errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  response.headers.set("Allow", allow);
  return response;
}

export async function guardActionRequest(
  request: Request,
  url: URL,
  routePattern: string
): Promise<Response | undefined> {
  if (url.searchParams.has("_action"))
    return notFound();

  // Astro's own routing decision, plus any path that mentions an endpoint, whatever Astro
  // makes of it (it decodes the path before routing)
  const path = url.pathname.toLowerCase();
  if (routePattern === SERVER_ISLAND_ROUTE_PATTERN || path.includes("_server-islands"))
    return notFound();

  const isActionRequest = routePattern === ACTION_ROUTE_PATTERN || path.includes("_actions");
  if (!isActionRequest) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return methodNotAllowed("GET, HEAD");
    return undefined;
  }

  // Both the path Astro routed on and the path as sent: the client always sends the exact one
  if (!ACTION_PATHS.has(url.pathname) || !ACTION_PATHS.has(new URL(request.url).pathname))
    return notFound();

  if (request.method !== "POST")
    return methodNotAllowed("POST");
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json")
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json");
  return rejectBadActionBody(request);
}
