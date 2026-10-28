import { defineMiddleware } from "astro:middleware";
import { rejectBadActionBody, withSecurityHeaders } from "@/lib/security-headers";

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (request.method === "POST" && url.pathname.startsWith("/_actions/")) {
    const rejected = await rejectBadActionBody(request);
    if (rejected)
      return withSecurityHeaders(rejected, url.pathname);
  }
  return withSecurityHeaders(await next(), url.pathname);
});
