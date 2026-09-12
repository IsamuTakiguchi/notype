import { defineConfig, devices } from "@playwright/test";

/**
 * ブラウザは /opt/pw-browsers に事前配置されたものを使う（chromium-1194）。
 * @playwright/test のバージョンとリビジョンは1対1なので、~1.56.0 のピンを外すと
 * 存在しないリビジョンを探してダウンロードを試みる。package.json のコメント参照。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // next dev ではなく本番ビルドを使う。dev は初回リクエストでコンパイルが走り、
    // その数秒の初期表示遅延が「本物の失敗に見えるフレーク」を生む。
    command: "npm run build && npx next start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
