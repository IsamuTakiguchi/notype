import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * レート制限がルートに実際に効いていることの確認。
 *
 * 上限はモジュール読み込み時に env から決まるので、import より前に stub する。
 * vitest はファイルごとにモジュールを分離するので、他のテストには影響しない。
 */
vi.stubEnv("RATE_LIMIT_MAX", "2");
vi.stubEnv("RATE_LIMIT_WINDOW_MS", "60000");
vi.stubEnv("ANTHROPIC_API_KEY", "");

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function request(ip: string): Request {
  return new Request("http://localhost/api/polish", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      mode: "polish",
      tone: "business",
      outputLang: "ja",
      transcript: "えーと、テストです。",
    }),
  });
}

describe("POST /api/polish — レート制限", () => {
  it("上限を超えたら 429 と Retry-After を返す", async () => {
    expect((await POST(request("198.51.100.1"))).status).toBe(200);
    expect((await POST(request("198.51.100.1"))).status).toBe(200);

    const blocked = await POST(request("198.51.100.1"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(blocked.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("IP ごとに独立して数える", async () => {
    expect((await POST(request("198.51.100.2"))).status).toBe(200);
    expect((await POST(request("198.51.100.3"))).status).toBe(200);
    expect((await POST(request("198.51.100.3"))).status).toBe(200);
    expect((await POST(request("198.51.100.3"))).status).toBe(429);
    // 別 IP はまだ 1 回しか使っていないので通る。
    expect((await POST(request("198.51.100.2"))).status).toBe(200);
  });

  it("ボディを読む前に弾く（壊れた JSON でも 429 が優先される）", async () => {
    const ip = "198.51.100.4";
    await POST(request(ip));
    await POST(request(ip));
    const broken = new Request("http://localhost/api/polish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: "not json",
    });
    // モデルにもパーサにも到達させない、が狙い。
    expect((await POST(broken)).status).toBe(429);
  });
});
