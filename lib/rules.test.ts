import { describe, expect, it } from "vitest";
import { polishWithRules } from "./rules";

describe("polishWithRules — フィラー除去", () => {
  const cases: Array<[string, string]> = [
    ["えーと、明日は晴れです。", "明日は晴れです。"],
    ["ええと、始めます。", "始めます。"],
    ["えっと、これでいきます。", "これでいきます。"],
    ["あのー、質問があります。", "質問があります。"],
    ["そのー、確認させてください。", "確認させてください。"],
    ["うーん、難しいですね。", "難しいですね。"],
    ["なんていうか、少し違います。", "少し違います。"],
    ["まあ、そういうことです。", "そういうことです。"],
    ["なんか、うまくいきました。", "うまくいきました。"],
    ["こう、全体を見直します。", "全体を見直します。"],
    ["そうですね、進めましょう。", "進めましょう。"],
    ["はい、承知しました。", "承知しました。"],
    ["えーと、あのー、まあ、始めます。", "始めます。"],
  ];

  it.each(cases)("%s → %s", (input, expected) => {
    expect(polishWithRules(input)).toBe(expected);
  });
});

describe("polishWithRules — 非退行：実在する語を消さない", () => {
  // 「迷ったら消さない」を守れているかを見る、このスイートで最も重要なブロック。
  const cases: Array<[string, string]> = [
    ["その本を読みました。", "その本を読みました。"],
    ["あの件ですが、進捗はどうですか。", "あの件ですが、進捗はどうですか。"],
    ["人々が集まった。", "人々が集まった。"],
    ["色々ありました。", "色々ありました。"],
    ["いろいろ試しました。", "いろいろ試しました。"],
    ["様々な意見が出ました。", "様々な意見が出ました。"],
    ["段々よくなっています。", "段々よくなっています。"],
    ["それぞれ担当を決めます。", "それぞれ担当を決めます。"],
    ["時々確認しています。", "時々確認しています。"],
    ["そのまま進めてください。", "そのまま進めてください。"],
    ["あのときの判断は正しかった。", "あのときの判断は正しかった。"],
    ["ますます忙しくなります。", "ますます忙しくなります。"],
    ["彼を励ます人がいます。", "彼を励ます人がいます。"],
    ["よろしければご連絡ください。", "よろしければご連絡ください。"],
  ];

  it.each(cases)("%s は変わらない", (input, expected) => {
    expect(polishWithRules(input)).toBe(expected);
  });
});

describe("polishWithRules — 言い直しの解決", () => {
  it("「あ、違う」で直前の節を捨てる", () => {
    expect(polishWithRules("会議は、10時から、あ、違う、11時からです。")).toBe(
      "会議は、11時からです。",
    );
  });

  it("「じゃなくて」で直前の節を捨てる", () => {
    expect(polishWithRules("担当は、田中さん、じゃなくて、佐藤さんです。")).toBe(
      "担当は、佐藤さんです。",
    );
  });

  it("「いや」で直前の節を捨てる", () => {
    expect(polishWithRules("金曜日、いや、木曜日に送ります。")).toBe("木曜日に送ります。");
  });

  it("読点で挟まれていない「じゃなくて」は文法表現として残す", () => {
    // 「AじゃなくてB」は言い直しではなく対比の構文でもある。読点が無ければ触らない。
    expect(polishWithRules("難しいんじゃなくて面倒なだけです。")).toBe(
      "難しいんじゃなくて面倒なだけです。",
    );
  });

  it("句点の後に宙に浮いた訂正も落とす", () => {
    expect(polishWithRules("10時からです。あ、違う、11時からです。")).toBe(
      "10時からです。11時からです。",
    );
  });
});

describe("polishWithRules — 繰り返しの整理", () => {
  it("区切りを挟んだ反復を1回にまとめる", () => {
    expect(polishWithRules("資料を、資料をですね、三点用意しています。")).toBe(
      "資料をですね、三点用意しています。",
    );
  });

  it("3回以上の反復も収束するまで畳む", () => {
    expect(polishWithRules("すみません、すみません、すみません、遅れました。")).toBe(
      "すみません、遅れました。",
    );
  });

  it("区切りの無い畳語は畳まない", () => {
    expect(polishWithRules("だんだん暖かくなります。")).toBe("だんだん暖かくなります。");
  });
});

describe("polishWithRules — 表記の正規化", () => {
  it("全角英数を半角にする", () => {
    expect(polishWithRules("１０時に集合です。")).toBe("10時に集合です。");
  });

  it("半角カナを全角にする", () => {
    expect(polishWithRules("ﾐｰﾃｨﾝｸﾞを設定します。")).toBe("ミーティングを設定します。");
  });

  it("日本語の字間に入った空白を畳む", () => {
    expect(polishWithRules("明日 の 会議 です。")).toBe("明日の会議です。");
  });

  it("長音と促音の連続を1つにする", () => {
    expect(polishWithRules("すごーーーく良かったですっっっ。")).toBe("すごーく良かったですっ。");
  });

  it("英語だけの発話に句点を足さない", () => {
    expect(polishWithRules("This is a test")).toBe("This is a test");
  });
});

describe("polishWithRules — 句読点", () => {
  it("重複した読点をまとめ、末尾の読点は句点にする", () => {
    expect(polishWithRules("では、、始めます、")).toBe("では、始めます。");
  });

  it("文末が無い場合に句点を補う", () => {
    expect(polishWithRules("よろしくお願いします")).toBe("よろしくお願いします。");
  });

  it("文頭語の前でだけ句点を補う", () => {
    expect(polishWithRules("資料は共有済みです次に予算の話をします")).toBe(
      "資料は共有済みです。次に予算の話をします。",
    );
  });
});

describe("polishWithRules — 個人辞書", () => {
  it("表記ゆれを正しい表記に寄せる", () => {
    const out = polishWithRules("えーと、のたいぷ の話なんですけど。", {
      dictionary: [{ from: ["のたいぷ", "ノータイプ"], to: "NoType" }],
    });
    expect(out).toContain("NoType");
    expect(out).not.toContain("のたいぷ");
  });

  it("長い from を優先して当てる", () => {
    const out = polishWithRules("ノータイプとタイプの違い。", {
      dictionary: [
        { from: ["タイプ"], to: "type" },
        { from: ["ノータイプ"], to: "NoType" },
      ],
    });
    expect(out).toBe("NoTypeとtypeの違い。");
  });
});

describe("polishWithRules — 頑健性", () => {
  it("空文字を返す", () => {
    expect(polishWithRules("")).toBe("");
    expect(polishWithRules("   \n  ")).toBe("");
  });

  it("複数行の構造を保つ", () => {
    expect(polishWithRules("えーと、一つ目です\nあのー、二つ目です")).toBe(
      "一つ目です。\n二つ目です。",
    );
  });

  it("1万字でも例外を投げない", () => {
    const long = "えーと、これはテストです。".repeat(500);
    expect(() => polishWithRules(long)).not.toThrow();
    expect(polishWithRules(long).length).toBeGreaterThan(0);
  });
});
