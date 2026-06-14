import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import { assert, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { memos, memoTags, projects, tags, users } from "../../src/db/schema";
import { createMemo, deleteMemo, getMemo, listMemos, updateMemo } from "../../src/memo/memo";
import { createMemoSchema, updateMemoSchema } from "../../src/memo/request-schema";

const db = drizzle(env.DB, { schema });

async function seedUser(): Promise<string> {
  const id = ulid();
  const now = new Date();
  await db.insert(users).values({ id, createdAt: now, updatedAt: now, lastLoginAt: now });
  return id;
}

async function seedProject(userId: string, name = "案件"): Promise<string> {
  const id = ulid();
  const now = new Date();
  await db
    .insert(projects)
    .values({ id, userId, name, startDate: now, createdAt: now, updatedAt: now });
  return id;
}

async function seedTag(userId: string, name: string): Promise<string> {
  const id = ulid();
  await db.insert(tags).values({ id, userId, name, createdAt: new Date() });
  return id;
}

const createInput = (o: { projectId: string; title?: string; body?: string; tagIds?: string[] }) =>
  createMemoSchema.parse({ title: "タイトル", body: "本文", ...o });

const updateInput = (o: { title?: string; body?: string; tagIds?: string[] }) =>
  updateMemoSchema.parse(o);

async function resetAll() {
  await db.delete(memoTags);
  await db.delete(memos);
  await db.delete(tags);
  await db.delete(projects);
  await db.delete(users);
}

describe("createMemo", () => {
  beforeEach(resetAll);

  it("title/body/projectId/userId/タイムスタンプを採番し、tagIds で memo_tags を張る", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const t1 = await seedTag(userId, "トラブル");
    const t2 = await seedTag(userId, "改善");

    const result = await createMemo(db, userId, createInput({ projectId, tagIds: [t1, t2] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memo.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(result.memo.userId).toBe(userId);
      expect(result.memo.projectId).toBe(projectId);
      expect(result.memo.tagIds.sort()).toEqual([t1, t2].sort());
    }
    expect(await db.select().from(memos)).toHaveLength(1);
    expect(await db.select().from(memoTags)).toHaveLength(2);
  });

  it("他人の（存在しない）Project には作れない → project_not_found", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const othersProject = await seedProject(other);

    const result = await createMemo(db, me, createInput({ projectId: othersProject }));

    expect(result).toEqual({ ok: false, reason: "project_not_found" });
    expect(await db.select().from(memos)).toHaveLength(0);
  });

  it("自分の所有でない tagId が混じると → tag_not_found（何も作らない）", async () => {
    const me = await seedUser();
    const projectId = await seedProject(me);
    const mine = await seedTag(me, "自分");
    const other = await seedUser();
    const foreign = await seedTag(other, "他人");

    const result = await createMemo(db, me, createInput({ projectId, tagIds: [mine, foreign] }));

    expect(result).toEqual({ ok: false, reason: "tag_not_found" });
    expect(await db.select().from(memos)).toHaveLength(0);
    expect(await db.select().from(memoTags)).toHaveLength(0);
  });
});

describe("listMemos / getMemo", () => {
  beforeEach(resetAll);

  it("自分のメモだけを作成日の新しい順で返す", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const p = await seedProject(me);
    const r1 = await createMemo(db, me, createInput({ projectId: p, title: "古い" }));
    const r2 = await createMemo(db, me, createInput({ projectId: p, title: "新しい" }));
    await createMemo(
      db,
      other,
      createInput({ projectId: await seedProject(other), title: "他人" }),
    );
    // createdAt を明示的にずらして順序を決定的にする
    if (r1.ok)
      await db
        .update(memos)
        .set({ createdAt: new Date(1000) })
        .where(eq(memos.id, r1.memo.id));
    if (r2.ok)
      await db
        .update(memos)
        .set({ createdAt: new Date(2000) })
        .where(eq(memos.id, r2.memo.id));

    const list = await listMemos(db, me);

    expect(list.map((m) => m.title)).toEqual(["新しい", "古い"]);
  });

  it("projectId で絞り込める", async () => {
    const me = await seedUser();
    const pa = await seedProject(me, "A");
    const pb = await seedProject(me, "B");
    await createMemo(db, me, createInput({ projectId: pa, title: "a1" }));
    await createMemo(db, me, createInput({ projectId: pb, title: "b1" }));

    const list = await listMemos(db, me, { projectId: pa });

    expect(list.map((m) => m.title)).toEqual(["a1"]);
  });

  it("getMemo は自分のメモを tagIds 込みで返し、他人のは null", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const p = await seedProject(me);
    const t = await seedTag(me, "トラブル");
    const created = await createMemo(db, me, createInput({ projectId: p, tagIds: [t] }));
    const id = created.ok ? created.memo.id : "";

    const got = await getMemo(db, me, id);
    expect(got?.tagIds).toEqual([t]);
    expect(await getMemo(db, other, id)).toBeNull();
  });
});

