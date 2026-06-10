import { and, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import type { DB } from "../auth/session";
import { type Memo, memos, memoTags, projects, tags } from "../db/schema";
import type { CreateMemoInput, UpdateMemoInput } from "./request-schema";

/** メモ + 紐づくタグ ID（API のレスポンス形）。 */
export type MemoView = Memo & { tagIds: string[] };

export type CreateMemoResult =
  | { ok: true; memo: MemoView }
  | { ok: false; reason: "project_not_found" | "tag_not_found" };

export type UpdateMemoResult =
  | { ok: true; memo: MemoView }
  | { ok: false; reason: "not_found" | "tag_not_found" };

/** 呼び出し User が当該 Project を所有しているか。 */
async function ownsProject(db: DB, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** tagIds がすべて呼び出し User 所有のタグか（重複は除いて判定）。 */
async function ownsAllTags(db: DB, userId: string, tagIds: string[]): Promise<boolean> {
  if (tagIds.length === 0) return true;
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
  return owned.length === tagIds.length;
}

/**
 * メモを作成する。Project は所有必須、tagIds も所有必須（暗黙作成しない）。
 * memo + memo_tags は db.batch で原子化する（ADR 0004）。入力は branded type。
 */
export async function createMemo(
  db: DB,
  userId: string,
  input: CreateMemoInput,
): Promise<CreateMemoResult> {
  if (!(await ownsProject(db, userId, input.projectId))) {
    return { ok: false, reason: "project_not_found" };
  }
  const tagIds = [...new Set(input.tagIds)];
  if (!(await ownsAllTags(db, userId, tagIds))) {
    return { ok: false, reason: "tag_not_found" };
  }

  const now = new Date();
  const id = ulid();
  const row = {
    id,
    userId,
    projectId: input.projectId,
    title: input.title,
    body: input.body,
    createdAt: now,
    updatedAt: now,
  };

  if (tagIds.length === 0) {
    await db.insert(memos).values(row);
  } else {
    await db.batch([
      db.insert(memos).values(row),
      db.insert(memoTags).values(tagIds.map((tagId) => ({ memoId: id, tagId }))),
    ]);
  }
  return { ok: true, memo: { ...row, tagIds } };
}

/** 呼び出し User のメモを作成日の新しい順で返す。projectId 指定で絞り込み。 */
export async function listMemos(
  db: DB,
  userId: string,
  filter?: { projectId?: string },
): Promise<MemoView[]> {
  const rows = await db.query.memos.findMany({
    where: (m, { and: a, eq: e }) =>
      filter?.projectId
        ? a(e(m.userId, userId), e(m.projectId, filter.projectId))
        : e(m.userId, userId),
    orderBy: (m, { desc: d }) => [d(m.createdAt)],
    with: { memoTags: { columns: { tagId: true } } },
  });
  return rows.map(({ memoTags: mt, ...memo }) => ({ ...memo, tagIds: mt.map((x) => x.tagId) }));
}

/** 呼び出し User のメモを 1 件、tagIds 込みで取得する。所有していなければ null。 */
export async function getMemo(db: DB, userId: string, id: string): Promise<MemoView | null> {
  const row = await db.query.memos.findFirst({
    where: (m, { and: a, eq: e }) => a(e(m.id, id), e(m.userId, userId)),
    with: { memoTags: { columns: { tagId: true } } },
  });
  if (!row) return null;
  const { memoTags: mt, ...memo } = row;
  return { ...memo, tagIds: mt.map((x) => x.tagId) };
}

/**
 * 呼び出し User のメモを更新する。所有していなければ not_found。
 * tagIds が present ならタグ集合を完全置換（全 tagId は所有必須）、absent なら変更しない。
 * 書き込みは db.batch で原子化する。
 */
export async function updateMemo(
  db: DB,
  userId: string,
  id: string,
  input: UpdateMemoInput,
): Promise<UpdateMemoResult> {
  const existing = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
    .limit(1);
  if (!existing[0]) return { ok: false, reason: "not_found" };

  const set: Partial<Pick<Memo, "title" | "body">> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) set.title = input.title;
  if (input.body !== undefined) set.body = input.body;

  const own = and(eq(memos.id, id), eq(memos.userId, userId));

  if (input.tagIds === undefined) {
    await db.update(memos).set(set).where(own);
  } else {
    const tagIds = [...new Set(input.tagIds)];
    if (!(await ownsAllTags(db, userId, tagIds))) {
      return { ok: false, reason: "tag_not_found" };
    }
    if (tagIds.length === 0) {
      await db.batch([
        db.update(memos).set(set).where(own),
        db.delete(memoTags).where(eq(memoTags.memoId, id)),
      ]);
    } else {
      await db.batch([
        db.update(memos).set(set).where(own),
        db.delete(memoTags).where(eq(memoTags.memoId, id)),
        db.insert(memoTags).values(tagIds.map((tagId) => ({ memoId: id, tagId }))),
      ]);
    }
  }

  const memo = await getMemo(db, userId, id);
  return { ok: true, memo: memo as MemoView };
}

/** 呼び出し User のメモを削除する。memo_tags は FK cascade で掃除される。 */
export async function deleteMemo(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(memos)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
    .returning({ id: memos.id });
  return rows.length > 0;
}
