import { describe, expect, it } from "vitest";
import { generateSessionId } from "./session";

describe("generateSessionId", () => {
  it("32 バイト = 64 桁の hex", () => {
    expect(generateSessionId()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("呼ぶたびに異なる", () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});
