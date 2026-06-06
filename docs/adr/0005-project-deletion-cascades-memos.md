# Project の削除は配下の Memo をカスケード削除する

Memo は生成時に 1 つの Project へ固定的に属し、別の Project へ移動することはない（コンポジション）。よって Project を削除したとき配下の Memo を他へ退避する概念が存在せず、`memos.project_id → projects` の外部キーを `ON DELETE CASCADE` とし、Project 削除時に Memo も一緒に消す。

## Considered Options

- **`CASCADE`（採用）**: Memo はプロジェクト横断の意味を持たないため、親が消えれば子も消えるのが自然。メモ移動機能・孤児メモ処理が一切不要になり、モデルが最小になる。
- **`RESTRICT`（メモを持つ Project の削除をブロックし 409）**: アプリ中核資産であるメモの巻き添え消失を DB レベルで防げる。ただし「削除前にメモを移動する」概念を要求するが、本ドメインに Project 間のメモ移動は存在しないため、ユーザーには「全メモを個別削除してからでないと Project を消せない」という不毛な摩擦だけが残る。
- **Project の論理削除（アーカイブ）**: メモを残したまま Project を隠せるが、「進行中/終了」とは別の状態管理を Phase 1 に持ち込むのは過剰。

## Consequences

- アプリ中核資産が FK cascade 配下に入るため、Project 削除 API は破壊範囲（配下メモ件数）を呼び出し側に明示し、UI で明確な確認を取る前提とする。「うっかり削除」を防ぐ責務はアプリ層に移る。
- `deleteProject` は所有者の Project を削除でき、SQLite の cascade で memos / memo_tags も連鎖削除される（`memo_tags → memos` も CASCADE 前提）。
