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

async function seedTag(userId: string, name: string): Promise<string> {
  const id = ulid();
  await db.insert(tags).values({ id, userId, name, createdAt: new Date() });
  return id;
}

/** fixture 用のメモを直接生成して id を返す（検証対象のルートを経由しない）。 */
async function seedMemo(
  userId: string,
  projectId: string,
  opts: { title?: string; body?: string; tagIds?: string[] } = {},
): Promise<string> {
  const id = ulid();
  const now = new Date();
  await db.insert(memos).values({
    id,
    userId,
    projectId,
    title: opts.title ?? "メモ",
    body: opts.body ?? "本文",
    createdAt: now,
    updatedAt: now,
  });
  if (opts.tagIds?.length) {
    await db.insert(memoTags).values(opts.tagIds.map((tagId) => ({ memoId: id, tagId })));
  }
  return id;
}

/** POST ルート自体を検証するためのリクエスト。fixture 作成には使わない（seedMemo を使う）。 */
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
    await seedMemo(userId, pa, { title: "a1" });
    await seedMemo(userId, pb, { title: "b1" });
    await seedMemo(bob.userId, await seedProject(bob.userId), { title: "他人" });

    const all = (await (await SELF.fetch(`${BASE}/api/memos`, { headers: { cookie } })).json()) as {
      memos: { title: string }[];
    };
    expect(all.memos.map((m) => m.title).sort()).toEqual(["a1", "b1"]);

    const filtered = (await (
      await SELF.fetch(`${BASE}/api/memos?projectId=${pa}`, { headers: { cookie } })
    ).json()) as { memos: { title: string }[] };
    expect(filtered.memos.map((m) => m.title)).toEqual(["a1"]);
  });

  it("GET /:id 自分のメモは 200 で tagIds 込みで返す", async () => {
    const { cookie, userId } = await loginAs("alice");
    const t = await seedTag(userId, "トラブル");
    const id = await seedMemo(userId, await seedProject(userId), { title: "学び", tagIds: [t] });

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, { headers: { cookie } });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { memo: { id: string; title: string; tagIds: string[] } };
    expect(json.memo.id).toBe(id);
    expect(json.memo.tagIds).toEqual([t]);
  });

  it("GET /:id 他人のメモは 404", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const id = await seedMemo(alice.userId, await seedProject(alice.userId));

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, { headers: { cookie: bob.cookie } });

    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual({ error: "not_found" });
  });

  it("DELETE /:id 自分のメモは 204", async () => {
    const { cookie, userId } = await loginAs("alice");
    const id = await seedMemo(userId, await seedProject(userId));

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });

    expect(res.status).toBe(204);
    expect(await db.select().from(memos).where(eq(memos.id, id))).toHaveLength(0);
  });

  it("DELETE /:id 他人のメモは 404 で、メモは削除されない", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const id = await seedMemo(alice.userId, await seedProject(alice.userId));

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, {
      method: "DELETE",
      headers: { cookie: bob.cookie },
    });

    expect(res.status).toBe(404);
    expect(await db.select().from(memos).where(eq(memos.id, id))).toHaveLength(1);
  });

  it("PUT /:id で title 更新 → 200", async () => {
    const { cookie, userId } = await loginAs("alice");
    const id = await seedMemo(userId, await seedProject(userId), { title: "旧" });

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "新" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { memo: { title: string } }).memo.title).toBe("新");
  });

  it("PUT /:id は他人のメモだと 404 not_found", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const id = await seedMemo(alice.userId, await seedProject(alice.userId));

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, {
      method: "PUT",
      headers: { cookie: bob.cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "乗っ取り" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual({ error: "not_found" });
  });

  it("PUT /:id は他人の tagId だと 400 tag_not_found", async () => {
    const alice = await loginAs("alice");
    const bob = await loginAs("bob");
    const myTag = await seedTag(alice.userId, "自分のタグ");
    const foreignTag = await seedTag(bob.userId, "他人のタグ");
    const id = await seedMemo(alice.userId, await seedProject(alice.userId), { tagIds: [myTag] });

    const res = await SELF.fetch(`${BASE}/api/memos/${id}`, {
      method: "PUT",
      headers: { cookie: alice.cookie, "content-type": "application/json" },
      body: JSON.stringify({ tagIds: [myTag, foreignTag] }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toStrictEqual({ error: "tag_not_found" });
  });
});
