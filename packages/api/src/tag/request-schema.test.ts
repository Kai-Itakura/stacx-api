import { describe, expect, it } from "vitest";
import { createTagSchema } from "./request-schema";

describe("createTagSchema", () => {
  it("name があれば成功（前後空白はトリム）", () => {
    const r = createTagSchema.safeParse({ name: "  トラブル  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("トラブル");
  });

  it("body がオブジェクトでなければ失敗", () => {
    expect(createTagSchema.safeParse(null).success).toBe(false);
    expect(createTagSchema.safeParse("トラブル").success).toBe(false);
  });

  it("name 欠落・空・空白のみは失敗", () => {
    expect(createTagSchema.safeParse({}).success).toBe(false);
    expect(createTagSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createTagSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("name が文字列でなければ失敗", () => {
    expect(createTagSchema.safeParse({ name: 123 }).success).toBe(false);
  });
});
