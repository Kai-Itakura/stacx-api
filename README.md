# StacX

業務中の学びを「1 分メモ」として蓄積し、転職活動時に職務経歴書として出力できる個人向けアプリケーション。

## コア価値

業務中の「あ、これ経歴書に使えるかも」という瞬間を逃さず、後から経歴書として再利用できる形に昇華させます。

## 主要機能

1. **クイックメモ** - 業務中の気づきを 1 分で記録
2. **プロジェクト管理** - 案件の基本情報・技術スタックを登録
3. **STAR ログ** - メモを STAR フレームワークに肉付け
4. **レジュメ出力** - Markdown 形式の職務経歴書を生成

## 技術スタック

- **フロントエンド**: React Router v7 + TypeScript + shadcn/ui + Tailwind CSS
- **バックエンド**: Hono on Cloudflare Workers
- **データベース**: Cloudflare D1 + Drizzle ORM
- **認証**: OIDC / OAuth2 (Google, GitHub) + 自前セッション管理
- **モノレポ**: pnpm workspace

## クイックスタート

    # 依存関係インストール
    pnpm install

    # Cloudflare 認証
    npx wrangler login

    # D1 データベース作成
    cd packages/api
    npx wrangler d1 create stacx-db

    # マイグレーション適用
    pnpm drizzle-kit generate
    npx wrangler d1 migrations apply stacx-db --local

    # 開発サーバー起動（全パッケージ並列）
    cd ../..
    pnpm -r dev

詳細は `docs/06-development.md` を参照してください。

## ドキュメント

- [プロダクトビジョン](docs/01-product-vision.md)
- [技術スタック](docs/02-tech-stack.md)
- [アーキテクチャ](docs/03-architecture.md)
- [画面仕様](docs/04-screens.md)
- [認証設計](docs/05-auth.md)
- [開発フロー](docs/06-development.md)

## AI エージェント利用

このプロジェクトは AI エージェント（Claude Code, Cursor 等）と協働して開発します。エージェント向けの情報は [`AGENTS.md`](AGENTS.md) に集約されています。

## ライセンス

Private（個人開発）
