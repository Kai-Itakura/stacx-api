import { z } from "zod";

// タグ作成リクエストの検証スキーマ。`.brand()` で出力型を branded type にし、
// safeParse / parse を通した値しかドメイン層へ渡せないことを型で保証する
// （生のオブジェクトを createTag に直接渡すとコンパイルエラーになる）。
export const createTagSchema = z
  .object({
    name: z.string().trim().min(1),
  })
  .brand<"CreateTagInput">();

/** 検証済みのタグ作成入力。createTagSchema.parse の出力としてのみ得られる。 */
export type CreateTagInput = z.infer<typeof createTagSchema>;
