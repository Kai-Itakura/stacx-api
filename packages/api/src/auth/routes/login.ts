import { generateCodeVerifier, generateState } from "arctic";
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { setTempCookies } from "../cookie";
import { getProvider, isProviderId } from "../providers/registry";

/** GET /api/auth/login/:provider — 認可エンドポイントへリダイレクトする。 */
export async function loginHandler(c: Context<AppEnv>) {
  const providerId = c.req.param("provider");
  if (!providerId || !isProviderId(providerId)) return c.notFound();

  const provider = getProvider(providerId, c.env);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = provider.createAuthorizationURL(state, codeVerifier);

  setTempCookies(c, state, codeVerifier);
  return c.redirect(url.toString());
}
