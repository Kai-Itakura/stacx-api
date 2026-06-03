import { and, eq, lt } from "drizzle-orm";
import { ulid } from "ulid";
import { sessions, userIdentities, users } from "../db/schema";
import type { IdentityProfile } from "./providers/types";
import { type DB, SESSION_TTL_MS, generateSessionId } from "./session";

/** Session 行に残すリクエストメタ情報。 */
export type SessionMeta = {
  userAgent: string | null;
  ipAddress: string | null;
};

/** 発行された Session（Cookie 設定に使う）。 */
export type IssuedSession = {
  id: string;
  expiresAt: Date;
};

/**
 * IdentityProfile でログインし、Session を発行する。
 *
 * - 既存 Identity ヒット: 表示情報をリフレッシュ + last_login 更新
 *   + 期限切れ Session を掃除 + 新規 Session を発行
 * - 未ヒット（新規）: User + Identity + Session を作成
 *
 * いずれの分岐も書き込みは db.batch で原子化する（ADR 0004）。
 * 事前 SELECT は新規/既存の判定ヒントにすぎず、一意性の最終保証は
 * user_identities の UNIQUE(provider, provider_sub) に置く。
 */
export async function loginWithIdentity(
  db: DB,
  profile: IdentityProfile,
  meta: SessionMeta,
): Promise<IssuedSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const sessionId = generateSessionId();
  const newSession = {
    id: sessionId,
    expiresAt,
    createdAt: now,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  };

  const matchIdentity = and(
    eq(userIdentities.provider, profile.provider),
    eq(userIdentities.providerSub, profile.providerSub),
  );

  const existing = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(matchIdentity)
    .limit(1);

  if (existing[0]) {
    const userId = existing[0].userId;
    await db.batch([
      db
        .update(userIdentities)
        .set({
          email: profile.email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          pictureUrl: profile.pictureUrl,
          updatedAt: now,
        })
        .where(matchIdentity),
      db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, userId)),
      // 書き込みが起きるこの機会に当該 User の期限切れ Session を掃除する（方針 B）。
      db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now))),
      db.insert(sessions).values({ ...newSession, userId }),
    ]);
    return { id: sessionId, expiresAt };
  }

  const userId = ulid();
  await db.batch([
    db.insert(users).values({ id: userId, createdAt: now, updatedAt: now, lastLoginAt: now }),
    db.insert(userIdentities).values({
      id: ulid(),
      userId,
      provider: profile.provider,
      providerSub: profile.providerSub,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
      pictureUrl: profile.pictureUrl,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(sessions).values({ ...newSession, userId }),
  ]);
  return { id: sessionId, expiresAt };
}
