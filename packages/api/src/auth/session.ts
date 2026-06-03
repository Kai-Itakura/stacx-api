import { and, desc, eq, gt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";
import { sessions, userIdentities, users } from "../db/schema";

export type DB = DrizzleD1Database<typeof schema>;

/** Session の絶対有効期限。30 日固定・スライディング延長なし（ADR 0003）。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 認証済みリクエストで c.var.user に載せる User 表示情報。 */
export type AuthUser = {
  /** users.id。業務ロジックが握る不変キー（Identity の id ではない）。 */
  id: string;
  /** 以下 3 つは最新 Identity 由来の表示情報。 */
  email: string | null;
  name: string | null;
  pictureUrl: string | null;
};

/** Session ID を発行する。CSPRNG 32 バイトを hex 化（シード値不要）。 */
export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Session ID から認証ユーザーを引く（認証ミドルウェア用）。
 * Session → User → 最新 Identity を 1 JOIN で取得し、期限切れは弾く。
 * 純 SELECT のみで書き込みはしない（ADR 0003）。
 * 表示情報は updated_at が最大の Identity を採用する（ADR 0002）。
 */
export async function findAuthUser(db: DB, sessionId: string): Promise<AuthUser | null> {
  const rows = await db
    .select({
      id: users.id,
      email: userIdentities.email,
      name: userIdentities.name,
      pictureUrl: userIdentities.pictureUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(userIdentities, eq(userIdentities.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(userIdentities.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

/** Session を削除する（ログアウト用）。 */
export async function deleteSession(db: DB, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
