import Anthropic from "@anthropic-ai/sdk";

/**
 * 使用モデル。日付サフィックスは付けない（存在しないIDになる）。
 */
export const MODEL = "claude-opus-5";

/**
 * thinking と可視テキストがこの上限を共有する。
 * 整形結果の長さだけを見積もって小さくすると、thinking に食われて文の途中で切れる。
 */
export const MAX_TOKENS = 8192;

let client: Anthropic | null = null;
let proxyHintShown = false;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Node の global fetch は HTTPS_PROXY を自動では読まない。
 * プロキシ配下で鍵を設定した人には「鍵が不正」に見える接続エラーとして現れるので、
 * 一度だけ直し方を出しておく。
 */
function warnIfProxyUnwired(): void {
  if (proxyHintShown) return;
  proxyHintShown = true;
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY) return;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  if (noProxy.split(",").some((h) => h.trim() === "api.anthropic.com")) return;
  console.warn(
    "[notype] HTTPS_PROXY is set but Node's fetch ignores it. " +
      "Start the server with NODE_USE_ENV_PROXY=1 if requests to api.anthropic.com fail.",
  );
}

export function getClient(): Anthropic {
  warnIfProxyUnwired();
  client ??= new Anthropic();
  return client;
}
