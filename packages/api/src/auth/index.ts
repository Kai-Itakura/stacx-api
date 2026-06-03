import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { sessionCookieName } from "./cookie";
import { callbackHandler } from "./routes/callback";
import { loginHandler } from "./routes/login";
import { logoutHandler } from "./routes/logout";
import { findAuthUser } from "./session";

/** 認証ルート（login / callback / logout）。/api/auth 配下にマウントする。 */
export const authApp = new Hono<AppEnv>()
  .get("/login/:provider", loginHandler)
  .get("/callback/:provider", callbackHandler)
  .post("/logout", logoutHandler);

/**
 * 保護ルートに適用する認証ミドルウェア。
 * Session Cookie → findAuthUser（純 SELECT）で検証し、c.var.user を注入する。
 * 無効・期限切れは 401。
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, sessionCookieName(c.env.APP_BASE_URL));
  if (!sessionId) return c.json({ error: "unauthorized" }, 401);

  const user = await findAuthUser(c.var.db, sessionId);
  if (!user) return c.json({ error: "unauthorized" }, 401);

  c.set("user", user);
  await next();
});
