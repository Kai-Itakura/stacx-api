# Phase 1 Session は D1 自前管理 + 絶対 30 日固定 + スライディング延長なし

当初の設計は 30 日有効期限 + 残り 7 日を切ったら自動延長する条件付きスライディングだったが、これは認証ミドルウェアに DB write を持ち込み、さらに web (Cloudflare Pages) → api (Workers) 経由のリクエストで `Set-Cookie` を loader/action が明示転送する補助レイヤを連鎖的に要求していた。Phase 1 は個人ユーザーの日常利用が前提でほぼ毎回 30 日経過前に新規ログインが発生するため、スライディングが UX に寄与する場面が乏しいと判断し、絶対 30 日固定に倒した。

login / logout のフローを web の `loader` / `action` を経由せず **ブラウザから api を直接叩く**（`<a href="/api/auth/login/google">` / `<form method="POST" action="/api/auth/logout">`）形に揃えられるのは、[ADR 0001](./0001-pages-and-workers-split-deployment.md) の path 分割同一オリジン構成（Pages と Workers が `stacx.dev` 配下で同居）が成立しているおかげで、CORS / Cookie origin の設定なしに `Set-Cookie` がそのままブラウザに届く前提に依存している。

## Considered Options

- **絶対 30 日 + 条件付きスライディング延長**: 利用頻度がまばらなユーザーが実質ログインを維持できる。ただし認証ミドルウェアでの DB write、`Set-Cookie` を loader/action 経由で転送する `apiFetch` / `withForwardedCookies` ヘルパが必要になる。Phase 1 個人ユーザーの利用パターンでは恩恵がほぼ発生しない。
- **JWT 等のステートレス Session**: D1 への読み書きを完全に省ける。ただし即時失効（ログアウト・乗っ取り検知後の強制ログアウト）が困難で、署名鍵の運用も追加コスト。Phase 1 で得るものが少ない。

## Consequences

- 認証ミドルウェアは純粋な SELECT のみで、DB write は login（INSERT sessions）と logout（DELETE sessions）の 2 箇所に集約される
- web の `loader` / `action` から呼ぶ API はデータ取得専用とし、Cookie 書き換えは login / logout の直叩きフローに閉じる。`Set-Cookie` 転送ヘルパは作らない
- Phase 2 で利用頻度がまばらなユーザーが現れたら再評価する。その時点では Session refresh を専用エンドポイント（例: `POST /api/session/touch`）に閉じ込めて、補助ヘルパの影響範囲を最小化する選択肢が残っている
