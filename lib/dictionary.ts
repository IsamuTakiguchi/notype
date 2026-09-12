import type { DictEntry } from "./types";

/**
 * 個人辞書はユーザー入力であり、しかも system ブロックに載る唯一のユーザー由来データ。
 * 上限を設けて、プロンプト全体が辞書に乗っ取られないようにする。
 */
export const MAX_DICT_ENTRIES = 50;
export const MAX_DICT_FIELD_LENGTH = 100;
export const MAX_DICT_FROM_PER_ENTRY = 8;

/** C0 制御文字と DEL。ソースに生の制御文字を置かずに済むよう RegExp で組み立てる。 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/** 区切り子の乗っ取りを防ぐため、タグに見える文字列を全角に寄せる。 */
export function neutralizeTags(input: string): string {
  return input.replace(/<\s*\/?\s*(transcript|target)\s*>/gi, (m) =>
    m.replace(/</g, "＜").replace(/>/g, "＞").replace(/\//g, "／"),
  );
}

/** 改行・制御文字を除き、長さを詰めた1行に落とす。 */
function sanitizeField(raw: string): string {
  return neutralizeTags(
    raw.normalize("NFC").replace(CONTROL_CHARS, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DICT_FIELD_LENGTH);
}

/**
 * 辞書を正規化する。
 *
 * 並び順を固定するのが本質。プロンプトキャッシュはプレフィックスのバイト一致で
 * 判定されるので、同じ内容の辞書が呼び出しごとに違う順序で並ぶと、
 * エラーも警告も出ないまま毎回キャッシュミスして入力コストだけが膨らむ。
 */
export function normalizeDictionary(entries: readonly DictEntry[] | undefined): DictEntry[] {
  if (!entries?.length) return [];

  const byTo = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!entry || typeof entry.to !== "string" || !Array.isArray(entry.from)) continue;
    const to = sanitizeField(entry.to);
    if (!to) continue;

    const froms = byTo.get(to) ?? new Set<string>();
    for (const raw of entry.from) {
      if (typeof raw !== "string") continue;
      const from = sanitizeField(raw);
      // to と同一の from は変換として無意味なので落とす。
      if (!from || from === to) continue;
      froms.add(from);
      if (froms.size >= MAX_DICT_FROM_PER_ENTRY) break;
    }
    if (froms.size) byTo.set(to, froms);
  }

  return [...byTo.entries()]
    .map(([to, froms]) => ({ to, from: [...froms].sort(compareStrings) }))
    .sort((a, b) => compareStrings(a.to, b.to) || compareStrings(a.from[0] ?? "", b.from[0] ?? ""))
    .slice(0, MAX_DICT_ENTRIES);
}

/**
 * ロケール非依存の比較。localeCompare は環境の ICU データで結果が変わりうるため、
 * キャッシュキーの安定性を守る目的にはコードポイント順を使う。
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 辞書をテキストに機械的に適用する（ルールベース経路用）。
 * from が長いものから順に当てて、短い語が長い語を食い荒らすのを防ぐ。
 */
export function applyDictionary(text: string, entries: readonly DictEntry[]): string {
  const pairs = entries
    .flatMap((e) => e.from.map((from) => ({ from, to: e.to })))
    .sort((a, b) => b.from.length - a.from.length);

  let out = text;
  for (const { from, to } of pairs) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}
