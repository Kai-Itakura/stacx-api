/** ZodError を API 共通の `{ error }` 400 ボディに整形する（先頭 issue を可読化）。 */
export function badRequestFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): { error: string } {
  const issue = error.issues[0];
  const path = issue?.path.map((p) => p.toString()).join(".");
  return { error: path ? `${path}: ${issue?.message}` : (issue?.message ?? "invalid body") };
}
