import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { projects, users } from "../../src/db/schema";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../../src/project/project";
import { createProjectSchema, updateProjectSchema } from "../../src/project/request-schema";

const db = drizzle(env.DB, { schema });

/** テスト用に User 行を 1 つ作って id を返す。 */
async function seedUser(): Promise<string> {
  const id = ulid();
  const now = new Date();
  await db.insert(users).values({ id, createdAt: now, updatedAt: now, lastLoginAt: now });
  return id;
}

const base = {
  name: "決済基盤リプレイス",
  startDate: new Date("2024-01-01"),
  summary: "レガシー決済の刷新",
  teamSize: 5,
  role: "バックエンドリード",
  workStyle: "受託",
};

/** branded な入力。ドメインは検証を通した値しか受け取らないので schema 経由で作る。 */
const createInput = (o: Record<string, unknown> = {}) =>
  createProjectSchema.parse({ ...base, ...o });
const updateInput = (o: Record<string, unknown>) => updateProjectSchema.parse(o);

describe("createProject", () => {
  beforeEach(async () => {
    await db.delete(projects);
    await db.delete(users);
  });

  it("id・タイムスタンプ・userId を採番して永続化し、end_date 未指定は進行中(null)", async () => {
    const userId = await seedUser();

    const created = await createProject(db, userId, createInput());

    expect(created.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(created.userId).toBe(userId);
    expect(created.name).toBe("決済基盤リプレイス");
    expect(created.endDate).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);

    const rows = await db.select().from(projects);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(created.id);
  });
});

describe("listProjects", () => {
  beforeEach(async () => {
    await db.delete(projects);
    await db.delete(users);
  });

  it("呼び出し User 自身の Project だけを返す", async () => {
    const me = await seedUser();
    const other = await seedUser();
    await createProject(db, me, createInput({ name: "自分のA" }));
    await createProject(db, other, createInput({ name: "他人のB" }));

    const list = await listProjects(db, me);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("自分のA");
  });

  it("開始日の新しい順で返す", async () => {
    const me = await seedUser();
    await createProject(db, me, createInput({ name: "古い", startDate: new Date("2022-01-01") }));
    await createProject(db, me, createInput({ name: "新しい", startDate: new Date("2024-06-01") }));

    const list = await listProjects(db, me);

    expect(list.map((p) => p.name)).toEqual(["新しい", "古い"]);
  });
});

describe("getProject", () => {
  beforeEach(async () => {
    await db.delete(projects);
    await db.delete(users);
  });

  it("自分の Project は取得できる", async () => {
    const me = await seedUser();
    const created = await createProject(db, me, createInput());

    expect((await getProject(db, me, created.id))?.id).toBe(created.id);
  });

  it("他人の Project は null（所有境界）", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const created = await createProject(db, other, createInput());

    expect(await getProject(db, me, created.id)).toBeNull();
  });
});

describe("updateProject", () => {
  beforeEach(async () => {
    await db.delete(projects);
    await db.delete(users);
  });

  it("自分の Project を更新し updatedAt を進める", async () => {
    const me = await seedUser();
    const created = await createProject(db, me, createInput());

    const updated = await updateProject(
      db,
      me,
      created.id,
      updateInput({ name: "改名後", endDate: new Date("2024-12-31") }),
    );

    expect(updated?.name).toBe("改名後");
    expect(updated?.endDate).toEqual(new Date("2024-12-31"));
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("他人の Project は更新せず null を返す", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const created = await createProject(db, other, createInput());

    expect(await updateProject(db, me, created.id, updateInput({ name: "乗っ取り" }))).toBeNull();
    expect((await db.select().from(projects))[0]?.name).toBe(base.name); // 不変
  });
});

describe("deleteProject", () => {
  beforeEach(async () => {
    await db.delete(projects);
    await db.delete(users);
  });

  it("自分の Project を削除して true", async () => {
    const me = await seedUser();
    const created = await createProject(db, me, createInput());

    expect(await deleteProject(db, me, created.id)).toBe(true);
    expect(await db.select().from(projects)).toHaveLength(0);
  });

  it("他人の Project は削除せず false", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const created = await createProject(db, other, createInput());

    expect(await deleteProject(db, me, created.id)).toBe(false);
    expect(await db.select().from(projects)).toHaveLength(1);
  });
});
