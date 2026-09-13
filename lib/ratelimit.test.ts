import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter } from "./ratelimit";

describe("createRateLimiter", () => {
  it("上限までは通し、超えたら弾く", () => {
    const limit = createRateLimiter({ max: 3, windowMs: 1000 });
    expect(limit("a", 0).allowed).toBe(true);
    expect(limit("a", 0).allowed).toBe(true);
    expect(limit("a", 0).allowed).toBe(true);
    expect(limit("a", 0).allowed).toBe(false);
  });

  it("残り回数を返す", () => {
    const limit = createRateLimiter({ max: 3, windowMs: 1000 });
    expect(limit("a", 0).remaining).toBe(2);
    expect(limit("a", 0).remaining).toBe(1);
    expect(limit("a", 0).remaining).toBe(0);
  });

  it("ウィンドウを過ぎたら回復する", () => {
    const limit = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(limit("a", 0).allowed).toBe(true);
    expect(limit("a", 500).allowed).toBe(false);
    expect(limit("a", 1000).allowed).toBe(true);
  });

  it("キーごとに独立している", () => {
    const limit = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(limit("a", 0).allowed).toBe(true);
    expect(limit("b", 0).allowed).toBe(true);
    expect(limit("a", 0).allowed).toBe(false);
  });

  it("弾いたときは切り上げた待ち秒数を返す", () => {
    const limit = createRateLimiter({ max: 1, windowMs: 5000 });
    limit("a", 0);
    expect(limit("a", 1500).retryAfterSeconds).toBe(4);
    // 0 秒を返すと Retry-After として意味を成さないので、最低 1 秒にする。
    expect(limit("a", 4999).retryAfterSeconds).toBe(1);
  });

  it("max が 0 なら無効化される", () => {
    const limit = createRateLimiter({ max: 0, windowMs: 1000 });
    for (let i = 0; i < 100; i += 1) expect(limit("a", 0).allowed).toBe(true);
  });

  it("期限切れのエントリを掃除してもカウントを壊さない", () => {
    const limit = createRateLimiter({ max: 2, windowMs: 1000, sweepThreshold: 3 });
    // 掃除を誘発するだけの古いキーを積む。
    for (let i = 0; i < 5; i += 1) limit(`old-${i}`, 0);
    // 掃除後も、生きているウィンドウのカウントは維持される。
    expect(limit("live", 2000).allowed).toBe(true);
    expect(limit("live", 2000).allowed).toBe(true);
    expect(limit("live", 2000).allowed).toBe(false);
  });
});

describe("clientKey", () => {
  it("x-forwarded-for の先頭を使う", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" });
    expect(clientKey(headers)).toBe("203.0.113.9");
  });

  it("代替ヘッダも見る", () => {
    expect(clientKey(new Headers({ "cf-connecting-ip": "203.0.113.1" }))).toBe("203.0.113.1");
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2");
  });

  it("何も無ければ既定のキーに落とす", () => {
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