describe("updateMemo", () => {
  beforeEach(resetAll);

  it("title/body を更新し、tagIds present でタグ集合を置換する", async () => {
    const me = await seedUser();
    const p = await seedProject(me);
    const t1 = await seedTag(me, "旧");
    const t2 = await seedTag(me, "新");
    const created = await createMemo(db, me, createInput({ projectId: p, tagIds: [t1] }));
    const id = created.ok ? created.memo.id : "";

    const result = await updateMemo(db, me, id, updateInput({ title: "改名", tagIds: [t2] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memo.title).toBe("改名");
      expect(result.memo.tagIds).toEqual([t2]); // t1 は外れ t2 に置換
    }
  });

  it("tagIds 未指定なら タグは変更しない", async () => {
    const me = await seedUser();
    const p = await seedProject(me);
    const t1 = await seedTag(me, "維持");
    const created = await createMemo(db, me, createInput({ projectId: p, tagIds: [t1] }));
    const id = created.ok ? created.memo.id : "";

    await updateMemo(db, me, id, updateInput({ body: "本文だけ更新" }));

    expect((await getMemo(db, me, id))?.tagIds).toEqual([t1]);
  });

  it("tagIds が０個なら タグはすべて外れる", async () => {
    const me = await seedUser();
    const p = await seedProject(me);
    const t1 = await seedTag(me, "この後外れる1");
    const t2 = await seedTag(me, "この後外れる2");
    const created = await createMemo(db, me, createInput({ projectId: p, tagIds: [t1, t2] }));
    assert(created.ok, "メモのシード作成失敗");

    const updated = await updateMemo(db, me, created.memo.id, updateInput({ tagIds: [] }));

    assert.isTrue(updated.ok);
    expect((await getMemo(db, me, updated.memo.id))?.tagIds).toEqual([]);
  });

  it("userが所有していないtagは指定できない", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const project = await seedProject(me, "dummy project1");
    const myTag = await seedTag(me, "dummy tag1");
    const ohtersTag = await seedTag(other, "dummy tag2");
    const created = await createMemo(
      db,
      me,
      createInput({
        projectId: project,
        title: "dummy title",
        body: "dummy memo",
        tagIds: [myTag],
      }),
    );
    assert(created.ok, "メモのシード作成失敗");

    expect(
      await updateMemo(
        db,
        me,
        created.memo.id,
        updateInput({
          title: "dummy title",
          body: "dummy memo",
          tagIds: [myTag, ohtersTag],
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "tag_not_found",
    });
  });

  it("他人のメモは not_found", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const created = await createMemo(
      db,
      other,
      createInput({ projectId: await seedProject(other) }),
    );
    const id = created.ok ? created.memo.id : "";

    expect(await updateMemo(db, me, id, updateInput({ title: "乗っ取り" }))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("deleteMemo", () => {
  beforeEach(resetAll);

  it("自分のメモを削除して true、memo_tags も消える", async () => {
    const me = await seedUser();
    const p = await seedProject(me);
    const t = await seedTag(me, "トラブル");
    const created = await createMemo(db, me, createInput({ projectId: p, tagIds: [t] }));
    const id = created.ok ? created.memo.id : "";

    expect(await deleteMemo(db, me, id)).toBe(true);
    expect(await db.select().from(memos)).toHaveLength(0);
    expect(await db.select().from(memoTags)).toHaveLength(0);
  });

  it("他人のメモは削除せず false", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const created = await createMemo(
      db,
      other,
      createInput({ projectId: await seedProject(other) }),
    );
    const id = created.ok ? created.memo.id : "";

    expect(await deleteMemo(db, me, id)).toBe(false);
    expect(await db.select().from(memos)).toHaveLength(1);
  });
});
