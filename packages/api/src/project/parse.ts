import { z } from "zod";
import type { CreateProjectInput, UpdateProjectInput } from "./project";

/** バリデーション結果。成功なら value、失敗なら人間可読な error を持つ。 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

// JSON 由来のボディを検証する。HTTP 経由なので number は常に有限（JSON に Infinity/NaN は無い）。
// 日付は epoch ミリ秒（number）または日付文字列を coerce で Date 化し、不正値は弾く。

/** POST /projects 用。未指定の任意項目は null に正規化する。 */
const createSchema = z.object({
  name: z.string().trim().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce
    .date()
    .nullish()
    .transform((v) => v ?? null),
  summary: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  teamSize: z
    .number()
    .nullish()
    .transform((v) => v ?? null),
  role: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  workStyle: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

/** PUT /projects/:id 用。部分更新なので全項目任意。指定キーのみ出力に残る。 */
const updateSchema = z
  .object({
    name: z.string().trim().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable(),
    summary: z.string().nullable(),
    teamSize: z.number().nullable(),
    role: z.string().nullable(),
    workStyle: z.string().nullable(),
  })
  .partial();

/** zod の safeParse 結果を ParseResult に変換する（先頭 issue を可読メッセージ化）。 */
function toResult<T>(
  parsed: { success: true; data: T } | { success: false; error: z.ZodError },
): ParseResult<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".");
  return {
    ok: false,
    error: path ? `${path}: ${issue?.message}` : (issue?.message ?? "invalid body"),
  };
}

/** POST /projects のボディを CreateProjectInput に検証変換する。 */
export function parseCreateInput(body: unknown): ParseResult<CreateProjectInput> {
  return toResult(createSchema.safeParse(body));
}

/** PUT /projects/:id のボディを UpdateProjectInput に検証変換する（部分更新）。 */
export function parseUpdateInput(body: unknown): ParseResult<UpdateProjectInput> {
  return toResult(updateSchema.safeParse(body));
}
