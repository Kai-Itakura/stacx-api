import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { loginWithIdentity } from "../../src/auth/account";
import { sessionCookieName } from "../../src/auth/cookie";
import type { IdentityProfile } from "../../src/auth/providers/types";
import * as schema from "../../src/db/schema";
import { sessions, userIdentities, users } from "../../src/db/schema";

const BASE = "https://example.com";
const db = drizzle(env.DB, { schema });
const cookieName = sessionCookieName(env.APP_BASE_URL);

const profile: IdentityProfile = {
  provider: "google",
  providerSub: "sub-1",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
  pictureUrl: null,
};
const meta = { userAgent: null, ipAddress: null };

/** ログイン済み状態を作り、その Session Cookie ヘッダを返す。 */
async function loggedInCookie(): Promise<string> {
  const issued = await loginWithIdentity(db, profile, meta);
  return `${cookieName}=${issued.id}`;
}

describe("routes", () => {
  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(userIdentities);
    await db.delete(users);
  });

  it("GET /api/health → 200", async () => {
    const res = await SELF.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET /api/me 未認証 → 401", async () => {
    const res = await SELF.fetch(`${BASE}/api/me`);
    expect(res.status).toBe(401);
  });

  it("GET /api/me 有効セッション → 200 + user", async () => {
    const cookie = await loggedInCookie();
    const res = await SELF.fetch(`${BASE}/api/me`, { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: expect.objectContaining({ email: "alice@example.com", name: "Alice" }),
    });
  });

  it("GET /api/auth/login/google → 302 で Google へ、一時 Cookie を発行", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/login/google`, { redirect: "manual" });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");

    // getSetCookie は実行時に存在するが workers-types の Headers 型に未定義のためキャスト。
    const cookies = (res.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
    expect(cookies.some((c) => c.startsWith("oauth_state="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("oauth_code_verifier="))).toBe(true);
    // oauth_provider は持たない（provider はパス由来）。
    expect(cookies.some((c) => c.startsWith("oauth_provider="))).toBe(false);
  });

  it("GET /api/auth/login/unknown → 404", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/login/unknown`, { redirect: "manual" });
    expect(res.status).toBe(404);
  });

  it("GET /api/auth/callback/google state 不一致 → /login?error= へ 302", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/callback/google?code=x&state=y`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?error=state_mismatch");
  });

  it("POST /api/auth/logout → Session を削除して 302", async () => {
    const cookie = await loggedInCookie();
    const sessionId = cookie.split("=")[1];

    const res = await SELF.fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId ?? ""));
    expect(remaining).toHaveLength(0);
  });
});
