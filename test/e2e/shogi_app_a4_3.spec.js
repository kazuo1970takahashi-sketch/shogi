// @ts-check
// Phase A-4.3 e2e: 過去参加者からのクラス変更機能 + マスタ last_class 表示
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../helpers/clickAndExpectChange');
const { shogiAssertions } = require('../helpers/shogi_assertions');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:null,deleted:false,deleted_at:null,note:''}
  ]
};

async function setupWithMaster(page, master) {
  await page.addInitScript((data) => {
    try {
      localStorage.clear();
      localStorage.setItem('shogi_branch_master', JSON.stringify(data));
    } catch (e) {}
  }, master || SAMPLE_MASTER);
  await page.goto('/shogi_v4.html');
}

// ============================================================
// §2.2: 確認ダイアログ 3 ケース分岐
// ============================================================
test.describe('A-4.3 §2.2: 確認ダイアログ 3 ケース分岐', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('ケース 1 (未登録): A ボタン押下 → 「○○さんを A クラス に追加しますか?」 → OK で追加', async ({ page }) => {
    let dialogText = null;
    page.once('dialog', async (dialog) => {
      dialogText = dialog.message();
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '佐藤一郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    expect(dialogText).toContain('佐藤一郎');
    expect(dialogText).toContain('Aクラス');
    expect(dialogText).toContain('追加');
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });

  test('ケース 1 (未登録): キャンセルで何も変化しない', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.dismiss(); });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '佐藤一郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(0);
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
  });

  test('ケース 2 (別クラス登録済): 「現在 A クラス に登録 / B クラス に変更しますか?」 → OK で changePlayerClass', async ({ page }) => {
    // 山田太郎を A に追加してから B に変更
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    // 別クラスのボタンを押す → 確認ダイアログ
    let dialogText = null;
    page.once('dialog', async (dialog) => {
      dialogText = dialog.message();
      await dialog.accept();
    });
    const row2 = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row2.locator('.pp-add-btn[data-cls="B"]').click();
    expect(dialogText).toContain('現在');
    expect(dialogText).toContain('Aクラス');
    expect(dialogText).toContain('Bクラス');
    expect(dialogText).toContain('変更');
    await expect(page.locator('#a-list .player-row')).toHaveCount(0);
    await expect(page.locator('#b-list .player-row')).toHaveCount(1);
    // master.last_class も即更新
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class).toBe('B');
  });

  test('ケース 2 (別クラス登録済): キャンセルでクラス変更されない', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    // 別クラス押下 → cancel
    page.once('dialog', async (dialog) => { await dialog.dismiss(); });
    const row2 = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row2.locator('.pp-add-btn[data-cls="B"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class).toBe('A'); // 不変
  });

  test('ケース 3 (同クラス登録済): alert OK のみ、追加なし・変更なし', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    // 同じ A ボタンをもう一度押す → alert
    let dialogType = null;
    let dialogText = null;
    page.once('dialog', async (dialog) => {
      dialogType = dialog.type();
      dialogText = dialog.message();
      await dialog.accept();
    });
    const row2 = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row2.locator('.pp-add-btn[data-cls="A"]').click();
    expect(dialogType).toBe('alert');
    expect(dialogText).toContain('既に');
    expect(dialogText).toContain('Aクラス');
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
  });
});

// ============================================================
// §2.1 現クラス強調表示テストは A-4.4 で撤廃(色強調 → セクション分離に移行)
// 対応する新規アサーションは shogi_app_a4_4.spec.js の §2.1 セクション分離テストで担保
// ============================================================

