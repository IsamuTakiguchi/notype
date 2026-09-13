import { beforeEach, describe, expect, it, vi } from "vitest";

import { polishWithRules } from "@/lib/rules";
import type { PolishRequest } from "@/lib/types";

import { POST } from "./route";

/**
 * この環境には ANTHROPIC_API_KEY が無い。つまりここで検証しているのは、
 * 実運用でも起こりうる「鍵が無い / 拒否された / 繋がらない」ときの経路そのもの。
 * ネットワークには一切出ないので速く、決定論的。
 */
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/polish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid: PolishRequest = {
  mode: "polish",
  tone: "business",
  outputLang: "ja",
  transcript: "えーと、明日は晴れです。",
};

describe("POST /api/polish — 鍵が無いときの劣化", () => {
  it("エラーにせずルールベースで200を返す", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-notype-engine")).toBe("rules");
    expect(response.headers.get("x-notype-fallback-reason")).toBe("no-api-key");
    await expect(response.text()).resolves.toBe(polishWithRules(valid.transcript));
  });

  it("キャッシュされないヘッダを付ける", async () => {
    const response = await POST(request(valid));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("content-type")).toContain("charset=utf-8");
  });

  it("個人辞書がルールベース経路にも効く", async () => {
    const response = await POST(
      request({
        ...valid,
        transcript: "えーと、のたいぷ の話です。",
        dictionary: [{ from: ["のたいぷ"], to: "NoType" }],
      }),
    );
    const text = await response.text();
    expect(text).toContain("NoType");
    expect(text).not.toContain("のたいぷ");
  });

  it("空の書き起こしはモデルを呼ばずに空で返す", async () => {
    const response = await POST(request({ ...valid, transcript: "   " }));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
  });
});

describe("POST /api/polish — 入力の検証", () => {
  it("JSON でないボディは 400", async () => {
    const response = await POST(request("not json"));
    expect(response.status).toBe(400);
  });

  it("配列のボディは 400", async () => {
    const response = await POST(request([1, 2, 3]));
    expect(response.status).toBe(400);
  });

  it("未知の mode は 400", async () => {
    const response = await POST(request({ ...valid, mode: "summarize" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("未知の tone は 400", async () => {
    expect((await POST(request({ ...valid, tone: "sarcastic" }))).status).toBe(400);
  });

  it("不正な outputLang は 400", async () => {
    expect((await POST(request({ ...valid, outputLang: "日本語" }))).status).toBe(400);
  });

  it("transcript が無ければ 400", async () => {
    expect((await POST(request({ mode: "polish", tone: "business" }))).status).toBe(400);
  });

  it("長すぎる transcript は 413", async () => {
    const response = await POST(request({ ...valid, transcript: "あ".repeat(20_001) }));
    expect(response.status).toBe(413);
  });

  it("edit モードで対象テキストが無ければ 400", async () => {
    const response = await POST(request({ ...valid, mode: "edit", transcript: "短くして" }));
    expect(response.status).toBe(400);
  });

  it("edit モードで対象テキストがあれば通る", async () => {
    const response = await POST(
      request({ ...valid, mode: "edit", transcript: "短くして", target: "元の文章です。" }),
    );
    expect(response.status).toBe(200);
  });
});
