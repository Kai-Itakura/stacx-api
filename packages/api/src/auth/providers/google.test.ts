import { describe, expect, it } from "vitest";
import { createGoogleProvider } from "./google";

const provider = createGoogleProvider({
  GOOGLE_CLIENT_ID: "test-id",
  GOOGLE_CLIENT_SECRET: "test-secret",
  APP_BASE_URL: "https://stacx.dev",
});

describe("createGoogleProvider.createAuthorizationURL", () => {
  it("PKCE と scope を含む Google 認可 URL を生成する", () => {
    const url = provider.createAuthorizationURL("state123", "verifier123");

    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://stacx.dev/api/auth/callback/google");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    // code_verifier から導出された challenge が載っていること。
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });
});
