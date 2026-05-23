# 05. 認証設計（マルチ IdP 対応 OIDC / OAuth2）

## 概要

StacX は **Google** と **GitHub** の 2 つの IdP に対応します。将来的に Microsoft / Apple / その他 IdP を追加できるよう、**プロバイダ非依存な抽象化**を施した設計とします。

セッションは **自前管理（D1 保存）** です。

---

## 採用ライブラリ

| ライブラリ | 用途 |
|---|---|
| **arctic** | OAuth2 / OIDC クライアント（多数のプロバイダ対応） |
| **oslo** | セッショントークン生成、ハッシュ等のユーティリティ |

---

## 対応 IdP（Phase 1）

| IdP | 種別 | スコープ |
|---|---|---|
| Google | OIDC | `openid email profile` |
| GitHub | OAuth2 + Email API | `read:user user:email` |

### Phase 2 で追加候補
- Microsoft（Entra ID）
- Apple
- GitLab

---

## アカウント連携戦略

### Phase 1（個人利用）: 手動連携のみ

- 初回ログイン: 新規アカウント作成
- 既存ユーザーが別 IdP を追加したい場合: ログイン状態で設定画面から「連携する」操作
- メール一致による自動マージは **行わない**

### Phase 2（SaaS 化）: 業界標準ハイブリッド

- **検証済みメール**が既存アカウントと一致した場合: 自動マージ（マージ前にユーザーに通知・確認画面表示）
- メール不一致 or 未検証メール: 新規アカウント作成、設定画面から手動連携可能
- メール詐称対策のため、**信頼できる IdP（Google, GitHub 等）に限定**して自動マージを発動

### 自動マージしない（Phase 1 で除外する）ケース

- IdP がメールを返さない場合
- IdP がメールを `email_verified = false` で返した場合
- GitHub の `noreply` メール（`xxx@users.noreply.github.com`）

---

## DB スキーマ

### users（アプリ内のユーザー実体）

```typescript
{
  id: string              // ULID
  email: string | null    // 表示用、IdP 由来。一意制約はかけない
  name: string | null
  picture_url: string | null
  created_at: Date
  updated_at: Date
  last_login_at: Date
}
```

### user_identities（IdP との紐づけ、1 ユーザー : N IdP）

```typescript
{
  id: string              // ULID
  user_id: string         // FK → users.id
  provider: string        // "google" | "github" | ...（将来拡張）
  provider_sub: string    // IdP 側のユーザー ID（Google: sub, GitHub: id）
  provider_email: string | null
  provider_email_verified: boolean
  created_at: Date
  updated_at: Date
}
// UNIQUE(provider, provider_sub)
```

### sessions

```typescript
{
  id: string              // random 32 bytes hex
  user_id: string         // FK → users.id
  expires_at: Date
  created_at: Date
  user_agent: string | null
  ip_address: string | null
}
```

### 設計のポイント

- `users.email` に **一意制約をかけない**。同じメールでも別アカウントが存在しうる（手動連携前の状態）
- 一意性は `user_identities(provider, provider_sub)` で担保
- IdP 追加は `user_identities` にレコードを増やすだけ
- アカウント削除時は `user_identities` と `sessions` も CASCADE 削除

---

## 認証フロー詳細

### 1. ログイン開始

```
GET /auth/login/:provider
```

- `:provider` は `google` または `github`
- `arctic` で `state` と（OIDC の場合）`codeVerifier` を生成
- httpOnly Cookie に一時保存（10 分有効）
  - `oauth_state`
  - `oauth_code_verifier`（OIDC 用、PKCE）
  - `oauth_provider`（コールバック時に判定するため）
- プロバイダの認可エンドポイントへ 302 リダイレクト

### 2. コールバック

```
GET /auth/callback/:provider?code=...&state=...
```

#### 共通処理
1. Cookie の `state` と URL の `state` を比較（CSRF 対策）
2. プロバイダ別の `Provider.exchangeCode()` を呼び出し、`code` をトークンに交換
3. プロバイダ別の `Provider.fetchUserInfo()` でユーザー情報取得
4. 統一フォーマット `IdentityProfile` に正規化

#### `IdentityProfile`（プロバイダ非依存の型）

```typescript
type IdentityProfile = {
  provider: "google" | "github";
  providerSub: string;          // IdP 側の一意 ID
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
}
```

#### アカウント判定ロジック（Phase 1）

```
1. user_identities で (provider, provider_sub) を検索
   ├─ ヒット → そのユーザーでログイン
   └─ ヒットせず → 次へ

2. ログイン中（既存セッションあり）か判定
   ├─ ログイン中 → 既存アカウントに連携を追加（user_identities に INSERT）
   └─ 未ログイン → 新規ユーザー作成 + user_identities に INSERT
```

#### アカウント判定ロジック（Phase 2 で追加）

```
2.5. 未ログイン かつ メール検証済み の場合:
   users.email で検索
   ├─ ヒット → 「既存アカウントを発見しました。連携しますか？」確認画面
   │              └─ ユーザー承認 → 連携追加
   └─ ヒットせず → 新規ユーザー作成
```

### 3. セッション発行

- `sessions` テーブルにレコード作成
  - `id`: ランダム 32 バイト hex（oslo で生成）
  - `expires_at`: 30 日後
- セッション ID を httpOnly Cookie で発行
  - `Secure`, `HttpOnly`, `SameSite=Lax`
- `/` へリダイレクト

### 4. リクエスト時の認証

