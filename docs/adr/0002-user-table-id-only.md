# `users` テーブルは ID とタイムスタンプのみを持ち、表示情報は `user_identities` 側を Single Source of Truth とする

1 User : N Identity の構造で、各 Identity は IdP から `email` / `name` / `picture_url` を取得する。当初の設計は `users` 側にも表示情報をデノーマライズして JOIN を避けていたが、(a) Phase 2 で複数 Identity を持ったとき「どの表示情報が正？」が曖昧化する、(b) Phase 1 では Google 単一 IdP のため `users` 側の値は冗長、(c) D1 は 1 文に詰めた JOIN なら追加の往復を生まないため性能上の動機が弱い、の 3 点から `users` テーブルから表示情報カラムを排除し、`user_identities.updated_at` が最大の行を表示用に採用する方針に変更した。

## Considered Options

- **denormalize 維持（`users.email` / `name` / `picture_url` をログイン毎に更新）**: JOIN を 1 段省ける。ただし Phase 2 で複数 Identity を持つようになると「どの Identity の値で更新するか」のルールが必要になり、`users` 側の値が「最後にログインに使った IdP のスナップショット」に過ぎなくなって SSoT が崩れる。
- **`users.primary_identity_id` を持つ**: 表示用 Identity を明示的に指定できる。ただし「primary を切り替える」概念を Phase 1 で導入する正当化が弱い。

## Consequences

- 認証ミドルウェアは Session → User → 最新 Identity を 1 つの JOIN クエリで取得する（追加の往復なし、~5〜20ms）
- Phase 2 で Auto-link を実装する際の検索キーは `user_identities.email`（`users.email` は存在しない）
- リクエストスコープを超えるキャッシュ層（KV / `sessions` 行への denormalize 等）は Phase 2 以降に必要が生じてから検討する
