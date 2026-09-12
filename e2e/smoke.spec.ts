import { expect, test } from "@playwright/test";

/**
 * このコンテナにはマイクも ANTHROPIC_API_KEY も無い。
 * したがってここで通しているのは「テキストを貼り付けて整形する経路」と
 * 「鍵が無いときのルールベースへの劣化」で、どちらも実運用で本当に通る道。
 */
const ROUGH_TRANSCRIPT =
  "えーと、明日のミーティングなんですけど、あの、10時から、あ、違う、11時からです。資料を、資料をですね、三点用意しています。";

test("貼り付けた書き起こしを整形できる（マイク無し・APIキー無し）", async ({ page }) => {
  await page.goto("/");

  // headless Chromium も webkitSpeechRecognition 自体は持っている（使うと network で失敗する）。
  // なので「非対応と表示されること」ではなく「ボタンが出ていること」を確かめる。
  await expect(page.getByTestId("mic-button")).toBeVisible();

  await page.getByTestId("transcript-input").fill(ROUGH_TRANSCRIPT);
  await page.getByTestId("mode-polish").click();
  await page.getByTestId("tone-select").selectOption("business");
  await page.getByTestId("polish-button").click();

  const output = page.getByTestId("polished-output");
  await expect(output).toBeVisible();
  const text = (await output.textContent()) ?? "";

  expect(text.trim()).not.toBe("");
  // フィラーが消えている。
  expect(text).not.toContain("えーと");
  expect(text).not.toContain("あの、");
  // 言い直しが解決されている。
  expect(text).not.toContain("10時");
  expect(text).toContain("11時");
  // 繰り返しがまとまっている。
  expect(text.split("資料を").length - 1).toBe(1);

  await expect(page.getByTestId("engine-badge")).toHaveText("ルールベース");
  // 劣化していることを黙って隠さない。
  await expect(page.getByTestId("fallback-note")).toBeVisible();

  await page.screenshot({ path: "e2e/__screenshots__/home.png", fullPage: true });
});

test("個人辞書が整形結果に反映される", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /個人辞書/ }).click();
  await page.getByTestId("dict-from").fill("のたいぷ");
  await page.getByTestId("dict-to").fill("notype");
  await page.getByTestId("dict-add").click();
  await expect(page.getByTestId("dict-list")).toContainText("notype");

  await page.getByTestId("transcript-input").fill("えーと、のたいぷ の話なんですけど。");
  await page.getByTestId("polish-button").click();

  const output = page.getByTestId("polished-output");
  await expect(output).toContainText("notype");
  await expect(output).not.toContainText("のたいぷ");

  await page.screenshot({ path: "e2e/__screenshots__/dictionary.png", fullPage: true });
});

test("履歴がリロード後も残る", async ({ page }) => {
  await page.goto("/");

  for (const line of ["えーと、一件目のメモです。", "あのー、二件目のメモです。"]) {
    await page.getByTestId("transcript-input").fill(line);
    await page.getByTestId("polish-button").click();
    await expect(page.getByTestId("polished-output")).toContainText("メモです");
  }

  await page.getByRole("button", { name: /履歴/ }).click();
  await expect(page.getByTestId("history-item")).toHaveCount(2);

  // localStorage をレンダー中ではなく effect で読めているかを見るテストでもある。
  await page.reload();
  await page.getByRole("button", { name: /履歴/ }).click();
  await expect(page.getByTestId("history-item")).toHaveCount(2);
});

test("整形結果をクリップボードにコピーできる", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL ?? "http://127.0.0.1:3100",
  });
  await page.goto("/");

  await page.getByTestId("transcript-input").fill("えーと、これはコピーのテストです。");
  await page.getByTestId("polish-button").click();
  await expect(page.getByTestId("polished-output")).toContainText("コピーのテスト");

  await page.getByTestId("copy-button").click();
  await expect(page.getByTestId("copy-button")).toHaveText("コピーしました");

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("コピーのテスト");
});

test("空の入力では整形ボタンが押せない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("polish-button")).toBeDisabled();
  await page.getByTestId("transcript-input").fill("テストです。");
  await expect(page.getByTestId("polish-button")).toBeEnabled();
});
