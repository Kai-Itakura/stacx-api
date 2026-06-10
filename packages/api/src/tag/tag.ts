import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { DB } from "../auth/session";
import { type Tag, tags } from "../db/schema";
import type { CreateTagInput } from "./request-schema";

/** タグ作成の結果。同名既存なら作成せず duplicate を返す（暗黙作成しない）。 */
export type CreateTagResult = { ok: true; tag: Tag } | { ok: false; reason: "duplicate" };

/** SQLite の UNIQUE 制約違反か。D1 はエラーをラップすることがあるため cause も辿る。 */
function isUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.message.includes("UNIQUE constraint failed") || isUniqueViolation(e.cause);
}

/**
 * タグを明示的に作成する。`(userId, name)` で一意。
 * 入力は branded type で、request schema の検証を通した値しか受け付けない。
 * 事前 SELECT は持たず、INSERT の UNIQUE 制約違反を duplicate に写像する
 * （SELECT→INSERT 間の競合で 500 になる窓をなくす）。
 */
export async function createTag(
  db: DB,
  userId: string,
  input: CreateTagInput,
): Promise<CreateTagResult> {
  try {
    const rows = await db
      .insert(tags)
      .values({ id: ulid(), userId, name: input.name, createdAt: new Date() })
      .returning();
    return { ok: true, tag: rows[0] as Tag };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "duplicate" };
    throw e;
  }
}

/** 呼び出し User のタグを name 昇順で返す（メモ作成時の選択候補に使う）。 */
export async function listTags(db: DB, userId: string): Promise<Tag[]> {
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name));
}

/**
 * 呼び出し User が所有するタグを削除する。削除できたら true、
 * 対象が無い／他人のタグなら false。memo_tags は FK cascade で掃除される。
 */
export async function deleteTag(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning({ id: tags.id });
  return rows.length > 0;
}
