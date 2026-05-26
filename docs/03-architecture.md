# 03. アーキテクチャ

## ディレクトリ構成

```text
stacx/
├── CLAUDE.md
├── README.md
├── docs/
├── packages/
│   ├── web/             # React Router v7 フロントエンド
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── root.tsx
│   │   ├── public/
│   │   └── package.json
│   └── api/             # Hono on Workers バックエンド
│       ├── src/
│       │   ├── routes/
│       │   ├── db/
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   ├── auth/
│       │   ├── middleware/
│       │   └── index.ts
│       ├── wrangler.toml
│       └── package.json
├── pnpm-workspace.yaml
└── package.json
```

---

## システム構成図

ユーザー (PC / スマホ)
　↓ HTTPS
Cloudflare Pages (React Router v7 SSR/CSR)
　↓ Hono RPC (fetch)
Cloudflare Workers (Hono API)
　├─ 認証ミドルウェア
　├─ ルーティング
　└─ ビジネスロジック
　↓ Drizzle ORM
Cloudflare D1 (SQLite)
　├─ users
　├─ sessions
　├─ projects
　├─ memos
　├─ star_logs
　├─ tech_decisions
　└─ tags

別経路:
Cloudflare Workers ⇄ Google IdP (OIDC)

---

## データフロー例

### 1. メモ作成のフロー

1. ユーザー入力
2. RR v7 Form → action
3. Hono RPC client 経由で API 呼び出し
4. Hono Workers `/api/memos POST`
5. 認証ミドルウェアでセッション検証
6. Zod バリデーション
7. Drizzle で `INSERT INTO memos`
8. D1 に保存
9. レスポンス（メモオブジェクト）を返却
10. RR v7 が revalidate して一覧を更新

### 2. 認証フロー（OIDC/OAuth2）

1. ユーザーがログインボタン（Google/GitHub等）を押す
2. RR v7 が `/login/:provider` へ遷移
3. Hono Workers が `state` 生成し、プロバイダへリダイレクト
4. ユーザーが IdP で認証
5. IdP が `/auth/callback/:provider` へリダイレクト
6. Hono Workers が `code` をトークンに交換し、ユーザー情報を取得
7. `user_identities` を確認し、ユーザー特定または新規作成
8. `sessions` テーブルにセッションを保存
9. httpOnly Cookie を発行
10. RR v7 が `/` へリダイレクト

詳細: `docs/05-auth.md`

---

## モノレポ構成のポイント

### pnpm-workspace.yaml

    packages:
      - "packages/*"

### 型共有戦略

- API のレスポンス型・リクエスト型は **Hono RPC で自動配布される**（web 側は `client<typeof app>` で型推論）
- Zod スキーマは `packages/api/src/` 内に配置し、Hono の `zValidator` で利用
- web ↔ api 双方が依存する純粋な共通モジュールが必要になった時点で `packages/shared` を切り出す（YAGNI、Phase 1 では作らない）

### スクリプト実行

    # 全パッケージ並列で dev
    pnpm -r dev

    # 個別実行
    pnpm --filter web dev
    pnpm --filter api dev

---

## 環境変数管理

### packages/api（.dev.vars）

    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...
    APP_BASE_URL=http://localhost:5173

本番は `wrangler secret put` で登録。

### packages/web

web からの API 呼び出しはすべて相対パス (`/api/...`) で行う。ローカル開発時は Vite の dev proxy で `/api/*` を wrangler dev (`http://localhost:8787`) に転送し、ブラウザから見た同一オリジン挙動を本番 (`stacx.dev/*` Pages, `stacx.dev/api/*` Workers) と一致させる。

    // packages/web/vite.config.ts
    export default defineConfig({
      server: {
        proxy: {
          '/api': 'http://localhost:8787',
        },
      },
    });

これにより `VITE_API_BASE_URL` のような環境変数は不要、CORS / cross-origin Cookie 設定も発生しない。
