import { applyD1Migrations, env } from "cloudflare:test";

// テスト用 D1 にスキーマを適用する（applyD1Migrations は適用済みを追跡し冪等）。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
