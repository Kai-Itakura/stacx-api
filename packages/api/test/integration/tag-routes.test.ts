import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { loginWithIdentity } from "../../src/auth/account";
import { sessionCookieName } from "../../src/auth/cookie";
import type { IdentityProfile } from "../../src/auth/providers/types";
import * as schema from "../../src/db/schema";
import { sessions, tags, userIdentities, users } from "../../src/db/schema";

const BASE = "https://example.com";
const db = drizzle(env.DB, { schema });
const cookieName = sessionCookieName(env.APP_BASE_URL);
const meta = { userAgent: null, ipAddress: null };

function profile(sub: string): IdentityProfile {
  return {
    provider: "google",
    providerSub: sub,
    email: `${sub}@example.com`,
    emailVerified: true,
    name: sub,
    pictureUrl: null,
  };
}

/** sub ごとにログイン済み状態を作り、その Cookie ヘッダを返す。 */
async function loginAs(sub: string): Promise<string> {
  const issued = await loginWithIdentity(db, profile(sub), meta);
  return `${cookieName}=${issued.id}`;
}

async function postTag(cookie: string, body: unknown) {
  return SELF.fetch(`${BASE}/api/tags`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("tag routes", () => {
  beforeEach(async () => {
    await db.delete(tags);
    await db.delete(sessions);
    await db.delete(userIdentities);
    await db.delete(users);
  });

  it("POST /api/tags 未認証 → 401", async () => {
    const res = await SELF.fetch(`${BASE}/api/tags`, {
      method: "POST",
      body: JSON.stringify({ name: "トラブル" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST 有効 → 201 で作成したタグを返す", async () => {
    const cookie = await loginAs("alice");
    const res = await postTag(cookie, { name: "トラブル" });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { tag: { id: string; name: string } };
    expect(json.tag.name).toBe("トラブル");
  });

  it("POST name 空 → 400", async () => {
    const cookie = await loginAs("alice");
    expect((await postTag(cookie, { name: "   " })).status).toBe(400);
    expect((await postTag(cookie, {})).status).toBe(400);
  });

  it("POST 同名重複 → 409", async () => {
    const cookie = await loginAs("alice");
    await postTag(cookie, { name: "トラブル" });

    expect((await postTag(cookie, { name: "トラブル" })).status).toBe(409);
  });

  it("GET /api/tags は自分のタグだけを返す", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    await postTag(alice, { name: "aliceの" });
    await postTag(bob, { name: "bobの" });

    const res = await SELF.fetch(`${BASE}/api/tags`, { headers: { cookie: alice } });
    const json = (await res.json()) as { tags: { name: string }[] };
    expect(json.tags).toHaveLength(1);
    expect(json.tags[0]?.name).toBe("aliceの");
  });

  it("DELETE 自分のタグ → 204、他人のタグ → 404", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const created = (await (await postTag(alice, { name: "トラブル" })).json()) as {
      tag: { id: string };
    };
    const url = `${BASE}/api/tags/${created.tag.id}`;

    expect((await SELF.fetch(url, { method: "DELETE", headers: { cookie: bob } })).status).toBe(
      404,
    );
    expect((await SELF.fetch(url, { method: "DELETE", headers: { cookie: alice } })).status).toBe(
      204,
    );
  });
});
