import { describe, expect, it } from "vitest";
import { sessionCookieName } from "./cookie";

describe("sessionCookieName", () => {
  it("本番(https)は __Host- プレフィックス付き", () => {
    expect(sessionCookieName("https://stacx.dev")).toBe("__Host-stacx_session");
  });

  it("ローカル(http)は無印", () => {
    expect(sessionCookieName("http://localhost:5173")).toBe("stacx_session");
  });
});
