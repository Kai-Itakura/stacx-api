import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../types";

export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_code_verifier";

/** 一時 Cookie（state / code_verifier）の有効期限。10 分。 */
const TEMP_COOKIE_MAX_AGE_SEC = 600;

function isSecureBaseUrl(appBaseUrl: string): boolean {
  return appBaseUrl.startsWith("https://");
}

/**
 * Session Cookie 名。本番(https)は __Host- プレフィックス付き、
 * ローカル(http)は無印。発行側と読取側（ミドルウェア）で必ず一致させる。
 */
export function sessionCookieName(appBaseUrl: string): string {
  return isSecureBaseUrl(appBaseUrl) ? "__Host-stacx_session" : "stacx_session";
}

export function setSessionCookie(c: Context<AppEnv>, value: string, expiresAt: Date): void {
  setCookie(c, sessionCookieName(c.env.APP_BASE_URL), value, {
    httpOnly: true,
    // localhost も secure context のため Secure は常時付与する。
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, sessionCookieName(c.env.APP_BASE_URL), { path: "/", secure: true });
}

/** ログイン開始時に state / code_verifier を一時 Cookie へ保存する。 */
export function setTempCookies(c: Context<AppEnv>, state: string, codeVerifier: string): void {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: TEMP_COOKIE_MAX_AGE_SEC,
  } as const;
  setCookie(c, OAUTH_STATE_COOKIE, state, options);
  setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, options);
}

/** コールバックで一時 Cookie を失効させる。 */
export function clearTempCookies(c: Context<AppEnv>): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/", secure: true });
  deleteCookie(c, OAUTH_VERIFIER_COOKIE, { path: "/", secure: true });
}
