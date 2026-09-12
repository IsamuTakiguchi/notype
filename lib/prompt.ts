import type Anthropic from "@anthropic-ai/sdk";

import { neutralizeTags, normalizeDictionary } from "./dictionary";
import { DICTIONARY_HEADER, SYSTEM_CORE } from "./prompt.ja";
import { labelForOutputLang, type DictEntry, type Mode, type Tone } from "./types";

/**
 * 改行とタブ以外の C0 制御文字と DEL。
 * ソースに生の制御文字を置かずに済むよう RegExp で組み立てる。
 */
const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]",
  "g",
);

/** 1リクエストで受け付ける書き起こしの上限。これを超えたら 413 を返す。 */
export const MAX_TRANSCRIPT_LENGTH = 20_000;
export const MAX_TARGET_LENGTH = 20_000;

/**
 * 書き起こしを本文へ埋め込める形にする。
 *
 * 区切り子のエスケープが要点。話者は「スラッシュ トランスクリプト」と発話するだけで
 * タグを閉じられてしまうので、指示文だけの防御では足りない。
 */
export function sanitizeTranscript(raw: string, limit = MAX_TRANSCRIPT_LENGTH): string {
  return neutralizeTags(
    raw
      .normalize("NFC")
      // 改行とタブ以外の制御文字は落とす。
      .replace(CONTROL_CHARS_EXCEPT_WHITESPACE, ""),
  )
    .replace(/\r\n?/g, "\n")
    .slice(0, limit)
    .trim();
}

function renderDictionary(entries: readonly DictEntry[]): string {
  const lines = entries.map((e) => `- ${e.from.join(" / ")} → ${e.to}`);
  return `${DICTIONARY_HEADER}\n${lines.join("\n")}`;
}

export type SystemBlockInput = {
  mode: Mode;
  tone: Tone;
  outputLang: string;
  dictionary?: readonly DictEntry[];
};

/**
 * system を「安定 → 揮発」の順に並べたブロック列にする。
 *
 * A（不変の中核）と B（個人辞書）に cache_control を置き、
 * C（今回の設定）だけをキャッシュ境界の外に出す。C を意図的に3行に保つことで、
 * プロンプトのほぼ全量がキャッシュ対象のプレフィックスに収まる。
 */
export function buildSystemBlocks(input: SystemBlockInput): Anthropic.TextBlockParam[] {
  const dictionary = normalizeDictionary(input.dictionary);

  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_CORE, cache_control: { type: "ephemeral" } },
  ];

  if (dictionary.length) {
    blocks.push({
      type: "text",
      text: renderDictionary(dictionary),
      cache_control: { type: "ephemeral" },
    });
  }

  blocks.push({ type: "text", text: renderSettings(input) });

  return blocks;
}

function renderSettings({ mode, tone, outputLang }: SystemBlockInput): string {
  return [
    "## 今回の設定",
    `モード: ${mode}`,
    `トーン: ${tone}`,
    `出力言語: ${labelForOutputLang(outputLang)} (${outputLang})`,
  ].join("\n");
}

export type UserMessageInput = {
  mode: Mode;
  transcript: string;
  target?: string;
};

export function buildUserMessage(input: UserMessageInput): Anthropic.MessageParam[] {
  const transcript = sanitizeTranscript(input.transcript);
  const parts: string[] = [];

  if (input.mode === "edit") {
    const target = sanitizeTranscript(input.target ?? "", MAX_TARGET_LENGTH);
    parts.push(`<target>\n${target}\n</target>`);
  }

  parts.push(`<transcript>\n${transcript}\n</transcript>`);

  return [{ role: "user", content: parts.join("\n\n") }];
}
