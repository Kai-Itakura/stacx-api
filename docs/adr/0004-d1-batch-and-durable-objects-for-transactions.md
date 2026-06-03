# 書き込みの原子性は D1 の `db.batch()` で取り、対話的トランザクションが要る集約は Durable Objects に閉じる

新規ログイン時のアカウント作成は `users` / `user_identities` / `sessions` への複数 INSERT に分かれ、途中で落ちると「Identity を持たない孤児 User」が残り得る。これを `db.batch([...])` で原子化する。Drizzle には `db.transaction()` が生えているが、その実装（`drizzle-orm/d1/session.js`）は生 `BEGIN`/`COMMIT`/`ROLLBACK` を**個別の文として**発行しており、D1 は文をまたぐ対話的トランザクションをサポートしないため**原子性が成立しない**。よって D1 では `db.transaction()` を使わず、書き込みセットを事前確定して `db.batch()` に畳む方針とする。

ulid をアプリ側で先に採番する設計（[ADR 0002](./0002-user-table-id-only.md) と同じく ID 生成をアプリが握る）のおかげで、`users` の生成 ID を `user_identities` / `sessions` が参照するのに「INSERT して採番値を読み戻す往復」が不要になり、複数文を1つの batch に入れられる。事前 SELECT（新規/既存判定）と batch の間の競合は `UNIQUE(provider, provider_sub)` を最終防衛線として吸収する（アプリの事前 SELECT は判定のヒントにすぎず、真の保証は制約に置く）。

## Considered Options

- **`db.batch()`（採用）**: D1 唯一の本物の原子性プリミティブ。全文を暗黙トランザクションで atomic・順次実行。非対話的（途中結果で分岐できない）だが、callback は冒頭の SELECT で新規/既存を確定済みのため書き込みセットが分岐済みで、制約に当たらない。
- **`db.transaction()`**: 見かけ上は対話的に書けるが、D1 binding 経由では BEGIN/COMMIT が効かず各文が独立 auto-commit になり原子性が崩れる。「トランザクションで囲ったのに守られていない」事故になるため不採用。
- **トランザクションなし + 孤児許容**: `UNIQUE` で再試行は安全になるが、幽霊行が蓄積する。不採用。

## Consequences

- 対話的トランザクションが将来必要になったときの指針（上から順に試し、Durable Objects は最後の手段）:
  1. **分岐を SQL に押し込む**: `INSERT ... ON CONFLICT DO UPDATE` / `UPDATE ... WHERE` / CTE で「読んでから書き分ける」を1文の atomic な SQL に畳む。
  2. **楽観的並行制御 (OCC)**: `version`/`updated_at` 列 + `UPDATE ... WHERE id=? AND version=?` の rowsAffected を検査し、0 件なら読み直して再試行。
  3. **Durable Objects**: 複数ステップを直列化した read-modify-write が必須の集約は、その境界だけを1つの DO に閉じる。DO は単一スレッドで実行が直列化され、SQLite ストレージが同期トランザクション（`ctx.storage.transaction()`）を持つ。トレードオフはその集約がシングルライターになること。全データを DO に置かず「強整合が要る境界だけ DO、残りは D1」と住み分ける。
- Phase 1 では DO の出番はない。必要が生じた時点でこの順序で判断する。
