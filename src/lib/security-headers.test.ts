import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_ACTION_BODY_BYTES, rejectBadActionBody, SECURITY_HEADERS, withSecurityHeaders } from "./security-headers";

function post(body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new Request("https://stateofsec.ma/_actions/submitAnswers", { method: "POST", body, headers });
}

describe("withSecurityHeaders", () => {
  it("adds every security header, in place, keeping status and body", async () => {
    const response = new Response("ok", { status: 201 });
    const out = withSecurityHeaders(response, "/faq");
    expect(out).toBe(response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      expect(out.headers.get(name)).toBe(value);
    expect(out.status).toBe(201);
    expect(await out.text()).toBe("ok");
  });

  it("marks session pages and actions private, and only those", () => {
    for (const pathname of ["/survey", "/thanks", "/_actions/initSession", "/_actions/submitAnswers"])
      expect(withSecurityHeaders(new Response(null), pathname).headers.get("Cache-Control")).toBe("private, no-store");
    for (const pathname of ["/", "/faq", "/surveys-of-the-world", "/thanksgiving"])
      expect(withSecurityHeaders(new Response(null), pathname).headers.get("Cache-Control")).toBeNull();
  });

  it("copies a response whose headers cannot change", () => {
    const redirect = Response.redirect("https://stateofsec.ma/before-start", 302);
    const out = withSecurityHeaders(redirect, "/survey");
    expect(out.status).toBe(302);
    expect(out.headers.get("Location")).toBe("https://stateofsec.ma/before-start");
    expect(out.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("matches public/_headers, which covers the prerendered pages", () => {
    const file = fs.readFileSync(path.resolve(__dirname, "../../public/_headers"), "utf8");
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      expect(file).toContain(`  ${name}: ${value}\n`);
  });
});

describe("rejectBadActionBody", () => {
  it("lets a valid JSON body through, still readable by Astro", async () => {
    const request = post(JSON.stringify({ answers: { "profile-q-0": 0 } }));
    expect(await rejectBadActionBody(request)).toBeUndefined();
    expect(await request.json()).toEqual({ answers: { "profile-q-0": 0 } });
  });

  it("refuses malformed JSON with 400 instead of a server error", async () => {
    const response = await rejectBadActionBody(post("{\"idToken\":"));
    expect(response?.status).toBe(400);
  });

  it("refuses a body over the cap with 413, declared or not", async () => {
    const big = JSON.stringify({ answers: { "profile-q-2-others": "a".repeat(MAX_ACTION_BODY_BYTES) } });
    expect((await rejectBadActionBody(post(big)))?.status).toBe(413);
    const declared = post("{}", { "Content-Type": "application/json", "Content-Length": String(MAX_ACTION_BODY_BYTES + 1) });
    expect((await rejectBadActionBody(declared))?.status).toBe(413);
  });

  it("leaves other content types to Astro", async () => {
    expect(await rejectBadActionBody(post("a=1", { "Content-Type": "application/x-www-form-urlencoded" }))).toBeUndefined();
  });
});
