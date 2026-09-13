import { describe, expect, it } from "vitest";

import { curlExample, polishEndpoint, requestBodyFields, TRANSCRIPT_PLACEHOLDER } from "./shortcut";

describe("polishEndpoint", () => {
  it("オリジンにエンドポイントを繋ぐ", () => {
    expect(polishEndpoint("https://notype.example.com")).toBe(
      "https://notype.example.com/api/polish",
    );
  });

  it("末尾のスラッシュで二重にしない", () => {
    expect(polishEndpoint("https://notype.example.com/")).toBe(
      "https://notype.example.com/api/polish",
    );
    expect(polishEndpoint("https://notype.example.com///")).toBe(
      "https://notype.example.com/api/polish",
    );
  });
});

describe("requestBodyFields", () => {
  const fields = requestBodyFields({ mode: "polish", tone: "business", outputLang: "ja" });

  it("API が要求する4つのキーを揃える", () => {
    expect(fields.map((f) => f.key)).toEqual(["mode", "tone", "outputLang", "transcript"]);
  });

  it("設定した値をそのまま反映する", () => {
    const minutes = requestBodyFields({ mode: "translate", tone: "minutes", outputLang: "en" });
    expect(minutes.find((f) => f.key === "mode")?.value).toBe("translate");
    expect(minutes.find((f) => f.key === "tone")?.value).toBe("minutes");
    expect(minutes.find((f) => f.key === "outputLang")?.value).toBe("en");
  });

  it("transcript だけは値ではなく変数を入れる指示にする", () => {
    // ここが固定文字列だと、毎回同じ文章を送る壊れたショートカットになる。
    expect(fields.find((f) => f.key === "transcript")?.value).toBe(TRANSCRIPT_PLACEHOLDER);
  });
});

describe("curlExample", () => {
  const curl = curlExample({
    origin: "https://notype.example.com",
    mode: "polish",
    tone: "business",
    outputLang: "ja",
  });

  it("そのまま実行できる形になっている", () => {
    expect(curl).toContain("curl -X POST https://notype.example.com/api/polish");
    expect(curl).toContain("content-type: application/json");
  });

  it("プレースホルダではなく実際に送れる文面を載せる", () => {
    expect(curl).not.toContain(TRANSCRIPT_PLACEHOLDER);
    expect(curl).toContain("えーと、明日は晴れです。");
  });
});
