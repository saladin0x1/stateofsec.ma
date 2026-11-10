import { describe, expect, it } from "vitest";
import { ACTION_ROUTE_PATTERN, guardActionRequest, SERVER_ISLAND_ROUTE_PATTERN } from "@/lib/action-guard";
import { MAX_ACTION_BODY_BYTES } from "@/lib/security-headers";

const ORIGIN = "https://stateofsec.ma";
const JSON_TYPE = { "content-type": "application/json" };

// The route pattern Astro reports for the request, as the middleware receives it. Astro
// hands the middleware a decoded URL (decodeURI on the path), the request keeps the raw one
async function guard(path: string, init: RequestInit = {}, routePattern = ACTION_ROUTE_PATTERN) {
  const request = new Request(`${ORIGIN}${path}`, init);
  const url = new URL(request.url);
  url.pathname = decodeURI(url.pathname);
  return guardActionRequest(request, url, routePattern);
}

function post(body: string, headers: Record<string, string> = JSON_TYPE): RequestInit {
  return { method: "POST", headers, body };
}

describe("guardActionRequest", () => {
  it("lets the two real actions through as JSON POSTs", async () => {
    for (const path of ["/_actions/initSession", "/_actions/submitAnswers"])
      expect(await guard(path, post("{\"a\":1}"))).toBeUndefined();
  });

  it("leaves page and asset reads alone", async () => {
    expect(await guard("/", {}, "/")).toBeUndefined();
    expect(await guard("/survey", {}, "/survey")).toBeUndefined();
    expect(await guard("/faq", { method: "HEAD" }, "/faq")).toBeUndefined();
  });

  it("refuses any request body outside the two actions with 405", async () => {
    for (const [method, path, pattern] of [["POST", "/faq", "/faq"], ["PUT", "/survey", "/survey"], ["DELETE", "/", "/"], ["PATCH", "/_image", "/_image"], ["OPTIONS", "/", "/"]]) {
      const response = await guard(path, method === "POST" ? post("{}") : { method }, pattern);
      expect(response?.status, `${method} ${path}`).toBe(405);
      expect(response?.headers.get("Allow")).toBe("GET, HEAD");
    }
  });

  it("closes the unused server islands endpoint, whatever the spelling", async () => {
    expect((await guard("/_server-islands/x", post("{\"a\":"), SERVER_ISLAND_ROUTE_PATTERN))?.status).toBe(404);
    expect((await guard("//_server-islands/x", post("{}"), SERVER_ISLAND_ROUTE_PATTERN))?.status).toBe(404);
    expect((await guard("/%5Fserver-islands/x", post("{}"), SERVER_ISLAND_ROUTE_PATTERN))?.status).toBe(404);
    expect((await guard("/_server-islands/x", {}, SERVER_ISLAND_ROUTE_PATTERN))?.status).toBe(404);
  });

  it("refuses encoded spellings of a real action that Astro would decode to it", async () => {
    for (const path of ["/%5Factions/initSession", "/_act%69ons/submitAnswers", "/_actions/init%53ession", "/%5factions/submitAnswers"])
      expect((await guard(path, post("{}")))?.status, path).toBe(404);
  });

  it("refuses HTML form actions on any page", async () => {
    for (const path of ["/survey?_action=submitAnswers", "/?_action=initSession", "/before-start?_action=x"]) {
      const response = await guard(path, post("{}"), path.split("?")[0]);
      expect(response?.status).toBe(404);
    }
  });

  it("refuses other spellings and names that reach the action route", async () => {
    const paths = [
      "//_actions/initSession",
      "//_actions/submitAnswers",
      "/_actions//submitAnswers",
      "/_actions/_actions/submitAnswers",
      "/_actions/constructor",
      "/_actions/__proto__",
      "/_actions/toString",
      "/_actions/submitAnswers.orThrow",
      "/_actions/initSession/",
      "/_actions/removeSession"
    ];
    for (const path of paths)
      expect((await guard(path, post("{}")))?.status, path).toBe(404);
  });

  it("refuses paths that mention the endpoint even when Astro routed them elsewhere", async () => {
    expect((await guard("/_ACTIONS/initSession", post("{}"), "/404"))?.status).toBe(404);
    expect((await guard("/x/_actions/initSession", post("{}"), "/404"))?.status).toBe(404);
  });

  it("answers anything but POST on a real action with 405", async () => {
    const response = await guard("/_actions/initSession", { method: "GET" });
    expect(response?.status).toBe(405);
    expect(response?.headers.get("Allow")).toBe("POST");
  });

  it("refuses other content types with 415", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
      const headers: Record<string, string> = type ? { "content-type": type } : {};
      expect((await guard("/_actions/submitAnswers", post("{}", headers)))?.status, type || "none").toBe(415);
    }
    expect(await guard("/_actions/submitAnswers", post("{}", { "content-type": "application/json; charset=utf-8" }))).toBeUndefined();
  });

  it("answers an upload that breaks off with 400, not a server error", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{\"a\":"));
        controller.error(new Error("Network connection lost"));
      }
    });
    const response = await guard("/_actions/submitAnswers", { method: "POST", headers: JSON_TYPE, body, duplex: "half" } as RequestInit);
    expect(response?.status).toBe(400);
  });

  it("refuses an oversized body with 413 and malformed JSON with 400", async () => {
    const big = `{"a":"${"x".repeat(MAX_ACTION_BODY_BYTES)}"}`;
    expect((await guard("/_actions/submitAnswers", post(big)))?.status).toBe(413);
    expect((await guard("/_actions/submitAnswers", post("{\"a\":")))?.status).toBe(400);
  });

  it("refuses an oversized streamed body without a Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Far more than the cap: the guard must stop reading long before the end
        if (sent++ < 1000)
          controller.enqueue(chunk);
        else
          controller.close();
      }
    });
    const response = await guard("/_actions/submitAnswers", { method: "POST", headers: JSON_TYPE, body, duplex: "half" } as RequestInit);
    expect(response?.status).toBe(413);
    expect(sent).toBeLessThan(20);
  });
});
