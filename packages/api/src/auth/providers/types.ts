/**
 * 実装済み IdP の識別子。Phase 1 は Google のみ。
 * Phase 2 で "github" などを union に追加する。
 */
export type ProviderId = "google";

/**
 * プロバイダ非依存に正規化された Identity 情報。
 * 各 Provider はトークンの形を内部に隠蔽し、この型だけを返す。
 */
export type IdentityProfile = {
  provider: ProviderId;
  /** IdP の sub クレーム（IdP 内で不変・一意） */
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
};

/**
 * IdP との対話を抽象化する。トークン交換とプロフィール取得は
 * verify() の内部に隠蔽し、呼び出し側はトークンに触れない。
 */
export type Provider = {
  id: ProviderId;
  /** 認可エンドポイントへのリダイレクト URL を組み立てる。 */
  createAuthorizationURL(state: string, codeVerifier: string): URL;
  /** 認可コードを検証し、正規化済みの IdentityProfile を返す。 */
  verify(code: string, codeVerifier: string): Promise<IdentityProfile>;
};
