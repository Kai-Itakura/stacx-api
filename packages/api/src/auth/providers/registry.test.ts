import { describe, expect, it } from "vitest";
import { getProvider, isProviderId } from "./registry";

const env = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  APP_BASE_URL: "http://localhost:5173",
};

describe("isProviderId", () => {
  it("実装済みの google は true", () => {
    expect(isProviderId("google")).toBe(true);
  });

  it("未実装の値は false", () => {
    expect(isProviderId("github")).toBe(false);
    expect(isProviderId("")).toBe(false);
  });
});

describe("getProvider", () => {
  it("google の Provider を返す", () => {
    expect(getProvider("google", env).id).toBe("google");
  });
});
