import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { loginWithIdentity } from "../../src/auth/account";
import type { IdentityProfile } from "../../src/auth/providers/types";
import * as schema from "../../src/db/schema";
import { sessions, userIdentities, users } from "../../src/db/schema";

const db = drizzle(env.DB, { schema });

const profile: IdentityProfile = {
  provider: "google",
  providerSub: "sub-1",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
  pictureUrl: null,
};
const meta = { userAgent: "test-agent", ipAddress: "1.2.3.4" };

describe("loginWithIdentity", () => {
  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(userIdentities);
    await db.delete(users);
  });

  it("新規ユーザーは users / user_identities / sessions を作成する", async () => {
    const issued = await loginWithIdentity(db, profile, meta);

    const u = await db.select().from(users);
    const i = await db.select().from(userIdentities);
    const s = await db.select().from(sessions);

    expect(u).toHaveLength(1);
    expect(i).toHaveLength(1);
    expect(i[0]?.providerSub).toBe("sub-1");
    expect(i[0]?.userId).toBe(u[0]?.id);
    expect(s).toHaveLength(1);
    expect(s[0]?.id).toBe(issued.id);
    expect(s[0]?.userId).toBe(u[0]?.id);
    expect(s[0]?.userAgent).toBe("test-agent");
  });

  it("既存 Identity は表示情報をリフレッシュし、User を増やさず Session を追加する", async () => {
    await loginWithIdentity(db, profile, meta);
    await loginWithIdentity(db, { ...profile, name: "Alice v2" }, meta);

    const u = await db.select().from(users);
    const i = await db.select().from(userIdentities);
    const s = await db.select().from(sessions);

    expect(u).toHaveLength(1); // 同一 Identity なので User は増えない
    expect(i).toHaveLength(1);
    expect(i[0]?.name).toBe("Alice v2"); // リフレッシュされる
    expect(s).toHaveLength(2); // 前回 Session は期限内なので残り、2 本になる
  });
});
