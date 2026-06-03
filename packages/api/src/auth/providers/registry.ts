import { createGoogleProvider, type GoogleProviderEnv } from "./google";
import type { Provider, ProviderId } from "./types";

/**
 * 全 Provider の構築に必要な環境変数の合併。
 * Phase 2 で GitHub を足すときは GitHubProviderEnv を & で合流させる。
 */
export type ProviderEnv = GoogleProviderEnv;

/**
 * ProviderId → ファクトリ の対応表。
 * IdP を追加するときはここに 1 行足すだけでよい。
 */
const factories: Record<ProviderId, (env: ProviderEnv) => Provider> = {
  google: createGoogleProvider,
};

/** 文字列が実装済み ProviderId かを判定する（ルートパラメータの検証用）。 */
export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(factories, value);
}

/** 指定 Provider を環境変数から構築する。 */
export function getProvider(id: ProviderId, env: ProviderEnv): Provider {
  return factories[id](env);
}
