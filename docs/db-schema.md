# データベース設計（ER 図）

StacX（Cloudflare D1 / SQLite）の全テーブルと関係。Drizzle スキーマ
（`packages/api/src/db/schema.ts`）が正典で、本図はその俯瞰用。

```mermaid
erDiagram
  users ||--o{ user_identities : "has"
  users ||--o{ sessions : "has"
  users ||--o{ projects : "owns"
  users ||--o{ tags : "owns"
  users ||--o{ memos : "owns"
  projects ||--o{ memos : "contains"
  memos ||--o{ memo_tags : "tagged by"
  tags ||--o{ memo_tags : "applied to"

  users {
    text id PK
    integer created_at
    integer updated_at
    integer last_login_at
  }

  user_identities {
    text id PK
    text user_id FK "→ users.id (cascade)"
    text provider "UQ(provider, provider_sub)"
    text provider_sub "UQ(provider, provider_sub)"
    text email
    integer email_verified
    text name
    text picture_url
    integer created_at
    integer updated_at
  }

  sessions {
    text id PK
    text user_id FK "→ users.id (cascade)"
    integer expires_at
    integer created_at
    text user_agent
    text ip_address
  }

  projects {
    text id PK
    text user_id FK "→ users.id (cascade)"
    text name
    integer start_date "null=進行中の開始"
    integer end_date "null なら進行中"
    text summary
    integer team_size
    text role
    text work_style
    text tech_stack "JSON 配列 default '[]'"
    integer created_at
    integer updated_at
  }

  tags {
    text id PK
    text user_id FK "→ users.id (cascade)"
    text name "UQ(user_id, name)"
    integer created_at
  }

  memos {
    text id PK
    text user_id FK "→ users.id (cascade)"
    text project_id FK "→ projects.id (cascade)"
    text title
    text body
    integer created_at
    integer updated_at
  }

  memo_tags {
    text memo_id PK_FK "→ memos.id (cascade)"
    text tag_id PK_FK "→ tags.id (cascade)"
  }
```

## 補足（grill / ADR で確定した設計意図）

- **時刻はすべて epoch ミリ秒**（Drizzle `timestamp_ms`）。
- **表示情報の正典は `user_identities`**。`users` は ID と時刻のみ持つ（[ADR 0002](./adr/0002-user-table-id-only.md)）。
- **`projects.tech_stack` は JSON 配列**。絞り込み軸にしないため正規化しない（grill 決定）。表示専用。
- **`tags` は第一級エンティティ**で `(user_id, name)` 一意。Memo とは `memo_tags` で多対多。タイムラインの絞り込み軸。
- **`memos` は Project とのコンポジション**。生成時に 1 つの Project へ固定的に属し移動しない。`project_id` は `ON DELETE CASCADE` で、Project 削除時に Memo も連鎖削除される（[ADR 0005](./adr/0005-project-deletion-cascades-memos.md)）。
- **`memo_tags` の両 FK も cascade**。Memo 削除・Tag 削除のどちらでも中間行が掃除される。
- **削除の連鎖の頂点は `users`**。アカウント削除で配下（identities / sessions / projects / tags / memos / memo_tags）がすべて消える。

> 注意: SQLite の `ON DELETE CASCADE` は FK 強制が有効な接続でのみ働く。D1 ランタイムでの実挙動は統合テストで検証する。
