// @ts-check
// Phase 3 e2e: F7 編集モーダル UX 改善(履歴折りたたみ + 説明文削除)
// 仕様書 §4 受け入れ条件 1〜6
const { test, expect } = require('@playwright/test');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:'',city:'沼津市'}
  ]
};

async function setupAndOpenF7(page, master) {
  await page.addInitScript((data) => {
    try {
      localStorage.clear();
      localStorage.setItem('shogi_branch_master', JSON.stringify(data));
    } catch (e) {}
  }, master || SAMPLE_MASTER);
  await page.goto('/shogi_v4.html');
  await page.click('#tab-master');
  await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
  await expect(page.locator('#master-edit-modal')).toBeVisible();
}

// ============================================================
// §4 #1: 初期表示で履歴情報折りたたまれている
// ============================================================
test.describe('Phase 3 §4 #1: F7 初期表示で履歴折りたたみ', () => {
  test('初期表示で #me-history が hidden(display:none)', async ({ page }) => {
    await setupAndOpenF7(page);
    await expect(page.locator('#me-history')).toBeHidden();
  });

  test('初期表示でトグルボタン textContent が「▼ 履歴情報を開く」', async ({ page }) => {
    await setupAndOpenF7(page);
    await expect(page.locator('#me-history-toggle')).toHaveText('▼ 履歴情報を開く');
  });
});

// ============================================================
// §4 #2: トグル動作(▼ 開く / ▲ 閉じる)
// ============================================================
test.describe('Phase 3 §4 #2: 履歴トグル動作', () => {
  test('トグルクリックで visible + ボタン text「▲ 履歴情報を閉じる」', async ({ page }) => {
    await setupAndOpenF7(page);
    await page.click('#me-history-toggle');
    await expect(page.locator('#me-history')).toBeVisible();
    await expect(page.locator('#me-history-toggle')).toHaveText('▲ 履歴情報を閉じる');
    // 履歴内容の確認
    const hist = page.locator('#me-history');
    await expect(hist).toContainText('初回参加');
    await expect(hist).toContainText('最終参加');
    await expect(hist).toContainText('参加回数');
  });

  test('再クリックで再 hidden + ボタン text「▼ 履歴情報を開く」', async ({ page }) => {
    await setupAndOpenF7(page);
    await page.click('#me-history-toggle');
    await expect(page.locator('#me-history')).toBeVisible();
    await page.click('#me-history-toggle');
    await expect(page.locator('#me-history')).toBeHidden();
    await expect(page.locator('#me-history-toggle')).toHaveText('▼ 履歴情報を開く');
  });
});

// ============================================================
// §4 #3: 375x800 で保存/キャンセルが viewport 内(layout assertion primary)
// visual snapshot は別途 visual_regression_mobile.spec.js で secondary 検証
// ============================================================
test.describe('Phase 3 §4 #3: 375x800 viewport で保存/キャンセル可視', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
  });

  test('375x800: F7 開いた直後 #me-cancel の bounding box が viewport 内', async ({ page }) => {
    await setupAndOpenF7(page);
    const box = await page.locator('#me-cancel').boundingBox();
    expect(box).not.toBeNull();
    // viewport 内: 上端 >= 0 かつ 下端 <= 800
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
  });

  test('375x800: F7 開いた直後 #me-save の bounding box が viewport 内', async ({ page }) => {
    await setupAndOpenF7(page);
    const box = await page.locator('#me-save').boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
  });
});

// ============================================================
// §4 #4: 説明文削除
// ============================================================
test.describe('Phase 3 §4 #4: 説明文「氏名ふりがな…」削除', () => {
  test('F7 モーダル内に「氏名・ふりがな・区分が編集できます」が含まれない', async ({ page }) => {
    await setupAndOpenF7(page);
    await expect(page.locator('#master-edit-modal')).not.toContainText('氏名・ふりがな・区分が編集できます');
    await expect(page.locator('#master-edit-modal')).not.toContainText('参加履歴は変更されません');
  });
});

// ============================================================
// §4 #5: 全フィールド保存読込が既存と同じ(履歴非破壊)
// ============================================================
test.describe('Phase 3 §4 #5: 全フィールド保存読込', () => {
  test('氏名 / ふりがな / city / 支部員区分 / 中学生以下 / 前回クラス を編集 → 保存 → 再オープンで保持', async ({ page }) => {
    await setupAndOpenF7(page);
    // 各フィールドを編集
    await page.locator('#me-name').fill('山田 改名');
    await page.locator('#me-yomi').fill('やまだかいめい');
    await page.locator('#me-city').fill('長泉町');
    await page.check('input[name="me-member"][value="member"]');
    await page.check('input[name="me-grade"][value="ippan"]');
    await page.check('input[name="me-last-class"][value="B"]');
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 再オープンで保持確認
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田 改名' }).locator('.master-edit-btn').click();
    await expect(page.locator('#me-name')).toHaveValue('山田 改名');
    await expect(page.locator('#me-yomi')).toHaveValue('やまだかいめい');
    await expect(page.locator('#me-city')).toHaveValue('長泉町');
    await expect(page.locator('input[name="me-member"][value="member"]')).toBeChecked();
    await expect(page.locator('input[name="me-grade"][value="ippan"]')).toBeChecked();
    await expect(page.locator('input[name="me-last-class"][value="B"]')).toBeChecked();
  });

  test('履歴情報は保存対象外(編集後も値が変わらない、履歴非破壊)', async ({ page }) => {
    await setupAndOpenF7(page);
    // 履歴を開いて元の値を控える
    await page.click('#me-history-toggle');
    const before = await page.locator('#me-history').textContent();
    // city を変更して保存
    await page.locator('#me-city').fill('三島市');
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 再オープン → 履歴展開
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
    await page.click('#me-history-toggle');
    const after = await page.locator('#me-history').textContent();
    expect(after).toBe(before);
  });
});

// ============================================================
// 補強: 既存「過去参加者から選ぶ」アコーディオンと表記が同 vocabulary("▼"/"▲")
// ============================================================
test.describe('Phase 3 補強: アコーディオン UI 統一', () => {
  test('F7 履歴トグルボタンの ▼ / ▲ プレフィクスが既存「過去参加者から選ぶ」と同 vocabulary', async ({ page }) => {
    await setupAndOpenF7(page);
    // 初期: ▼
    await expect(page.locator('#me-history-toggle')).toHaveText(/^▼/);
    await page.click('#me-history-toggle');
    // 開いた後: ▲
    await expect(page.locator('#me-history-toggle')).toHaveText(/^▲/);
  });
});
