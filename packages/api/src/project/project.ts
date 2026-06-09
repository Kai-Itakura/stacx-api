import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { DB } from "../auth/session";
import { type Project, projects } from "../db/schema";
import type { CreateProjectInput, UpdateProjectInput } from "./request-schema";

/** Project を作成し、生成された行を返す。ID はアプリ側で ULID 採番する（ADR 0004）。 */
export async function createProject(
  db: DB,
  userId: string,
  input: CreateProjectInput,
): Promise<Project> {
  const now = new Date();
  const rows = await db
    .insert(projects)
    .values({
      id: ulid(),
      userId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      summary: input.summary ?? null,
      teamSize: input.teamSize ?? null,
      role: input.role ?? null,
      workStyle: input.workStyle ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  // insert ... returning は 1 行を返す。型の都合で配列なので先頭を取る。
  return rows[0] as Project;
}

/** 呼び出し User が所有する Project を開始日の新しい順で返す。 */
export async function listProjects(db: DB, userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.startDate), desc(projects.createdAt));
}

/** 呼び出し User が所有する Project を 1 件取得する。所有していなければ null。 */
export async function getProject(db: DB, userId: string, id: string): Promise<Project | null> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 呼び出し User が所有する Project を更新し、更新後の行を返す。
 * 所有していなければ何もせず null（所有境界を WHERE に畳んで他人の行に触れない）。
 */
export async function updateProject(
  db: DB,
  userId: string,
  id: string,
  input: UpdateProjectInput,
): Promise<Project | null> {
  const rows = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * 呼び出し User が所有する Project を削除する。削除できたら true、
 * 対象が無い／他人の Project なら false。
 */
export async function deleteProject(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  return rows.length > 0;
}
