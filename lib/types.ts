/** 整形モード。Typeless の「整形 / 話して編集 / 翻訳」に対応する。 */
export type Mode = "polish" | "edit" | "translate";

/** 出力文体。minutes だけは要点化・再構成を許可する特殊なトーン。 */
export type Tone = "business" | "formal" | "casual" | "notes" | "minutes";

/** どのエンジンが出力を作ったか。UI のバッジと相関する。 */
export type Engine = "claude" | "rules";

/** ルールベースに落ちた理由。engine === "rules" のときだけ意味を持つ。 */
export type FallbackReason = "no-api-key" | "auth" | "connection" | "refusal";

/**
 * 個人辞書の1エントリ。
 * from（音声認識が出しがちな表記のゆれ）を to（正しい表記）に寄せる。
 */
export type DictEntry = {
  from: string[];
  to: string;
};

export type PolishRequest = {
  mode: Mode;
  tone: Tone;
  /** BCP-47。translate モードでの出力先言語、それ以外では整形結果の言語。 */
  outputLang: string;
  /** 音声認識の生テキスト。edit モードでは「編集指示」になる。 */
  transcript: string;
  /** edit モードで書き換える対象テキスト。 */
  target?: string;
  dictionary?: DictEntry[];
};

export type HistoryItem = {
  id: string;
  at: number;
  mode: Mode;
  tone: Tone;
  raw: string;
  polished: string;
  engine: Engine;
};

export type Settings = {
  mode: Mode;
  tone: Tone;
  /** 音声認識の入力言語（BCP-47）。 */
  inputLang: string;
  /** 出力言語（BCP-47）。 */
  outputLang: string;
};

export const MODES: ReadonlyArray<{ value: Mode; label: string; hint: string }> = [
  { value: "polish", label: "整形", hint: "話した内容をそのまま送れる文章に" },
  { value: "edit", label: "話して編集", hint: "既存の文章を音声で書き換える" },
  { value: "translate", label: "翻訳", hint: "話した内容を指定言語へ" },
];

export const TONES: ReadonlyArray<{ value: Tone; label: string; hint: string }> = [
  { value: "business", label: "ビジネス", hint: "簡潔な敬体。社内外どちらにも" },
  { value: "formal", label: "改まった文体", hint: "社外向けの丁寧語・謙譲語" },
  { value: "casual", label: "カジュアル", hint: "同僚向けの砕けたですます調" },
  { value: "notes", label: "メモ", hint: "体言止めと箇条書き中心" },
  { value: "minutes", label: "議事録", hint: "決定事項・TODO に要点化" },
];

/** 音声認識の入力言語。Chrome のクラウド STT が実際に扱えるものに絞っている。 */
export const INPUT_LANGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ja-JP", label: "日本語" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "ko-KR", label: "한국어" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
];

export const OUTPUT_LANGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

export function isMode(v: unknown): v is Mode {
  return v === "polish" || v === "edit" || v === "translate";
}

export function isTone(v: unknown): v is Tone {
  return (
    v === "business" || v === "formal" || v === "casual" || v === "notes" || v === "minutes"
  );
}

export function labelForOutputLang(code: string): string {
  return OUTPUT_LANGS.find((l) => l.value === code)?.label ?? code;
}
