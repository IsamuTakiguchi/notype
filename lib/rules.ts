import { applyDictionary, normalizeDictionary } from "./dictionary";
import type { DictEntry } from "./types";

/**
 * APIキーが無い / Claude に到達できないときに使う、決定論的な日本語整形。
 *
 * 設計方針は一貫して「迷ったら消さない」。
 * 掃除ツールが実在する語を消してしまうと、掃除が足りないツールより速く信頼を失う。
 * そのため箇条書き化・段落化・トーン適応・翻訳には一切手を出さない（モデルが要る）。
 * ここがやるのは フィラー除去 / 言い直しの解決 / 繰り返しの整理 / 表記の正規化 だけ。
 */

/**
 * それ自体が語として成立しない言いよどみ。後続を問わず削除してよい。
 * 長いものから並べる（正規表現の選択肢は先頭一致優先のため）。
 */
const HARD_FILLERS = [
  "なんていうか",
  "なんというか",
  "えーっと",
  "ええっと",
  "えーと",
  "ええと",
  "えっと",
  "あのー",
  "あのう",
  "そのー",
  "そのう",
  "うーん",
  "うーむ",
  "んーと",
  "えー",
  "あー",
  "んー",
];

/**
 * 他の文脈では実在する語。読点・空白が続く「間（ま）」の位置でのみ削除する。
 *
 * これを無条件に消すのが最もありがちな失敗で、
 * 「その資料」→「資料」、「あの件ですが」→「件ですが」を引き起こす。
 */
const SOFT_FILLERS = ["そうですね", "なんか", "まあ", "まぁ", "あの", "その", "ええ", "こう"];

/** 言い直しの合図。読点に挟まれている場合のみ「直前の節を捨てる」と解釈する。 */
const CORRECTION_MARKERS = [
  "じゃなくて",
  "ではなくて",
  "じゃなく",
  "ではなく",
  "訂正します",
  "訂正",
  "違いました",
  "違います",
  "違う",
  "ちがう",
  "いや",
];

/**
 * 句点を補ってよい後続語。
 * 「です/ます」の直後で文が切れていると確信できる場合に限りたいので、
 * 文頭に立つ語だけを列挙する。過剰分割は不足分割よりも読みにくい。
 */
const SENTENCE_STARTERS = [
  "それでは",
  "そして",
  "それから",
  "ところで",
  "ちなみに",
  "ただし",
  "なお",
  "また",
  "まず",
  "次に",
  "最後に",
  "以上",
  "よろしく",
  "ありがとう",
  "すみません",
  "今回",
  "今日",
  "本日",
  "明日",
  "昨日",
  "来週",
  "先週",
  "来月",
  "先月",
  "私",
  "僕",
  "弊社",
  "御社",
  "各位",
];

const JP_CHAR = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff66-\\uff9f\\u3005\\u3006";