// ============================================================
// §2.4: マスタ一覧 last_class カラム
// ============================================================
test.describe('A-4.3 §2.4: マスタ一覧 last_class カラム', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master')).toBeVisible();
  });

  test('テーブルヘッダに「前回クラス」が含まれる', async ({ page }) => {
    await expect(page.locator('#pane-master thead')).toContainText('前回クラス');
  });

  test('last_class=A → セルに A 表示', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await expect(row.locator('.master-cell-last-class')).toHaveText('A');
  });

  test('last_class=B → セルに B 表示', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山本花子' });
    await expect(row.locator('.master-cell-last-class')).toHaveText('B');
  });

  test('last_class=null → セルに - 表示', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await expect(row.locator('.master-cell-last-class')).toHaveText('-');
  });
});

// ============================================================
// §2.5: F7 編集モーダル last_class 編集
// ============================================================
test.describe('A-4.3 §2.5: F7 編集モーダル last_class', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('編集モーダルに「前回クラス」fieldset (A / B 2 択) が表示される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    await expect(page.locator('#master-edit-modal')).toContainText('前回クラス');
    await expect(page.locator('input[name="me-last-class"][value="A"]')).toBeChecked();
    await expect(page.locator('input[name="me-last-class"][value="B"]')).not.toBeChecked();
  });

  // A-4.4: 「未設定」radio 撤廃。me-last-class radio は 2 つ(A / B)が DOM に存在
  test('me-last-class radio は 2 つ(value="A" / "B")が DOM に存在する', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    const radios = page.locator('input[name="me-last-class"]');
    await expect(radios).toHaveCount(2);
    const values = await radios.evaluateAll((els) => els.map((e) => e.value));
    expect(values.sort()).toEqual(['A', 'B']);
    // value="" radio は撤廃済み
    await expect(page.locator('input[name="me-last-class"][value=""]')).toHaveCount(0);
  });

  // A-4.4: last_class=null の member は A/B どちらも未 checked で開く
  test('last_class=null の member は A/B どちらも未 checked', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('input[name="me-last-class"][value="A"]')).not.toBeChecked();
    await expect(page.locator('input[name="me-last-class"][value="B"]')).not.toBeChecked();
  });

  test('last_class を A → B に変更して保存 → master.last_class が更新される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await page.locator('input[name="me-last-class"][value="B"]').check();
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class).toBe('B');
  });

  // A-4.4: last_class=null の member を A/B どちらも選ばずに保存 → 既存 null を維持
  test('last_class=null の member を A/B 未選択のまま保存 → null 維持', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await row.locator('.master-edit-btn').click();
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_cccccccccccc').last_class).toBeNull();
  });
});

// ============================================================
// §3.1: changePlayerClass 純粋関数 (in-page 単体テスト)
// ============================================================
test.describe('A-4.3 §3.1: changePlayerClass 純粋関数', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
  });

  test('A 登録済 → B に変更 → state.players 移動 + master.last_class 即更新', async ({ page }) => {
    // 過去参加者パネルから A に追加
    await page.click('#ppToggleBtn');
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // changePlayerClass を直接呼び出す
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.changePlayerClass('m_aaaaaaaaaaaa', 'B', master, window.state);
      window.saveBranchMaster(master);
      return result;
    });
    expect(r.success).toBe(true);
    expect(r.oldCls).toBe('A');
    expect(r.newCls).toBe('B');
    const state = await page.evaluate(() => window.state);
    expect(state.players.A.length).toBe(0);
    expect(state.players.B.length).toBe(1);
    expect(state.players.B[0].cls).toBe('B');
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class).toBe('B');
  });

  test('not_found: state に無い member_id → error not_found', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return window.changePlayerClass('m_zzzzzzzzzzzz', 'A', master, window.state);
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('not_found');
  });

  test('same_class: 既に同じクラス → error same_class', async ({ page }) => {
    await page.click('#ppToggleBtn');
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return window.changePlayerClass('m_aaaaaaaaaaaa', 'A', master, window.state);
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('same_class');
  });

  test('invalid_class: A/B 以外 → error invalid_class', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return window.changePlayerClass('m_aaaaaaaaaaaa', 'C', master, window.state);
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_class');
  });
});
