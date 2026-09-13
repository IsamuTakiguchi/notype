/**
 * 素朴な固定ウィンドウのレート制限。
 *
 * 公開URLに置いた時点で `/api/polish` は「誰でも運営者のAPIキーで Claude を
 * 呼べるエンドポイント」になる。認証を付けるほどの規模ではないので、
 * 少なくとも青天井にはしない、という目的で入れている。
 *
 * カウンタはプロセス内にしか無い。複数レプリカに増やすと制限は
 * レプリカ数だけ緩くなるので、そのときは共有ストアに移すこと。
 */

export type RateLimitResult = {
  allowed: boolean;
  /** 429 を返すときに Retry-After に載せる秒数。 */
  retryAfterSeconds: number;
  remaining: number;
};

export type RateLimiter = (key: string, now?: number) => RateLimitResult;

export type RateLimiterOptions = {
  /** ウィンドウあたりの上限。0 以下で無効化。 */
  max: number;
  windowMs: number;
  /** これを超えたら期限切れエントリを掃除する。 */
  sweepThreshold?: number;
};

export function createRateLimiter({
  max,
  windowMs,
  sweepThreshold = 10_000,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    if (max <= 0) return { allowed: true, retryAfterSeconds: 0, remaining: Infinity };

    // 期限切れが溜まり続けるとメモリを食うので、ときどきまとめて捨てる。
    if (windows.size > sweepThreshold) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }

    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0, remaining: max - 1 };
    }

    if (current.count >= max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        remaining: 0,
      };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0, remaining: max - current.count };
  };
}

/**
 * リクエスト元の識別子。
 *
 * Railway や Cloudflare のようなリバースプロキシ配下では実IPはヘッダにしか無い。
 * ヘッダが無い環境では全員が同じバケットに入るが、公開運用では必ず付く。
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "unknown";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * 既定は「1つのIPから5分間に20回」。
 * 個人利用には十分で、放置されたボットには十分きつい。
 * RATE_LIMIT_MAX=0 で無効化できる。
 */
export const polishRateLimiter: RateLimiter = createRateLimiter({
  max: envInt("RATE_LIMIT_MAX", 20),
  windowMs: envInt("RATE_LIMIT_WINDOW_MS", 5 * 60 * 1000),
});
