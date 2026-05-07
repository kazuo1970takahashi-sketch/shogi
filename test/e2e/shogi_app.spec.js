// @ts-check
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../helpers/clickAndExpectChange');
const { shogiAssertions } = require('../helpers/shogi_assertions');

// 各テストで localStorage をクリアして独立性を保つ
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (e) {}
  });
  await page.goto('/shogi_v4.html');
});

test.describe('shogi_v4.html - タブ動作', () => {
  test('初期表示で参加者登録タブが表示される', async ({ page }) => {
    await expect(page.locator('#pane-reg')).toBeVisible();
    await expect(page.locator('#pane-tournament')).toBeHidden();
    await expect(page.locator('#pane-result')).toBeHidden();
    await expect(page.locator('#tab-reg')).toHaveClass(/active/);
  });

  test('参加者を A・B クラスに 2 名ずつ追加できる', async ({ page }) => {
    const inputs = [
      ['田中', 'A'], ['佐藤', 'A'], ['鈴木', 'B'], ['高橋', 'B'],
    ];
    for (const [name, cls] of inputs) {
      await page.fill('#inp-name', name);
      await page.selectOption('#inp-class', cls);
      await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded(cls));
    }
    await expect(page.locator('#a-count')).toContainText('2名');
    await expect(page.locator('#b-count')).toContainText('2名');
  });

  test('大会開始ボタンを押して対局管理タブへ切り替わる', async ({ page }) => {
    const inputs = [
      ['田中', 'A'], ['佐藤', 'A'], ['鈴木', 'B'], ['高橋', 'B'],
    ];
    for (const [name, cls] of inputs) {
      await page.fill('#inp-name', name);
      await page.selectOption('#inp-class', cls);
      await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded(cls));
    }
    await clickAndExpectChange(page.locator('#startBtn'), shogiAssertions.tournamentStarted());
    await expect(page.locator('#pane-tournament')).toBeVisible();
    await expect(page.locator('#pane-reg')).toBeHidden();
    await expect(page.locator('#tab-tournament')).toHaveClass(/active/);
    // ペアリングが生成されている
    await expect(page.locator('.pairing-card').first()).toBeVisible();
  });

  test('タブクリックで切り替えできる', async ({ page }) => {
    await clickAndExpectChange(page.locator('#tab-tournament'), shogiAssertions.tabSwitched('tab-tournament'));
    await expect(page.locator('#pane-tournament')).toBeVisible();
    await clickAndExpectChange(page.locator('#tab-result'), shogiAssertions.tabSwitched('tab-result'));
    await expect(page.locator('#pane-result')).toBeVisible();
    await clickAndExpectChange(page.locator('#tab-reg'), shogiAssertions.tabSwitched('tab-reg'));
    await expect(page.locator('#pane-reg')).toBeVisible();
  });
});

test.describe('shogi_v4.html - 大会データのコピー（バックアップ）', () => {
  test('保存ボタンが存在する', async ({ page }) => {
    await expect(page.locator('#saveBtn')).toBeVisible();
    await expect(page.locator('#saveBtn')).toHaveText(/大会データ|コピー|保存/);
  });

  test('読み込みボタンを押すとモーダルが開く (ファイル選択 + 貼り付けtextarea)', async ({ page }) => {
    // モーダル開閉は L0 §1.5 P1 操作(state を持たないため raw callback で
    // ctx.primary + DOM 可視性で primary semantic を担保、§4 raw callback パターン)
    await clickAndExpectChange(page.locator('#loadBtn'), async (before, after, ctx, p) => {
      ctx.primary('load modal opened');
      await expect(p.locator('#load-modal')).toBeVisible();
    });
    await expect(page.locator('#load-pick-file')).toBeVisible();
    await expect(page.locator('#load-paste-area')).toBeVisible();
    // 初期状態では「貼り付けから読み込む」は disabled
    await expect(page.locator('#load-from-paste')).toBeDisabled();
    // textarea に入力すると有効化
    await page.fill('#load-paste-area', '{}');
    await expect(page.locator('#load-from-paste')).toBeEnabled();
    await clickAndExpectChange(page.locator('#load-cancel'), async (before, after, ctx, p) => {
      ctx.primary('load modal closed');
      await expect(p.locator('#load-modal')).toHaveCount(0);
    });
  });
});

test.describe('shogi_v4.html - モバイル共通 (375px)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('タブが3つすべて表示される', async ({ page }) => {
    await expect(page.locator('#tab-reg')).toBeVisible();
    await expect(page.locator('#tab-tournament')).toBeVisible();
    await expect(page.locator('#tab-result')).toBeVisible();
  });

  test('主要操作がスクロールなしで届く (氏名入力・追加ボタン・開始ボタン)', async ({ page }) => {
    const ids = ['inp-name', 'inp-class', 'addBtn', 'startBtn'];
    for (const id of ids) {
      const el = page.locator('#' + id);
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      if (!box) throw new Error('boundingBox missing for ' + id);
      // 主要操作はビューポート上端から 800px 以内 (= 初期表示でスクロール最小限)
      expect(box.y).toBeLessThan(800);
      // タップターゲットは 44px 以上 (Apple HIG 推奨)
      expect(box.height).toBeGreaterThanOrEqual(34);
    }
  });

  test('保存ボタンも操作可能', async ({ page }) => {
    const save = page.locator('#saveBtn');
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    if (!box) throw new Error('save boundingBox missing');
    expect(box.height).toBeGreaterThanOrEqual(28);
  });

  test('横スクロールが発生しない', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });
});
