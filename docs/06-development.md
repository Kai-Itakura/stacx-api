# 06. 開発フロー・コマンド一覧

## 初期セットアップ

    # リポジトリクローン後
    pnpm install

    # Cloudflare 認証
    npx wrangler login

    # D1 データベース作成
    cd packages/api
    npx wrangler d1 create stacx-db
    # 表示された database_id を wrangler.toml に記録

    # マイグレーション生成・適用
    pnpm drizzle-kit generate
    npx wrangler d1 migrations apply stacx-db --local

---

## 日常の開発コマンド

    # 全パッケージ並列起動
    pnpm -r dev

    # フロントのみ起動
    pnpm --filter web dev

    # API のみ起動
    pnpm --filter api dev

    # 型チェック
    pnpm -r typecheck

    # Lint
    pnpm -r lint

    # ビルド
    pnpm -r build

---

## DB マイグレーション

    cd packages/api

    # スキーマ変更後、マイグレーションファイル生成
    pnpm drizzle-kit generate

    # ローカル D1 に適用
    npx wrangler d1 migrations apply stacx-db --local

    # 本番 D1 に適用
    npx wrangler d1 migrations apply stacx-db --remote

    # DB を直接クエリ（デバッグ用）
    npx wrangler d1 execute stacx-db --local --command="SELECT * FROM users"

---

## デプロイ

### API（Cloudflare Workers）

    cd packages/api
    pnpm build
    npx wrangler deploy

### Web（Cloudflare Pages）

- GitHub と連携した自動デプロイを推奨
- `packages/web` のビルド設定:
  - Build command: `pnpm --filter web build`
  - Output directory: `packages/web/build/client`

---

## Secret 管理

    # 本番 secret 登録
    cd packages/api
    npx wrangler secret put GOOGLE_CLIENT_ID
    npx wrangler secret put GOOGLE_CLIENT_SECRET

ローカルは `packages/api/.dev.vars` に記述（Git 管理外）。

---

## ブランチ戦略（個人開発）

- `main`: 安定版、本番デプロイ対象
- `feat/*`: 機能開発
- `fix/*`: バグ修正

PR を切らず直接 push でも問題ないが、後で経歴書に書く時に PR 履歴があると説明しやすい。

---

## コミットメッセージ規約

Conventional Commits を採用:

- `feat: クイックメモ画面を追加`
- `fix: STAR エディタで保存が効かない問題を修正`
- `docs: CLAUDE.md に開発フローを追記`
- `refactor: 認証ミドルウェアを共通化`
- `chore: drizzle-kit を更新`

---

## ローカル開発の同一オリジン化（Vite dev proxy）

web と api は別ポートで起動するが、ブラウザから見て同一オリジンになるよう Vite proxy で `/api/*` を api ワーカーに転送する。これにより本番 (path 分割同一オリジン、ADR 0001) と挙動が一致し、CORS / cross-origin Cookie の設定が不要になる。

    // packages/web/vite.config.ts
    export default defineConfig({
      server: {
        proxy: {
          '/api': 'http://localhost:8787',
        },
      },
    });

web からの API 呼び出しは常に相対パス `/api/...` を使う。`VITE_API_BASE_URL` のような環境変数は導入しない。

---

## トラブルシューティング

### `wrangler dev` でローカル D1 にデータが入らない
- `--local` フラグを忘れていないか確認
- ローカル D1 は `.wrangler/state` 配下に保存される

### `/api/...` を叩いて 404 になる
- Vite proxy が設定されているか (`vite.config.ts` の `server.proxy`)
- wrangler dev が `localhost:8787` で起動しているか

### Hono RPC の型が反映されない
- API 側で `app.routes` を export しているか
- フロント側で型インポートのパスが合っているか
