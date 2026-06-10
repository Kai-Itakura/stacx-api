import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";
import { loginWithIdentity } from "../../src/auth/account";
import { sessionCookieName } from "../../src/auth/cookie";
import type { IdentityProfile } from "../../src/auth/providers/types";
import * as schema from "../../src/db/schema";
import {
  memos,
  memoTags,
  projects,
  sessions,
  tags,
  userIdentities,
  users,
} from "../../src/db/schema";

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

/** ログインして Cookie と userId を返す。 */
async function loginAs(sub: string): Promise<{ cookie: string; userId: string }> {
  const issued = await loginWithIdentity(db, profile(sub), meta);
  const [identity] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(eq(userIdentities.providerSub, sub));
  return { cookie: `${cookieName}=${issued.id}`, userId: identity?.userId ?? "" };
}

async function seedProject(userId: string): Promise<string> {
  const id = ulid();
  const now = new Date();
  await db
    .insert(projects)
    .values({ id, userId, name: "案件", startDate: now, createdAt: now, updatedAt: now });
  return id;
}

async function postMemo(cookie: string, body: unknown) {
  return SELF.fetch(`${BASE}/api/memos`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("memo routes", () => {
  beforeEach(async () => {
    await db.delete(memoTags);
    await db.delete(memos);
    await db.delete(tags);
    await db.delete(projects);
    await db.delete(sessions);
    await db.delete(userIdentities);
    await db.delete(users);
  });

  it("POST /api/memos 未認証 → 401", async () => {
    const res = await SELF.fetch(`${BASE}/api/memos`, {
      method: "POST",
      body: JSON.stringify({ projectId: "x", title: "t", body: "b" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST 有効 → 201 でメモを返す", async () => {
    const { cookie, userId } = await loginAs("alice");
    const projectId = await seedProject(userId);

    const res = await postMemo(cookie, { projectId, title: "学び", body: "本文" });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { memo: { title: string; tagIds: string[] } };
    expect(json.memo.title).toBe("学び");
    expect(json.memo.tagIds).toEqual([]);
  });

  it("POST title 空 → 400（schema 検証）", async () => {
    const { cookie, userId } = await loginAs("alice");
    const projectId = await seedProject(userId);
    expect((await postMemo(cookie, { projectId, title: "  ", body: "b" })).status).toBe(400);
  });

  it("POST 他人の projectId → 400 project_not_found", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const bobsProject = await seedProject(bob.userId);

    const res = await postMemo(alice.cookie, { projectId: bobsProject, title: "t", body: "b" });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "project_not_found" });
  });

  it("GET /api/memos は自分のメモだけ。?projectId= で絞り込み", async () => {
    const { cookie, userId } = await loginAs("alice");
    const bob = await loginAs("bob");
    const pa = await seedProject(userId);
    const pb = await seedProject(userId);
    await postMemo(cookie, { projectId: pa, title: "a1", body: "b" });
    await postMemo(cookie, { projectId: pb, title: "b1", body: "b" });
    await postMemo(bob.cookie, {
      projectId: await seedProject(bob.userId),
      title: "他人",
      body: "b",
    });

    const all = (await (await SELF.fetch(`${BASE}/api/memos`, { headers: { cookie } })).json()) as {
      memos: { title: string }[];
    };
    expect(all.memos.map((m) => m.title).sort()).toEqual(["a1", "b1"]);

    const filtered = (await (
      await SELF.fetch(`${BASE}/api/memos?projectId=${pa}`, { headers: { cookie } })
    ).json()) as { memos: { title: string }[] };
    expect(filtered.memos.map((m) => m.title)).toEqual(["a1"]);
  });

  it("GET/DELETE /:id は他人のメモだと 404", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const created = (await (
      await postMemo(alice.cookie, {
        projectId: await seedProject(alice.userId),
        title: "t",
        body: "b",
      })
    ).json()) as { memo: { id: string } };
    const url = `${BASE}/api/memos/${created.memo.id}`;

    expect((await SELF.fetch(url, { headers: { cookie: bob.cookie } })).status).toBe(404);
    expect(
      (await SELF.fetch(url, { method: "DELETE", headers: { cookie: bob.cookie } })).status,
    ).toBe(404);
    expect(
      (await SELF.fetch(url, { method: "DELETE", headers: { cookie: alice.cookie } })).status,
    ).toBe(204);
  });

  it("PUT /:id で title 更新", async () => {
    const { cookie, userId } = await loginAs("alice");
    const created = (await (
      await postMemo(cookie, { projectId: await seedProject(userId), title: "旧", body: "b" })
    ).json()) as { memo: { id: string } };

    const res = await SELF.fetch(`${BASE}/api/memos/${created.memo.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "新" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { memo: { title: string } }).memo.title).toBe("新");
  });
});
