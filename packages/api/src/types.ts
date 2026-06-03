import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { AuthUser } from "./auth/session";
import type * as schema from "./db/schema";

export type Bindings = {
  DB: D1Database;
  /** コールバック URL とリダイレクトの基点。https/http で本番/ローカルを判定する。 */
  APP_BASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

export type Variables = {
  db: DrizzleD1Database<typeof schema>;
  /** 認証ミドルウェアが保護ルートで注入する。 */
  user: AuthUser;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
