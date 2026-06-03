import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { loginWithIdentity } from "../../src/auth/account";
import type { IdentityProfile } from "../../src/auth/providers/types";
import { findAuthUser } from "../../src/auth/session";
import * as schema from "../../src/db/schema";
import { sessions, userIdentities, users } from "../../src/db/schema";

const db = drizzle(env.DB, { schema });

const profile: IdentityProfile = {
  provider: "google",
  providerSub: "sub-1",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
  pictureUrl: "https://pic.example/a.png",
};
const meta = { userAgent: null, ipAddress: null };

describe("findAuthUser", () => {
  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(userIdentities);
    await db.delete(users);
  });

  it("有効な Session から最新 Identity の表示情報込みで User を返す", async () => {
    const issued = await loginWithIdentity(db, profile, meta);

    const user = await findAuthUser(db, issued.id);

    expect(user).not.toBeNull();
    expect(user?.email).toBe("alice@example.com");
    expect(user?.name).toBe("Alice");
    expect(user?.pictureUrl).toBe("https://pic.example/a.png");
  });

  it("存在しない Session は null", async () => {
    expect(await findAuthUser(db, "deadbeef")).toBeNull();
  });

  it("期限切れ Session は null", async () => {
    const issued = await loginWithIdentity(db, profile, meta);
    // 有効期限を過去にして無効化する。
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, issued.id));

    expect(await findAuthUser(db, issued.id)).toBeNull();
  });
});
