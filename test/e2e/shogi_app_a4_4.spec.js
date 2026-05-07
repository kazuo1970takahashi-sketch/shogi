// @ts-check
// Phase A-4.4 e2e: 過去参加者パネル UX 改善(2 セクション分離) + F7 last_class 簡素化 + bug fix #7
const { test, expect } = require('@playwright/test');

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
// §2.1: 過去参加者パネル 2 セクション分離
// ============================================================
test.describe('A-4.4 §2.1: 過去参加者パネル 2 セクション分離', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('初期状態: エントリー済 0 名 / 未エントリー 3 名のヘッダ件数表示', async ({ page }) => {
    const enrolledHeader = page.locator('#ppPanel .pp-section-enrolled .pp-section-header');
    const notEnrolledHeader = page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header');
    await expect(enrolledHeader).toContainText('エントリー済 (0名)');
    await expect(notEnrolledHeader).toContainText('未エントリー (3名)');
  });

  test('件数 0 のセクションには「該当なし」が表示される', async ({ page }) => {
    await expect(page.locator('#ppPanel .pp-section-enrolled .pp-empty')).toContainText('該当なし');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-empty')).toHaveCount(0);
  });

  test('A エントリー後: 該当者がエントリー済セクションに移動する(未エントリーから消える)', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    // 再描画後: エントリー済 1 名 / 未エントリー 2 名
    await expect(page.locator('#ppPanel .pp-section-enrolled .pp-section-header')).toContainText('エントリー済 (1名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (2名)');
    // 山田太郎はエントリー済セクション内
    await expect(page.locator('#ppPanel .pp-section-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(0);
  });

  test('エントリー済セクションの行に「現在:Aクラス」テキスト表示 + 色アクセント', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const enrolledRow = page.locator('#ppPanel .pp-section-enrolled .pp-row').filter({ hasText: '山田太郎' });
    await expect(enrolledRow.locator('.pp-current-class')).toHaveText('現在:Aクラス');
    const color = await enrolledRow.locator('.pp-current-class').evaluate((el) => getComputedStyle(el).color);
    // #0d47a1 ≒ rgb(13, 71, 161)
    expect(color).toMatch(/rgb\(13,\s*71,\s*161\)/);
  });

  test('B エントリー後: 「現在:Bクラス」テキスト表示', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山本花子' }).locator('.pp-add-btn[data-cls="B"]').click();
    const enrolledRow = page.locator('#ppPanel .pp-section-enrolled .pp-row').filter({ hasText: '山本花子' });
    await expect(enrolledRow.locator('.pp-current-class')).toHaveText('現在:Bクラス');
  });

  test('ボタン色強調撤廃: pp-add-btn-active / pp-add-btn-highlight クラスは存在しない', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // 全 pp-add-btn から active / highlight 系クラスが消えている
    await expect(page.locator('.pp-add-btn-active')).toHaveCount(0);
    await expect(page.locator('.pp-add-btn-highlight')).toHaveCount(0);
    // ボタンテキストは「A」「B」のみ(✓ なし)
    const aText = await page.locator('#ppPanel .pp-section-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').textContent();
    expect(aText.trim()).toBe('A');
  });

  test('検索フィルタは両セクション横断で機能する', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // 検索 "山" → 山田太郎(エントリー済) + 山本花子(未エントリー)
    await page.fill('#pp-search', '山');
    await expect(page.locator('#ppPanel .pp-section-enrolled .pp-section-header')).toContainText('エントリー済 (1名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (1名)');
    await expect(page.locator('#ppPanel .pp-section-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row').filter({ hasText: '山本花子' })).toHaveCount(1);
  });
});

// ============================================================
// §2.6: F7 保存後の過去参加者パネル即時反映(bug fix #7)
// ============================================================
test.describe('A-4.4 §2.6: F7 保存後 bug fix #7', () => {
  test('F7 で last_class を A → B に変更 → 過去参加者パネル「前回:Bクラス」がリロードなしで反映', async ({ page }) => {
    await setupWithMaster(page);
    // 過去参加者パネルを先に開いて「前回:Aクラス」を確認
    await page.click('#ppToggleBtn');
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await expect(row.locator('.pp-last-class')).toContainText('前回:Aクラス');
    // F7 で last_class を B に変更して保存
    await page.click('#tab-master');
    const masterRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await masterRow.locator('.master-edit-btn').click();
    await page.locator('input[name="me-last-class"][value="B"]').check();
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 過去参加者タブに戻って即時反映を確認(リロードなし)
    await page.click('#tab-reg');
    const updatedRow = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await expect(updatedRow.locator('.pp-last-class')).toContainText('前回:Bクラス');
  });
});

// ============================================================
// §2.5: F7 編集モーダル 簡素化(2 択 radio)
// ============================================================
test.describe('A-4.4 §2.5: F7 編集モーダル 簡素化', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('applyMasterMemberEdit: options.last_class === null → invalid_last_class_value', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, { last_class: null });
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_last_class_value');
  });

  test('applyMasterMemberEdit: options.last_class undefined(未指定) → 既存値維持で success', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, {});
      return { success: result.success, lastClass: master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class };
    });
    expect(r.success).toBe(true);
    expect(r.lastClass).toBe('A'); // 既存値維持
  });
});
