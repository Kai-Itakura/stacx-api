import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { loginWithIdentity } from "../account";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  clearTempCookies,
  setSessionCookie,
} from "../cookie";
import type { IdentityProfile } from "../providers/types";
import { getProvider, isProviderId } from "../providers/registry";

function redirectToLoginError(c: Context<AppEnv>, code: string) {
  const url = new URL("/login", c.env.APP_BASE_URL);
  url.searchParams.set("error", code);
  return c.redirect(url.toString());
}

/** GET /api/auth/callback/:provider — code を検証し Session を発行する。 */
export async function callbackHandler(c: Context<AppEnv>) {
  const providerId = c.req.param("provider");
  if (!providerId || !isProviderId(providerId)) return c.notFound();

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, OAUTH_STATE_COOKIE);
  const codeVerifier = getCookie(c, OAUTH_VERIFIER_COOKIE);
  clearTempCookies(c);

  // state 照合（CSRF 対策）。欠落・不一致はすべてログイン画面へ。
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return redirectToLoginError(c, "state_mismatch");
  }

  const provider = getProvider(providerId, c.env);
  let profile: IdentityProfile;
  try {
    profile = await provider.verify(code, codeVerifier);
  } catch {
    return redirectToLoginError(c, "oauth_failed");
  }

  const issued = await loginWithIdentity(c.var.db, profile, {
    userAgent: c.req.header("user-agent") ?? null,
    ipAddress: c.req.header("cf-connecting-ip") ?? null,
  });

  setSessionCookie(c, issued.id, issued.expiresAt);
  return c.redirect(new URL("/", c.env.APP_BASE_URL).toString());
}
