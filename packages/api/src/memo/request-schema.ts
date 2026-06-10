import { z } from "zod";

// メモのリクエスト検証スキーマ。`.brand()` で出力型を branded type にし、
// safeParse / parse を通した値しかドメイン層へ渡せないことを型で保証する。

/** POST /memos 用。tagIds 未指定は空配列に正規化。projectId は生成時に固定。 */
export const createMemoSchema = z
  .object({
    projectId: z.string().min(1),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    tagIds: z.array(z.string().min(1)).default([]),
  })
  .brand<"CreateMemoInput">();

/** 検証済みのメモ作成入力。createMemoSchema.parse の出力としてのみ得られる。 */
export type CreateMemoInput = z.infer<typeof createMemoSchema>;

/**
 * PUT /memos/:id 用。部分更新。projectId は含まない（メモは Project 間を移動しない）。
 * tagIds が present ならタグ集合を完全置換、absent なら変更しない。
 */
export const updateMemoSchema = z
  .object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    tagIds: z.array(z.string().min(1)),
  })
  .partial()
  .brand<"UpdateMemoInput">();

/** 検証済みのメモ更新入力。updateMemoSchema.parse の出力としてのみ得られる。 */
export type UpdateMemoInput = z.infer<typeof updateMemoSchema>;
