import { decodeIdToken, Google } from "arctic";
import type { IdentityProfile, Provider } from "./types";

/** Google OIDC スコープ。email / profile を要求して id_token にクレームを載せる。 */
const SCOPES = ["openid", "email", "profile"];

/** Google の id_token に載るクレームのうち利用する分。 */
type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/** Google Provider の構築に必要な環境変数。 */
export type GoogleProviderEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** コールバック URL の基点。例: https://stacx.dev / http://localhost:5173 */
  APP_BASE_URL: string;
};

export function createGoogleProvider(env: GoogleProviderEnv): Provider {
  const redirectURI = `${env.APP_BASE_URL}/api/auth/callback/google`;
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectURI);

  return {
    id: "google",

    createAuthorizationURL(state, codeVerifier) {
      return google.createAuthorizationURL(state, codeVerifier, SCOPES);
    },

    async verify(code, codeVerifier): Promise<IdentityProfile> {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      // OIDC のため userinfo エンドポイントは叩かず、id_token のクレームを使う。
      // token エンドポイントから TLS で直接受領した id_token なので署名検証は省略する。
      const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;

      if (typeof claims.sub !== "string") {
        throw new Error("Google の id_token に sub クレームがありません");
      }

      return {
        provider: "google",
        providerSub: claims.sub,
        email: claims.email ?? null,
        emailVerified: claims.email_verified ?? false,
        name: claims.name ?? null,
        pictureUrl: claims.picture ?? null,
      };
    },
  };
}
