import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTCHA_TOKEN_FORMAT, claimCaptchaToken } from "@/lib/captcha";

vi.mock("@/lib/firebase/server", () => ({
  getAccessToken: async () => "test-token",
  getProjectId: () => "test-project"
}));

// An in-memory stand-in for Firestore's createDocument: 409 when the id already exists
function fakeCreate() {
  const ids = new Set<string>();
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const id = url.searchParams.get("documentId")!;
    calls.push(url.pathname);
    if (ids.has(id))
      return new Response(JSON.stringify({ error: { code: 409, status: "ALREADY_EXISTS" } }), { status: 409 });
    ids.add(id);
    return new Response("{}", { status: 200 });
  });
  return { fetch, ids, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claimCaptchaToken", () => {
  it("accepts a token once, then refuses it", async () => {
    const firestore = fakeCreate();
    vi.stubGlobal("fetch", firestore.fetch);
    expect(await claimCaptchaToken("token-a")).toBe(true);
    expect(await claimCaptchaToken("token-a")).toBe(false);
    expect(await claimCaptchaToken("token-b")).toBe(true);
  });

  it("lets exactly one of many parallel uses through", async () => {
    const firestore = fakeCreate();
    vi.stubGlobal("fetch", firestore.fetch);
    const results = await Promise.all(Array.from({ length: 23 }, async () => claimCaptchaToken("same-token")));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("stores a hash, never the token itself", async () => {
    const firestore = fakeCreate();
    vi.stubGlobal("fetch", firestore.fetch);
    await claimCaptchaToken("secret-token-value");
    const [id] = firestore.ids;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(firestore.calls[0]).toContain("/documents/captcha_tokens");
  });

  it("fails loudly when Firestore errors, so the session is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(claimCaptchaToken("token")).rejects.toThrow("Firestore create failed");
  });

  it("treats a 409 that is not ALREADY_EXISTS (contention) as an error, not a reused token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 409, status: "ABORTED" } }), { status: 409 })));
    await expect(claimCaptchaToken("token")).rejects.toThrow("Firestore create failed");
  });
});

describe("captcha token format", () => {
  it("accepts token-shaped strings, including Cloudflare's test token", () => {
    for (const token of ["XXXX.DUMMY.TOKEN.XXXX", "0.abc-DEF_123.xyz", "0.QUJD+/=:e30"])
      expect(CAPTCHA_TOKEN_FORMAT.test(token), token).toBe(true);
  });

  it("refuses padded or re-encoded copies of a token", () => {
    for (const token of [" 0.abc", "0.abc ", "0.abc\n", "0.a%62c", "0.abc\u0000", `0.abc${String.fromCharCode(0x200B)}`, "0.ab c", ""])
      expect(CAPTCHA_TOKEN_FORMAT.test(token), JSON.stringify(token)).toBe(false);
  });
});
