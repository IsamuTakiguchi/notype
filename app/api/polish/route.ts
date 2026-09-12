import type Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";

import { getClient, hasApiKey, MAX_TOKENS, MODEL } from "@/lib/claude";
import {
  buildSystemBlocks,
  buildUserMessage,
  MAX_TARGET_LENGTH,
  MAX_TRANSCRIPT_LENGTH,
} from "@/lib/prompt";
import { polishWithRules } from "@/lib/rules";
import { isMode, isTone, type DictEntry, type FallbackReason, type PolishRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 長い議事録は effort:"low" でも 20〜30 秒かかることがある。
export const maxDuration = 60;

/** モデルが応答を拒否した（HTTP 200 + stop_reason:"refusal"）ことを示す内部エラー。 */
class RefusalError extends Error {
  constructor(readonly category: string | null) {
    super("model refused the request");
  }
}

/** max_tokens に達して出力が途中で切れたことを示す内部エラー。 */
class TruncatedError extends Error {}

function textResponse(
  body: BodyInit | null,
  engine: "claude" | "rules",
  reason?: FallbackReason,
): Response {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    // リバースプロキシによるバッファリングを止める。これが無いとストリームが最後にまとめて届く。
    "x-accel-buffering": "no",
    "x-notype-engine": engine,
  });
  if (reason) headers.set("x-notype-fallback-reason", reason);
  return new Response(body, { status: 200, headers });
}

function errorResponse(status: number, error: string, extra?: HeadersInit): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function rulesResponse(transcript: string, dictionary: DictEntry[], reason: FallbackReason) {
  return textResponse(polishWithRules(transcript, { dictionary }), "rules", reason);
}

type ValidationError = { status: number; message: string };

function validate(raw: unknown): PolishRequest | ValidationError {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { status: 400, message: "リクエストボディが不正です。" };
  }
  const body = raw as Record<string, unknown>;

  if (!isMode(body.mode)) return { status: 400, message: "mode が不正です。" };
  if (!isTone(body.tone)) return { status: 400, message: "tone が不正です。" };

  const outputLang = typeof body.outputLang === "string" ? body.outputLang : "ja";
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(outputLang)) {
    return { status: 400, message: "outputLang が不正です。" };
  }

  if (typeof body.transcript !== "string") {
    return { status: 400, message: "transcript が必要です。" };
  }
  if (body.transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { status: 413, message: `transcript が長すぎます（上限 ${MAX_TRANSCRIPT_LENGTH} 文字）。` };
  }

  const target = typeof body.target === "string" ? body.target : undefined;
  if (target && target.length > MAX_TARGET_LENGTH) {
    return { status: 413, message: `target が長すぎます（上限 ${MAX_TARGET_LENGTH} 文字）。` };
  }
  if (body.mode === "edit" && !target?.trim()) {
    return { status: 400, message: "話して編集モードには書き換え対象のテキストが必要です。" };
  }

  const dictionary = Array.isArray(body.dictionary) ? (body.dictionary as DictEntry[]) : undefined;

  return { mode: body.mode, tone: body.tone, outputLang, transcript: body.transcript, target, dictionary };
}

/**
 * Claude の出力をテキスト片として順に流す。
 *
 * ジェネレータにしてあるのは、最初の1片を「覗いてから」レスポンスを組み立てたいから。
 * 認証エラーや接続エラーは最初の1片より前に出るので、そこで捕まえられれば
 * ヘッダをまだ確定していないうちにルールベースへ切り替えられる。
 */
