import { defineMiddleware } from "astro:middleware";
import { guardActionRequest } from "@/lib/action-guard";
import { withSecurityHeaders } from "@/lib/security-headers";

export const onRequest = defineMiddleware(async ({ request, url, routePattern }, next) => {
  const rejected = await guardActionRequest(request, url, routePattern);
  if (rejected)
    return withSecurityHeaders(rejected, url.pathname);
  return withSecurityHeaders(await next(), url.pathname);
});
