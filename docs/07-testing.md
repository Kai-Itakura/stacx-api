# 07. テスト方針

## 基本方針: TDD

新機能・バグ修正は **Red → Green → Refactor** で進める。

1. **Red**: まず失敗するテストを書く（期待する振る舞いを先に定義する）
2. **Green**: テストを通す最小限の実装を書く
3. **Refactor**: テストが緑のまま内部を整理する

「テストは要求時のみ」という従来方針から、**TDD を既定**に切り替えた（経緯は本ドキュメント末尾）。ただし「型で保証される」「単純な通過コード」までは追わず、**ドメインロジック・分岐・境界**にテストを集中させる（過剰実装は引き続き避ける）。

---

## スタック

| ライブラリ | 役割 |
|---|---|
| **Vitest**（3.2.x 系） | テストランナー |
| **@cloudflare/vitest-pool-workers**（0.8.x 系） | テストを実 workerd ランタイム内で実行し、本物の D1 等のバインディングを与える |

### バージョン選定の注意
pool-workers の最新 `0.16` 系（Vitest 4 対応）は、ドキュメント化された `defineWorkersConfig` / `/config` サブパスを**廃止**している。公式ドキュメント・例がそのまま使える**安定版（0.8 系 + Vitest 3.2 系）**を採用する。Vitest 4 系の安定とドキュメント整備が進んだら追従を検討する。

---

## 実行環境の理解（重要）

**すべてのテストファイルは（単体テストも含め）workerd の中で実行される。** これは pool-workers が Vitest の Node ベース実行環境を workerd ベースに丸ごと差し替えるため。

- 本番と同じランタイムで検証できる（`crypto.getRandomValues` や D1 バインディングが本番同様に使える／`fs` など使えない）= **ローカルと本番のズレを排除**
- 実行は **Miniflare + workerd でローカル完結**（オフライン可）。D1 はローカル SQLite にマイグレーションを適用したもの

### どのファイルがどこで動くか（tsconfig の分け方の根拠）

| 対象 | 実行環境 | tsconfig |
|---|---|---|
| `vitest.config.ts`（設定スクリプト） | **Node**（Vitest を起動する側） | `tsconfig.node.json`（node 型あり） |
| `src/**`（worker 本体） | **workerd** | `tsconfig.json`（node/DOM 型なし） |
| `test/**/*.test.ts` | **workerd** | `tsconfig.json`（同上） |

→ worker 本体とテストでは Node API を型レベルで使えない（誤用を弾く）。設定ファイルだけ Node API を許可する。

---

## ディレクトリ構成

```
packages/api/
├── vitest.config.ts            # pool-workers 設定（wrangler.toml 参照, D1 へ migrations 適用）
├── tsconfig.node.json          # 設定ファイル用（node 型）
└── test/
    ├── apply-migrations.ts     # setup: テスト用 D1 に migrations を適用
    ├── env.d.ts                # cloudflare:test の ProvidedEnv 型
    ├── unit/                   # バインディング不要の純ロジック
    └── integration/            # D1 や worker(SELF) を使う
```

- **unit**: 入出力が純粋な関数（Cookie 名の切替、`isProviderId`、認可 URL 生成、ID 生成 等）
- **integration**: 本物の D1（`loginWithIdentity` / `findAuthUser`）、worker 全体（`SELF.fetch` でルート/ミドルウェア）

---

## D1 を使うテスト

- `vitest.config.ts` で `readD1Migrations` がマイグレーションを読み、`test/apply-migrations.ts`（setup）の `applyD1Migrations` でテスト用 D1 に適用する（冪等）
- 各テストの独立性は `beforeEach` で関連テーブルを `DELETE` して確保する
- `drizzle(env.DB, { schema })` で本物の D1 に対してクエリ・`db.batch` を実行し、SQL の実挙動を検証する

---

## 外部 IdP（Google）の扱い

- ネットワークに出る `Provider.verify()`（トークン交換）は**そのまま叩かない**。`createAuthorizationURL` など**通信しない部分**を検証する
- callback の完全な往復（E2E）が必要なときは、`arctic` の `validateAuthorizationCode` / `decodeIdToken` を `vi.mock` でスタブする
- テスト用のダミー認証情報（`GOOGLE_CLIENT_ID` 等）は `vitest.config.ts` の **miniflare bindings で注入**する。`.dev.vars`（gitignore 済み）には依存しない＝**CI でも再現可能**

---

## コマンド

```sh
pnpm --filter @stacx/api test         # 一回実行（CI 用）
pnpm --filter @stacx/api test:watch   # 監視実行（TDD 中はこれ）
pnpm --filter @stacx/api typecheck    # worker と設定ファイルの両方を tsc
pnpm check                            # Biome（lint + format + import 整列）
```

---

## 経緯

テストは当初「要求時のみ」だったが、プロジェクトを TDD で進める方針に切り替え、認証コードを特性テストでカバーした時点で本基盤（Vitest + pool-workers）を導入した。

## 関連ドキュメント

- `docs/06-development.md` - 開発フロー・コマンド一覧
- `docs/03-architecture.md` - システム構成
