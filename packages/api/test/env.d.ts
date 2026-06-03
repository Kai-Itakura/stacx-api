import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Bindings } from "../src/types";

declare module "cloudflare:test" {
  // env / SELF が参照するバインディングの型。worker の Bindings に
  // テスト専用の TEST_MIGRATIONS を加える。
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}
