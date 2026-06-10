import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { authMiddleware } from "../auth/index";
import type { AppEnv } from "../types";
import { badRequestFromZod } from "../validation";
import { createMemo, deleteMemo, getMemo, listMemos, updateMemo } from "./memo";
import { createMemoSchema, updateMemoSchema } from "./request-schema";

const validateCreate = zValidator("json", createMemoSchema, (result, c) => {
  if (!result.success) return c.json(badRequestFromZod(result.error), 400);
});
const validateUpdate = zValidator("json", updateMemoSchema, (result, c) => {
  if (!result.success) return c.json(badRequestFromZod(result.error), 400);
});

/**
 * メモの CRUD ルート。/api/memos 配下にマウントする。
 * 全ルートで認証必須・操作は c.var.user.id 所有のものに限定される。
 * projectId / tagIds が他人・不在を指す場合は 400（reason 付き）で弾く。
 */
export const memoApp = new Hono<AppEnv>()
  .use("*", authMiddleware)
  .post("/", validateCreate, async (c) => {
    const result = await createMemo(c.var.db, c.var.user.id, c.req.valid("json"));
    if (!result.ok) return c.json({ error: result.reason }, 400);
    return c.json({ memo: result.memo }, 201);
  })
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const list = await listMemos(c.var.db, c.var.user.id, projectId ? { projectId } : undefined);
    return c.json({ memos: list });
  })
  .get("/:id", async (c) => {
    const memo = await getMemo(c.var.db, c.var.user.id, c.req.param("id"));
    if (!memo) return c.json({ error: "not_found" }, 404);
    return c.json({ memo });
  })
  .put("/:id", validateUpdate, async (c) => {
    const result = await updateMemo(
      c.var.db,
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
    );
    if (!result.ok) {
      return c.json({ error: result.reason }, result.reason === "not_found" ? 404 : 400);
    }
    return c.json({ memo: result.memo });
  })
  .delete("/:id", async (c) => {
    const deleted = await deleteMemo(c.var.db, c.var.user.id, c.req.param("id"));
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