function alt(words: readonly string[]): string {
  return words.map(escapeRegExp).join("|");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HARD_FILLER_RE = new RegExp(
  `(?<=^|[、。！？\\n\\s])(?:${alt(HARD_FILLERS)})(?![ぁ-ん])[、,\\s]*`,
  "g",
);

const SOFT_FILLER_RE = new RegExp(
  `(?<=^|[、。！？\\n\\s])(?:${alt(SOFT_FILLERS)})(?=[、,\\s])[、,\\s]*`,
  "g",
);

/** 「A、<言い直しの合図>、B」から A と合図を落とす。 */
const CORRECTION_RE = new RegExp(
  `[^、。！？\\n]{1,40}、\\s*(?:あ、?\\s*)?(?:${alt(CORRECTION_MARKERS)})、\\s*`,
  "g",
);

/** 前の節が既に句点で閉じている場合の、宙に浮いた「あ、違う、」。 */
const DANGLING_CORRECTION_RE = /(^|[。！？\n])\s*(?:あ、\s*)?(?:違いました|違います|違う|ちがう)、\s*/g;

/**
 * 区切りを挟んだ直後の反復。「資料を、資料をですね」→「資料をですね」。
 *
 * 先読みならぬ後読みで開始位置を縛るのが要点。日本語には語境界が無いので
 * 任意位置から始めたいが、それをラテン文字にも許すと "This is a test" の
 * "Th|is| |is|" が反復と見なされて "This a test" になる。
 * 直前が行頭・約物・空白・日本語文字のときだけ許可する。
 */
const REPETITION_RE = new RegExp(
  `(?<=^|[、。！？,\\n\\s]|[${JP_CHAR}])([^、。！？\\n]{2,12})(?:[、,]|\\s)+\\1`,
  "g",
);

const SENTENCE_BREAK_RE = new RegExp(
  `(でした|ました|ません|です|ます)(?![ぁ-んー])(?=(?:${alt(SENTENCE_STARTERS)}))`,
  "g",
);

/** 全角英数を半角へ。日本語の約物（、。！？）は全角のまま残す。 */
function toHalfWidthAlnum(text: string): string {
  return text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 半角カナを全角へ。濁点の合成は NFKC に任せる。 */
function toFullWidthKana(text: string): string {
  return text.replace(/[｡-ﾟ]+/g, (run) => run.normalize("NFKC"));
}

function normalizeText(text: string): string {
  let out = text.normalize("NFC");
  out = toFullWidthKana(out);
  out = toHalfWidthAlnum(out);
  // 全角スペースは半角に寄せてから、日本語の字間に紛れ込んだ空白だけを畳む。
  out = out.replace(/　/g, " ");
  out = out.replace(new RegExp(`(?<=[${JP_CHAR}]) +(?=[${JP_CHAR}])`, "g"), "");
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

function collapseElongation(text: string): string {
  return text
    .replace(/ー{2,}/g, "ー")
    .replace(/〜{2,}/g, "〜")
    .replace(/っ{2,}/g, "っ")
    .replace(/ッ{2,}/g, "ッ");
}

/** 収束するまで繰り返す。1パスでは隣接した反復や連続フィラーを取り切れない。 */
function applyUntilStable(text: string, fn: (s: string) => string, maxPasses = 5): string {
  let current = text;
  for (let i = 0; i < maxPasses; i += 1) {
    const next = fn(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function tidyPunctuation(text: string): string {
  return text
    .replace(/[ \t]+([、。！？])/g, "$1")
    .replace(/、{2,}/g, "、")
    .replace(/。{2,}/g, "。")
    .replace(/、(?=[。！？])/g, "")
    .replace(/(^|[。！？\n])[、\s]+/g, "$1")
    .replace(/[ \t]+$/gm, "");
}

function finishLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  // 末尾の読点は句点にする（言い切らずに録音を止めたときによく残る）。
  const closed = trimmed.replace(/[、,]+$/, "。");
  if (/[。！？!?…」』）)\]]$/.test(closed)) return closed;
  // 箇条書き行に句点は付けない。
  if (/^[-•・]/.test(closed)) return closed;
  // 日本語を含まない行（英語だけの発話など）に句点を足すと不自然になる。
  return new RegExp(`[${JP_CHAR}]`).test(closed) ? `${closed}。` : closed;
}

export type RulePolishOptions = {
  dictionary?: readonly DictEntry[];
};

export function polishWithRules(input: string, options: RulePolishOptions = {}): string {
  if (typeof input !== "string" || !input.trim()) return "";

  const dictionary = normalizeDictionary(options.dictionary);

  const lines = normalizeText(input).split(/\r?\n/);

  const polished = lines.map((line) => {
    if (!line.trim()) return "";

    let out = collapseElongation(line);
    out = applyUntilStable(out, (s) => s.replace(HARD_FILLER_RE, ""));
    out = applyUntilStable(out, (s) => s.replace(SOFT_FILLER_RE, ""));
    // 行頭の「はい、」だけは相槌として落とす。文中の「はい」は答えとして意味を持ちうる。
    out = out.replace(/^はい[、,]\s*/, "");
    // 言い直しの解決はフィラー除去の後。先に走らせると読点の並びがまだ整っていない。
    out = applyUntilStable(out, (s) => s.replace(CORRECTION_RE, ""));
    out = out.replace(DANGLING_CORRECTION_RE, "$1");
    out = applyUntilStable(out, (s) => s.replace(REPETITION_RE, "$1"));
    out = out.replace(SENTENCE_BREAK_RE, "$1。");
    out = tidyPunctuation(out);
    if (dictionary.length) out = applyDictionary(out, dictionary);
    return finishLine(out);
  });

  return polished.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
