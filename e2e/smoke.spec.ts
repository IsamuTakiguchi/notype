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
  await page.getByTestId("dict-to").fill("NoType");
  await page.getByTestId("dict-add").click();
  await expect(page.getByTestId("dict-list")).toContainText("NoType");

  await page.getByTestId("transcript-input").fill("えーと、のたいぷ の話なんですけど。");
  await page.getByTestId("polish-button").click();

  const output = page.getByTestId("polished-output");
  await expect(output).toContainText("NoType");
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

test("iPhone 向けのショートカット案内が使える形で出る", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByTestId("shortcut-link").click();
  await expect(page).toHaveURL(/\/shortcut$/);

  // URL は表示中のオリジンから埋まる。手で打たせないことが要点。
  await expect(page.getByTestId("shortcut-url")).toHaveText(`${baseURL}/api/polish`);

  // API が要求する4キーが揃っていること。
  const fields = page.getByTestId("shortcut-fields");
  for (const key of ["mode", "tone", "outputLang", "transcript"]) {
    await expect(fields).toContainText(key);
  }

  // 設定を変えたら案内の値も変わる。
  await page.getByLabel("トーン").selectOption("minutes");
  await expect(fields).toContainText("minutes");

  await page.screenshot({ path: "e2e/__screenshots__/shortcut.png", fullPage: true });
});

test("ショートカット案内はスマホ幅でも横スクロールしない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shortcut");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("iPhone 幅", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("1ペインずつ表示し、整形するとタブが結果側へ移る", async ({ page }) => {
    await page.goto("/");

    // 並べる余地が無いので、初期は書き起こしだけ。
    await expect(page.getByTestId("pane-tabs")).toBeVisible();
    await expect(page.getByTestId("transcript-input")).toBeVisible();
    await expect(page.getByTestId("polished-placeholder")).toBeHidden();
    // 見た目の背景色はトランジション中に揺れるので、状態は aria-selected で確かめる。
    await expect(page.getByTestId("pane-tab-raw")).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("transcript-input").fill("えーと、明日は晴れです。");
    await page.getByTestId("polish-button").click();

    // 押した瞬間に結果側へ移らないと「何も起きない」ように見える。
    await expect(page.getByTestId("polished-output")).toBeVisible();
    await expect(page.getByTestId("transcript-input")).toBeHidden();
    await expect(page.getByTestId("pane-tab-polished")).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("pane-tab-raw").click();
    await expect(page.getByTestId("transcript-input")).toBeVisible();
    await expect(page.getByTestId("pane-tab-raw")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("pane-tab-polished")).toHaveAttribute("aria-selected", "false");

    // 遷移が落ち着いてから撮る。途中で撮ると選択タブが逆に見える。
    await page.waitForTimeout(400);
    await page.screenshot({ path: "e2e/__screenshots__/iphone.png", fullPage: true });
  });

  test("マイクと整形ボタンが常に画面内に留まる", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("transcript-input").fill("長い書き起こし。\n".repeat(60));

    // 下端固定なので、スクロールしてもビューポートの中に居ること。
    await page.mouse.wheel(0, 4000);
    const box = await page.getByTestId("polish-button").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await expect(page.getByTestId("mic-button")).toBeInViewport();
  });

  test("入力欄が 16px 以上（iOS の自動ズームを避ける）", async ({ page }) => {
    await page.goto("/");
    const size = await page
      .getByTestId("transcript-input")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // 16px 未満だと iOS がフォーカス時にページ全体を勝手に拡大し、戻す手段が無い。
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("横スクロールが出ない", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("スタンドアロン起動を宣言していない（宣言するとマイクが死ぬ）", async ({ page }) => {
    await page.goto("/");
    // この meta が無いことが要件そのもの。yes を出すと iOS がホーム画面から
    // スタンドアロン起動し、その状態では webkitSpeechRecognition が動かない。
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(0);
    // アイコンは配る。ホーム画面に置くこと自体を妨げたいわけではない。
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  });
});
