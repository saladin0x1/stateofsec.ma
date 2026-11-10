import type { AstroCookies } from "astro";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { getSessionUserId, SESSION_AUDIENCE, SESSION_COOKIE, startSession } from "@/lib/session";

vi.mock("@/lib/secrets", () => ({ requireSecret: () => "s".repeat(40) }));
const KEY = new TextEncoder().encode("s".repeat(40));

function cookieJar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const cookies = {
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    }
  };
  return { cookies: cookies as unknown as AstroCookies, store };
}

// How tokens were signed before the hotfix: same secret, no audience
async function preHotfixToken(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("5d").sign(KEY);
}

describe("session tokens", () => {
  it("accepts a session it started", async () => {
    const { cookies, store } = cookieJar();
    await startSession(cookies, "respondent-1");
    expect(store.has(SESSION_COOKIE)).toBe(true);
    expect(await getSessionUserId(cookies)).toBe("respondent-1");
  });

  it("refuses a token issued before the hotfix, whatever cookie carries it", async () => {
    const token = await preHotfixToken("attacker-1");
    for (const name of [SESSION_COOKIE, "session", "__Host-session"]) {
      const { cookies } = cookieJar({ [name]: token });
      expect(await getSessionUserId(cookies), name).toBeNull();
    }
  });

  it("refuses a token for another audience", async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("x").setAudience("other").setExpirationTime("5d").sign(KEY);
    const { cookies } = cookieJar({ [SESSION_COOKIE]: token });
    expect(await getSessionUserId(cookies)).toBeNull();
  });

  it("names the audience every new token must carry", () => {
    expect(SESSION_AUDIENCE).toBe("stateofsec-session-v2");
  });
});
