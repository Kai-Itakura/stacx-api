import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // Node 型に依存しないよう、標準の import.meta.url から migrations パスを導出する。
  const migrationsPath = new URL("./src/db/migrations", import.meta.url).pathname;
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              // setup でマイグレーション適用に使う。
              TEST_MIGRATIONS: migrations,
              // ルート / Provider テスト用のダミー認証情報（実通信はしない）。
              GOOGLE_CLIENT_ID: "test-client-id",
              GOOGLE_CLIENT_SECRET: "test-client-secret",
            },
          },
        },
      },
      coverage: {
        // workerd 内では v8 provider が動かないため istanbul を使う。
        provider: "istanbul" as const,
        reporter: ["text", "html"],
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
        // 現状値の少し下を床にしたラチェット。新規コードがテストを伴わず
        // 入ると下回って CI が落ちる。IdP への通信を伴う verify / callback
        // 成功分岐は意図的に未カバーのため branch は低めに設定。
        thresholds: {
          statements: 80,
          functions: 80,
          lines: 80,
          branches: 45,
        },
      },
    },
  };
});
