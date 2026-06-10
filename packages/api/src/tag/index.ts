import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { authMiddleware } from "../auth/index";
import type { AppEnv } from "../types";
import { badRequestFromZod } from "../validation";
import { createTagSchema } from "./request-schema";
import { createTag, deleteTag, listTags } from "./tag";

/** JSON ボディ検証。失敗時は API の `{ error }` 400 で返す（@hono/zod-validator）。 */
const validateCreate = zValidator("json", createTagSchema, (result, c) => {
  if (!result.success) return c.json(badRequestFromZod(result.error), 400);
});

/**
 * タグの作成 / 一覧 / 削除ルート。/api/tags 配下にマウントする。
 * 全ルートで認証必須・操作は c.var.user.id 所有のものに限定される。
 */
export const tagApp = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .post("/", validateCreate, async (c) => {
    const result = await createTag(c.var.db, c.var.user.id, c.req.valid("json"));
    if (!result.ok) return c.json({ error: "duplicate" }, 409);
    return c.json({ tag: result.tag }, 201);
  })
  .get("/", async (c) => {
    const list = await listTags(c.var.db, c.var.user.id);
    return c.json({ tags: list });
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteTag(c.var.db, c.var.user.id, c.req.param("id"));
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
