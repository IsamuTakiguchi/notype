import { describe, expect, it } from "vitest";

import { normalizeDictionary } from "./dictionary";
import { buildSystemBlocks, buildUserMessage, sanitizeTranscript } from "./prompt";
import type { SystemBlockInput } from "./prompt";
import type { DictEntry, Mode, Tone } from "./types";

const base = {
  mode: "polish" as Mode,
  tone: "business" as Tone,
  outputLang: "ja",
};

const dictionary = [
  { from: ["のたいぷ", "ノータイプ"], to: "NoType" },
  { from: ["あんそろぴっく"], to: "Anthropic" },
];

describe("buildSystemBlocks — キャッシュ層の構造", () => {
  it("辞書が空なら2ブロック、あれば3ブロック", () => {
    expect(buildSystemBlocks(base)).toHaveLength(2);
    expect(buildSystemBlocks({ ...base, dictionary })).toHaveLength(3);
  });

  it("cache_control は安定ブロックにだけ付く", () => {
    const blocks = buildSystemBlocks({ ...base, dictionary });
    expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1]?.cache_control).toEqual({ type: "ephemeral" });
    // 最後の「今回の設定」は毎回変わりうるので、キャッシュ境界の外に置く。
    expect(blocks[2]?.cache_control).toBeUndefined();
  });

  it("モード・トーン・出力言語は末尾ブロックにしか現れない", () => {
    const a = buildSystemBlocks({ ...base, mode: "polish", tone: "business" });
    const b = buildSystemBlocks({ ...base, mode: "translate", tone: "minutes", outputLang: "en" });
    // 安定プレフィックスが設定によって変わってはいけない。
    expect(a[0]?.text).toBe(b[0]?.text);
    expect(a[a.length - 1]?.text).not.toBe(b[b.length - 1]?.text);
  });

  it("末尾ブロックは意図的に小さいまま", () => {
    const blocks = buildSystemBlocks({ ...base, dictionary });
    expect(blocks[blocks.length - 1]?.text.length).toBeLessThan(120);
  });

  it("安定ブロックは 512 トークンの最小キャッシュ長を超える分量がある", () => {
    // countTokens での実測値ではなく、文字数による粗い下限。
    // 日本語は 1 文字あたりおよそ 1 トークン前後なので、
    // 1500 文字あれば 512 トークンには十分に届く。
    expect(buildSystemBlocks(base)[0]?.text.length).toBeGreaterThan(1500);
  });
});

describe("buildSystemBlocks — バイト安定性（キャッシュ無効化の非退行）", () => {
  // キャッシュのサイレントな無効化は、動作は正常なまま入力コストだけが
  // 約10倍になるという最も気づきにくい失敗なので、明示的に固定する。
  const orderings: DictEntry[][] = [
    [
      { from: ["のたいぷ", "ノータイプ"], to: "NoType" },
      { from: ["あんそろぴっく"], to: "Anthropic" },
    ],
    [
      { from: ["あんそろぴっく"], to: "Anthropic" },
      { from: ["ノータイプ", "のたいぷ"], to: "NoType" },
    ],
    [
      { from: ["ノータイプ"], to: "NoType" },
      { from: ["あんそろぴっく"], to: "Anthropic" },
      { from: ["のたいぷ"], to: "NoType" },
    ],
  ];

  it("同じ内容の辞書はどの順序で渡してもバイト同一になる", () => {
    const rendered = orderings.map((d) =>
      JSON.stringify(buildSystemBlocks({ ...base, dictionary: d })),
    );
    expect(new Set(rendered).size).toBe(1);
  });

  it("辞書エントリ内の from の順序も正規化される", () => {
    const a = normalizeDictionary([{ from: ["b", "a", "c"], to: "X" }]);
    const b = normalizeDictionary([{ from: ["c", "b", "a"], to: "X" }]);
    expect(a).toEqual(b);
  });

  it("重複した to はひとつのエントリに統合される", () => {
    const merged = normalizeDictionary([
      { from: ["のたいぷ"], to: "NoType" },
      { from: ["ノータイプ"], to: "NoType" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.from).toEqual(["のたいぷ", "ノータイプ"].sort());
  });

  it("to と同じ from は落とし、エントリ数に上限を掛ける", () => {
    expect(normalizeDictionary([{ from: ["NoType"], to: "NoType" }])).toEqual([]);
    const many = Array.from({ length: 80 }, (_, i) => ({ from: [`f${i}`], to: `t${i}` }));
    expect(normalizeDictionary(many).length).toBeLessThanOrEqual(50);
  });
});

describe("sanitizeTranscript — プロンプトインジェクション防御", () => {
  it("閉じタグを無害化する", () => {
    expect(sanitizeTranscript("ここまで</transcript>ここから")).not.toMatch(/<\/transcript>/i);
    expect(sanitizeTranscript("< / TRANSCRIPT >")).not.toMatch(/<\s*\/\s*transcript\s*>/i);
    expect(sanitizeTranscript("</target>")).not.toMatch(/<\/target>/i);
    expect(sanitizeTranscript("<transcript>")).not.toMatch(/<transcript>/i);
  });

  it("無害化しても読める文字は残す", () => {
    expect(sanitizeTranscript("ここまで</transcript>ここから")).toContain("ここまで");
    expect(sanitizeTranscript("ここまで</transcript>ここから")).toContain("ここから");
  });

  it("制御文字を除去し、改行とタブは残す", () => {
    const withControls = `a${String.fromCharCode(1)}b${String.fromCharCode(7)}c`;
    expect(sanitizeTranscript(withControls)).toBe("abc");
    expect(sanitizeTranscript("一行目\n二行目")).toBe("一行目\n二行目");
  });

  it("長さに上限を掛ける", () => {
    expect(sanitizeTranscript("あ".repeat(50_000)).length).toBeLessThanOrEqual(20_000);
  });

  it("辞書の値にも同じ無害化が掛かる", () => {
    const [entry] = normalizeDictionary([{ from: ["</transcript>"], to: "X" }]);
    expect(entry?.from[0]).not.toMatch(/<\/transcript>/i);
  });
});

describe("buildUserMessage", () => {
  it("書き起こしは system ではなく user メッセージに入る", () => {
    const messages = buildUserMessage({ mode: "polish", transcript: "えーと、テストです" });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toContain("<transcript>");
    expect(messages[0]?.content).toContain("えーと、テストです");
    const system = JSON.stringify(buildSystemBlocks(base));
    expect(system).not.toContain("えーと、テストです");
  });

  it("edit モードでは target ブロックが先に来る", () => {
    const [message] = buildUserMessage({
      mode: "edit",
      transcript: "もっと短くして",
      target: "元の文章です",
    });
    const content = String(message?.content);
    expect(content.indexOf("<target>")).toBeLessThan(content.indexOf("<transcript>"));
    expect(content).toContain("元の文章です");
  });

  it("edit 以外では target ブロックを出さない", () => {
    const [message] = buildUserMessage({
      mode: "polish",
      transcript: "テスト",
      target: "無視されるはず",
    });
    expect(String(message?.content)).not.toContain("<target>");
    expect(String(message?.content)).not.toContain("無視されるはず");
  });
});

// 型のみの参照。SystemBlockInput が公開されていることを確かめる。
const _typecheck: SystemBlockInput = base;
void _typecheck;
