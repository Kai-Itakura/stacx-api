import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { clearSessionCookie, sessionCookieName } from "../cookie";
import { deleteSession } from "../session";

/** POST /api/auth/logout — Session を削除し Cookie を失効させる。 */
export async function logoutHandler(c: Context<AppEnv>) {
  const sessionId = getCookie(c, sessionCookieName(c.env.APP_BASE_URL));
  if (sessionId) {
    await deleteSession(c.var.db, sessionId);
  }
  clearSessionCookie(c);
  return c.redirect(new URL("/", c.env.APP_BASE_URL).toString());
}
