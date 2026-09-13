import type { Mode, Tone } from "./types";

/**
 * iOS ショートカット向けの案内に使う値。
 *
 * iOS のキーボード拡張はマイクを使えないため（Apple のサンドボックス制約）、
 * ネイティブアプリを書かずに iPhone から使う現実的な経路がショートカットになる。
 * 音声認識は Apple 自身のものを使い、整形だけこのサーバに投げる。
 */

export type ShortcutRecipeInput = {
  /** デプロイ先のオリジン。ブラウザ側で location.origin から埋める。 */
  origin: string;
  mode: Mode;
  tone: Tone;
  outputLang: string;
};

export function polishEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/polish`;
}

/**
 * 「URLの内容を取得」アクションのリクエストボディ。
 *
 * transcript の値だけは、ショートカット側で「テキストを音声入力」の結果を
 * 変数として差し込む。ここではその位置が分かるプレースホルダを置く。
 */
export const TRANSCRIPT_PLACEHOLDER = "（ここに「音声入力したテキスト」変数を入れる）";

export function requestBodyFields(
  input: Omit<ShortcutRecipeInput, "origin">,
): ReadonlyArray<{ key: string; value: string }> {
  return [
    { key: "mode", value: input.mode },
    { key: "tone", value: input.tone },
    { key: "outputLang", value: input.outputLang },
    { key: "transcript", value: TRANSCRIPT_PLACEHOLDER },
  ];
}

/** curl での動作確認用。ショートカットを作る前に手元で試せる。 */
export function curlExample(input: ShortcutRecipeInput): string {
  const body = JSON.stringify(
    { mode: input.mode, tone: input.tone, outputLang: input.outputLang, transcript: "えーと、明日は晴れです。" },
    null,
    2,
  );
  return [
    `curl -X POST ${polishEndpoint(input.origin)} \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '${body.replace(/\n/g, "\n  ")}'`,
  ].join("\n");
}
