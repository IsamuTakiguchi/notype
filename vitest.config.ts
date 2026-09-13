import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // レート制限はテスト全体では無効にしておく。既定の上限に近い数の
    // リクエストを投げるテストが、無関係な理由で落ちるのを避けるため。
    // 制限そのものは lib/ratelimit.test.ts と
    // app/api/polish/ratelimit-route.test.ts で個別に検証する。
    env: { RATE_LIMIT_MAX: "0" },
  },
});
