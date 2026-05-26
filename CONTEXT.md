# StacX

業務中の学びを「1 分メモ」として蓄積し、職務経歴書として再利用するための個人向けアプリ。

## Language

### 認証・アイデンティティ

**User** (ユーザー):
アプリ内で「人」を表す実体。`users` テーブルの 1 行に対応する。1 人の User は複数の Identity を持ちうる。
_Avoid_: アカウント (Account)

**Identity** (アイデンティティ):
1 つの IdP 上のアカウントと User を結ぶ紐づきレコード。`user_identities` の 1 行に対応する。`(provider, provider_sub)` で一意。
_Avoid_: 連携アカウント、IdP アカウント

**Session** (セッション):
ログイン状態の永続化単位。`sessions` テーブルの 1 行に対応し、httpOnly Cookie 上のセッション ID から引かれる。

**Link** (連携):
既存 User に Identity を結びつける操作。`user_identities` への INSERT で実現する。
_Avoid_: マージ (merge) — マージ対象の 2 つの User 行は登場しないため

**Auto-link** (自動連携):
Phase 2 で導入予定。検証済みメールが既存 User と一致したとき、ユーザー確認のうえで Link を自動的に提案する挙動。
_Avoid_: 自動マージ (auto-merge)

**IdP** (Identity Provider):
外部 ID プロバイダ。Phase 1 は Google のみ。Phase 2 で GitHub / Microsoft / Apple / GitLab を追加候補とする。

**provider_sub**:
IdP 側で発行される、その IdP 内で不変かつ一意なユーザー識別子。OIDC の `sub` クレーム由来。`(provider, provider_sub)` の組で Identity を一意に特定する。
_Avoid_: provider user id, external id
