import { describe, expect, it } from "vitest";
import { createMemoSchema, updateMemoSchema } from "./request-schema";

describe("createMemoSchema", () => {
  const valid = { projectId: "p1", title: "学び", body: "本文" };

  it("projectId/title/body が揃えば成功。tagIds 未指定は空配列に正規化", () => {
    const r = createMemoSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("学び");
      expect(r.data.tagIds).toEqual([]);
    }
  });

  it("tagIds 指定はそのまま通す", () => {
    const r = createMemoSchema.safeParse({ ...valid, tagIds: ["t1", "t2"] });
    expect(r.success && r.data.tagIds).toEqual(["t1", "t2"]);
  });

  it("projectId / title / body の欠落・空白は失敗", () => {
    expect(createMemoSchema.safeParse({ title: "t", body: "b" }).success).toBe(false);
    expect(createMemoSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(createMemoSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
  });

  it("tagIds に空文字や非文字列が混じると失敗", () => {
    expect(createMemoSchema.safeParse({ ...valid, tagIds: [""] }).success).toBe(false);
    expect(createMemoSchema.safeParse({ ...valid, tagIds: [123] }).success).toBe(false);
  });

  it("body がオブジェクトでなければ失敗", () => {
    expect(createMemoSchema.safeParse(null).success).toBe(false);
  });
});

describe("updateMemoSchema", () => {
  it("指定したフィールドだけを含む（部分更新）。projectId は無視される", () => {
    const r = updateMemoSchema.safeParse({ title: "改名", projectId: "p2" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ title: "改名" });
      expect("projectId" in r.data).toBe(false); // メモは Project 間を移動しない
    }
  });

  it("空オブジェクトは成功（変更なし）", () => {
    const r = updateMemoSchema.safeParse({});
    expect(r.success && Object.keys(r.data)).toEqual([]);
  });

  it("tagIds は空配列で全外しを表せる", () => {
    const r = updateMemoSchema.safeParse({ tagIds: [] });
    expect(r.success && r.data.tagIds).toEqual([]);
  });

  it("present な title が空・tagIds に空文字なら失敗", () => {
    expect(updateMemoSchema.safeParse({ title: "" }).success).toBe(false);
    expect(updateMemoSchema.safeParse({ tagIds: [""] }).success).toBe(false);
  });
});
