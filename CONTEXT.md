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

### プロジェクト・メモ

**Project** (プロジェクト):
業務上の案件・関与の単位。`projects` テーブルの 1 行に対応し、所有 User に紐づく。期間（開始日と、空なら「進行中」を表す終了日）・役割・業務形態などのコンテキストを持ち、Memo が紐づく器になる。
_Avoid_: 案件 (case)、ワークスペース

**進行中** (ongoing):
終了日 (`end_date`) が未設定の Project の状態。クイック・インテークでデフォルト選択され、UI 上でハイライトされる。
_Avoid_: アクティブ (active) — 論理削除の有無と紛らわしいため

**Memo** (メモ / 1 分メモ):
業務中に最小手数で記録する学び・成果・技術的判断の単位。`memos` テーブルの 1 行に対応する。生成時に 1 つの Project へ固定的に属し、別の Project へ移ることはない（コンポジション）。したがって Project が削除されれば配下の Memo も一緒に消える。後段で STAR ログへ昇華される素材。
_Avoid_: ノート (note)、エントリ (entry)

**Tag** (タグ):
Memo の*性質*を表す分類ラベル（技術チャレンジ / トラブル / チーム改善 等）。所有 User の中で自由に作成され、Memo と多対多で結びつく。タイムラインの絞り込み軸として使う。
_Avoid_: カテゴリ (category)、ラベル単体での「技術」表現（それは 技術スタック）

**技術スタック** (Tech Stack):
Project で使用した技術の集合（Go, PostgreSQL, Next.js 等）。Project に紐づき、経歴書では技術欄の*表示*に使う。絞り込み・抽出の軸としては扱わない（Phase 1）。Memo には紐づかない。
_Avoid_: 技術タグ (Tag と混同するため)、関連技術 (Memo 単位の技術紐付けは Phase 1 では持たない)
