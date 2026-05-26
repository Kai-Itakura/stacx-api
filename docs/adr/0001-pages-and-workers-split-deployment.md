# Cloudflare Pages（web）と Workers（api）を path 分割で同一オリジン配置する

個人ツールとしての運用負荷最小化と GitHub 連携デプロイ・プレビュー URL 利用を優先し、web は Cloudflare Pages、api は Cloudflare Workers に分離する。カスタムドメイン `stacx.dev` の `/api/*` を Workers にルーティング、それ以外を Pages にルーティングする path 分割構成を採用し、ブラウザから見ると同一オリジンとする（Cookie / CORS の煩雑さを回避）。

## Considered Options

- **シングル Worker（RR v7 SSR + Hono 同居）**: デプロイ単位が 1 つで最もシンプル。SSR loader から Hono を関数直叩きできレイテンシ最小。ただし Worker サイズ上限が圧迫されやすく、web/api を独立にロールバックできず、Pages の自動デプロイ・プレビュー URL も使えない。
- **Pages + Workers をサブドメイン分割（`app.stacx.dev` + `api.stacx.dev`）**: デプロイは独立するが、クロスオリジンになるため CORS と Cookie Domain 設定が必要。個人ツールでこの煩雑さを払う理由がない。

## Consequences

- web の SSR loader から api を呼ぶときは HTTP 経由（同一オリジン）。レイテンシが気になるエンドポイントは Service Binding で内部通信に切り替える余地あり。
- デプロイ設定は Pages 設定 +  `packages/api/wrangler.toml` の 2 系統で管理する。
- カスタムドメイン取得とその Workers Routes 設定が本番デプロイ時に必須。