- 認証ミドルウェアを保護ルートに適用
- Cookie からセッション ID を取得
- D1 で `sessions` を引き、有効性確認
- ユーザー情報を Hono の `c.var.user` に注入

### 5. ログアウト

```
POST /auth/logout
```

- セッションを D1 から削除
- Cookie を即時失効

### 6. IdP 連携追加（設定画面から）

```
POST /auth/link/:provider
```

- ログイン必須
- 通常のログインフローと同じだが、コールバック時に **既存ユーザーに紐づける** 分岐に入る
- 既に同じ IdP が連携済みなら 409 Conflict

### 7. IdP 連携解除

```
DELETE /auth/link/:provider
```

- ログイン必須
- 解除後にログイン手段がゼロになる場合は拒否（最後の 1 つは外せない）

---

## プロバイダ抽象化

### ディレクトリ構成

```
packages/api/src/auth/
├── index.ts                    # 認証ミドルウェア、ルート登録
├── session.ts                  # セッション CRUD
├── providers/
│   ├── types.ts                # Provider インターフェース、IdentityProfile 型
│   ├── registry.ts             # プロバイダ一覧の集約
│   ├── google.ts               # Google 実装
│   └── github.ts               # GitHub 実装
└── routes/
    ├── login.ts                # /auth/login/:provider
    ├── callback.ts             # /auth/callback/:provider
    ├── link.ts                 # /auth/link/:provider
    └── logout.ts               # /auth/logout
```

### Provider インターフェース

```typescript
type Provider = {
  id: "google" | "github";
  createAuthorizationUrl(state: string, codeVerifier?: string): URL;
  exchangeCode(code: string, codeVerifier?: string): Promise<TokenSet>;
  fetchUserInfo(tokens: TokenSet): Promise<IdentityProfile>;
  usesPKCE: boolean;
}
```

### プロバイダ追加の手順（将来）

1. `providers/microsoft.ts` を新規作成し `Provider` を実装
2. `providers/registry.ts` に登録
3. 環境変数（Client ID/Secret）を追加
4. **既存コードの変更は不要**

---

## セキュリティ対策

| 対策 | 実装 |
|---|---|
| CSRF（state 検証） | OAuth `state` パラメータ、Cookie の SameSite=Lax |
| PKCE | OIDC（Google）では必須、`code_verifier` を Cookie に保存 |
| セッションハイジャック | httpOnly + Secure Cookie、HTTPS 必須 |
| トークン保護 | アクセストークン・ID トークンはサーバー側のみ、フロントに渡さない |
| セッション固定 | ログイン時に必ず新規セッション ID 発行、ログアウト時に削除 |
| 有効期限管理 | セッション 30 日、`state`/`code_verifier` Cookie 10 分 |
| メール詐称対策 | Phase 2 の自動マージは `email_verified=true` かつ信頼 IdP のみ |
| 連携最終手段の保護 | 最後のログイン手段を削除させない |

---

## 環境変数

### Phase 1（Google + GitHub）

```
# Google OIDC
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub OAuth2
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# 共通
SESSION_SECRET=...                 # セッション ID 生成のシード
APP_BASE_URL=https://stacx.dev     # コールバック URL の基点
```

各 IdP のコールバック URL は以下：

```
{APP_BASE_URL}/auth/callback/google
{APP_BASE_URL}/auth/callback/github
```

ローカル開発: `packages/api/.dev.vars` に記述（Git 管理外）
本番: `wrangler secret put` で登録

---

## IdP 別の注意点

### Google
- OIDC 準拠なので `arctic` の `Google` を使う
- `email_verified` を返してくれる
- スコープ: `openid email profile`

### GitHub
- 純粋な OAuth2（OIDC ではない）
- メール取得には別途 `GET https://api.github.com/user/emails` を呼ぶ必要あり
- ユーザーがメール非公開設定の場合、`noreply` メールが返る
  - Phase 2 の自動マージ対象から除外する
- スコープ: `read:user user:email`

### 将来追加時のチェックリスト
- [ ] OIDC か OAuth2 か
- [ ] PKCE 必須か
- [ ] メールを返すか、検証済みフラグを返すか
- [ ] アクセストークンの有効期限とリフレッシュ可否
- [ ] レート制限

---

## エラーハンドリング

| ケース | 挙動 |
|---|---|
| `state` 不一致 | 400 Bad Request、ログイン画面へ |
| `code` 交換失敗 | 400 Bad Request、ログイン画面へ「再試行してください」 |
| IdP がメールを返さない（GitHub） | 新規アカウントは作成可、Phase 2 自動マージは対象外 |
| 既に同じ IdP が連携済み（連携追加時） | 409 Conflict |
| 最後の連携を削除しようとした | 422 Unprocessable Entity |
| セッション切れ | 401 Unauthorized、ログイン画面へリダイレクト |

---

## Phase 1 → Phase 2 移行時の追加実装

DB スキーマは変更不要。以下のロジックを追加するだけで Phase 2 に移行可能：

1. **コールバック時の自動マージロジック**
   - メール検証済み + 信頼 IdP の場合に `users.email` 検索 → マージ確認画面
2. **マージ確認画面の UI**（RR v7 側）
3. **マージ実行 API**（連携追加 + 通知メール）
4. **メール通知機能**（SES や Resend 等を採用検討）

---

## 関連ドキュメント

- `docs/03-architecture.md` - 全体構成・データフロー
- `docs/06-development.md` - 開発コマンド、Secret 管理