async function* claudeChunks(
  params: Anthropic.MessageCreateParamsStreaming,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const stream = getClient().messages.stream(params, { signal });
  let finished = false;
  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    finished = true;

    const final = await stream.finalMessage();
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[notype] cache read=${final.usage.cache_read_input_tokens ?? 0} ` +
          `write=${final.usage.cache_creation_input_tokens ?? 0} out=${final.usage.output_tokens}`,
      );
    }
    // refusal は例外ではなく HTTP 200 で返る。content を読む前に必ず確認する。
    if (final.stop_reason === "refusal") {
      throw new RefusalError(final.stop_details?.category ?? null);
    }
    if (final.stop_reason === "max_tokens") throw new TruncatedError();
  } finally {
    // 呼び出し側が途中で読むのをやめた場合に、上流のリクエストも畳む。
    if (!finished) stream.abort();
  }
}

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return errorResponse(400, "JSON として解釈できませんでした。");
  }

  const result = validate(parsed);
  if ("status" in result) return errorResponse(result.status, result.message);

  const { mode, tone, outputLang, transcript, target, dictionary } = result;
  const dict = dictionary ?? [];

  if (!transcript.trim()) return textResponse("", "claude");

  // 鍵が無いのは異常ではない。UI 全体を触れる状態に保つほうが価値が高い。
  if (!hasApiKey()) return rulesResponse(transcript, dict, "no-api-key");

  const params: Anthropic.MessageCreateParamsStreaming = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // thinking は渡さない（Opus 5 は adaptive が既定）。
    // 無効化すると <thinking> タグが可視応答に漏れることがあり、
    // 「そのまま貼る文章」が全出力の本アプリでは致命的になる。
    output_config: { effort: "low" },
    system: buildSystemBlocks({ mode, tone, outputLang, dictionary: dict }),
    messages: buildUserMessage({ mode, transcript, target }),
    stream: true,
  };

  const chunks = claudeChunks(params, req.signal);

  let first: IteratorResult<string>;
  try {
    first = await chunks.next();
  } catch (error) {
    const fallback = classifyBeforeFirstByte(error);
    if (fallback) return rulesResponse(transcript, dict, fallback.reason);
    return mapHardError(error);
  }

  // モデルが何も返さなかった場合（意味のある発話が無かった）。出力契約どおり空で返す。
  if (first.done) return textResponse("", "claude");

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(first.value));
        for await (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        if (error instanceof APIUserAbortError) {
          // クライアントは既にいない。静かに畳む。
          controller.close();
          return;
        }
        // 1バイト送出後はステータスを変えられないので、ストリームを異常終了させる。
        // クライアント側は受け取り済みの部分を保持したまま「中断」を表示する。
        console.error("[notype] stream failed mid-flight:", error);
        controller.error(error);
      }
    },
    cancel() {
      void chunks.return(undefined);
    },
  });

  return textResponse(body, "claude");
}

/** 最初の1バイトより前に出たエラーのうち、ルールベースで受け止めるべきものを判定する。 */
function classifyBeforeFirstByte(error: unknown): { reason: FallbackReason } | null {
  if (error instanceof RefusalError) return { reason: "refusal" };
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    console.error("[notype] ANTHROPIC_API_KEY が拒否されました。設定を確認してください。", error);
    return { reason: "auth" };
  }
  if (error instanceof APIConnectionError) return { reason: "connection" };
  return null;
}

/** ルールベースで受け止めない種類のエラーを、意味のあるステータスに落とす。 */
function mapHardError(error: unknown): Response {
  if (error instanceof APIUserAbortError) {
    return new Response(null, { status: 499 });
  }
  if (error instanceof RateLimitError) {
    // ここでルールベースに落とすと、再試行すれば本来の品質が得られる場面で
    // 黙って品質を下げることになる。素直に待ってもらう。
    const retryAfter = error.headers?.get?.("retry-after");
    return errorResponse(429, "混み合っています。少し待ってから再試行してください。", {
      ...(retryAfter ? { "retry-after": retryAfter } : {}),
    });
  }
  if (error instanceof TruncatedError) {
    return errorResponse(500, "出力が長すぎて途中で切れました。");
  }
  if (error instanceof BadRequestError) {
    console.error("[notype] リクエスト組み立ての不具合:", error);
    return errorResponse(500, "サーバー側の不具合でリクエストを組み立てられませんでした。");
  }
  if (error instanceof InternalServerError) {
    return errorResponse(503, "モデル側が一時的に応答できません。");
  }
  if (error instanceof APIError) {
    console.error("[notype] Claude API エラー:", error);
    return errorResponse(502, "モデルへの問い合わせに失敗しました。");
  }
  console.error("[notype] 想定外のエラー:", error);
  return errorResponse(500, "想定外のエラーが発生しました。");
}
