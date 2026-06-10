import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { authMiddleware } from "../auth/index";
import type { AppEnv } from "../types";
import { badRequestFromZod } from "../validation";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./project";
import { createProjectSchema, updateProjectSchema } from "./request-schema";

/** JSON ボディ検証。失敗時は API の `{ error }` 400 で返す（@hono/zod-validator）。 */
const validateCreate = zValidator("json", createProjectSchema, (result, c) => {
  if (!result.success) return c.json(badRequestFromZod(result.error), 400);
});
const validateUpdate = zValidator("json", updateProjectSchema, (result, c) => {
  if (!result.success) return c.json(badRequestFromZod(result.error), 400);
});

/**
 * Project の CRUD ルート。/api/projects 配下にマウントする。
 * 全ルートで認証必須・操作は c.var.user.id 所有のものに限定される。
 */
export const projectApp = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .post("/", validateCreate, async (c) => {
    const project = await createProject(c.var.db, c.var.user.id, c.req.valid("json"));
    return c.json({ project }, 201);
  })
  .get("/", async (c) => {
    const projects = await listProjects(c.var.db, c.var.user.id);
    return c.json({ projects });
  })
  .get("/:id", async (c) => {
    const project = await getProject(c.var.db, c.var.user.id, c.req.param("id"));
    if (!project) return c.json({ error: "not_found" }, 404);
    return c.json({ project });
  })
  .put("/:id", validateUpdate, async (c) => {
    const project = await updateProject(
      c.var.db,
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
    );
    if (!project) return c.json({ error: "not_found" }, 404);
    return c.json({ project });
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteProject(c.var.db, c.var.user.id, c.req.param("id"));
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
