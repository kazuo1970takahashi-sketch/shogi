// @ts-check
// マスタ一覧画面 列構成変更 mini Sprint(2026-05-08)
// 7 列(氏名/ふりがな/区分/前回クラス/最終参加/回数/操作)→ 5 列(氏名/支部員区分/中学生以下区分/編集/削除)
const { test, expect } = require('@playwright/test');
const { expectNoHorizontalOverflow, expectHeightInRange } = require('../helpers/layout-assertions');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:null,deleted:false,deleted_at:null,note:''}
  ]
};

const LONG_NAME_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_long01',name:'長谷川一郎太郎兵衛',yomi:'はせがわいちろうたろうべえ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_long02',name:'勅使河原超長名前太郎',yomi:'てしがわらちょうながなまえたろう',first_attended:'2026-01-01',last_attended:'2026-03-01',tournament_ids:['t2'],attendance_count:1,member:'other',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''}
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
// §2.1: 5 列構成
// ============================================================
test.describe('master-list §2.1: 5 列構成', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master')).toBeVisible();
  });

  test('thead が 5 列(氏名 / 支部員区分 / 中学生以下区分 / 編集 / 削除)', async ({ page }) => {
    const headers = page.locator('#pane-master thead th');
    await expect(headers).toHaveCount(5);
    const texts = await headers.evaluateAll((els) => els.map((e) => e.textContent.trim()));
    expect(texts).toEqual(['氏名', '支部員区分', '中学生以下区分', '編集', '削除']);
  });

  test('tbody の各行も 5 列', async ({ page }) => {
    const rows = page.locator('#pane-master tbody tr');
    const count = await rows.count();
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator('td')).toHaveCount(5);
    }
  });

  test('削除した列(ふりがな / 前回クラス / 最終参加 / 回数)が DOM に存在しない', async ({ page }) => {
    await expect(page.locator('#pane-master thead')).not.toContainText('ふりがな');
    await expect(page.locator('#pane-master thead')).not.toContainText('前回クラス');
    await expect(page.locator('#pane-master thead')).not.toContainText('最終参加');
    await expect(page.locator('#pane-master thead')).not.toContainText('回数');
    // 旧 master-cell-last-class クラスを持つセルは存在しない
    await expect(page.locator('#pane-master .master-cell-last-class')).toHaveCount(0);
  });

  test('支部員区分(member)が「支部員」/「他」で正しく表示', async ({ page }) => {
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-cell-member')).toHaveText('他');
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '山本花子' }).locator('.master-cell-member')).toHaveText('支部員');
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' }).locator('.master-cell-member')).toHaveText('支部員');
  });

  test('中学生以下区分(grade)が「中学」/「一般」で正しく表示', async ({ page }) => {
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-cell-grade')).toHaveText('中学');
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '山本花子' }).locator('.master-cell-grade')).toHaveText('一般');
    await expect(page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' }).locator('.master-cell-grade')).toHaveText('一般');
  });

  test('編集列に編集ボタン、削除列に削除ボタン(別セル)', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await expect(row.locator('td.master-cell-edit .master-edit-btn')).toHaveCount(1);
    await expect(row.locator('td.master-cell-delete .master-delete-btn')).toHaveCount(1);
    // 隣接性: 編集列の中に削除ボタンが含まれていない(分離されている)
    await expect(row.locator('td.master-cell-edit .master-delete-btn')).toHaveCount(0);
  });
});

// ============================================================
// §2.3: F7 編集モーダル回帰なし(削除した一覧情報は F7 内で確認可)
// ============================================================
test.describe('master-list §2.3: F7 編集モーダル回帰なし', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('F7 編集モーダルでふりがな / 前回クラスが引き続き表示・編集可能', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    // ふりがな入力
    await expect(page.locator('#me-yomi')).toHaveValue('やまだたろう');
    // 前回クラス radio(A 選択中)
    await expect(page.locator('input[name="me-last-class"][value="A"]')).toBeChecked();
  });

  test('F7 編集モーダルで履歴情報(初回・最終・回数)が引き続き表示される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    // Phase 3: 履歴情報は折りたたみ式に変更されたためトグルを開いてから assert
    await page.click('#me-history-toggle');
    const hist = page.locator('#me-history');
    await expect(hist).toBeVisible();
    await expect(hist).toContainText('初回参加：2026-01-01');
    await expect(hist).toContainText('最終参加：2026-04-01');
    await expect(hist).toContainText('参加回数：2回');
  });
});

// ============================================================
// §4 #6: iPhone 375px で氏名縦書き化なし(L-3/L-4 ヘルパー)
// ============================================================
test.describe('master-list §4 #6: iPhone 375px Layout Safety', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
  });

  test('375px: マスタ一覧で水平 overflow なし(通常氏名)', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'master-list page @375px' });
  });

  test('375px: マスタ一覧で水平 overflow なし(長氏名)', async ({ page }) => {
    await setupWithMaster(page, LONG_NAME_MASTER);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'master-list page 長氏名 @375px' });
  });

  test('375px: 通常氏名セルが縦書き化しない(<60px)', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#tab-master');
    const nameCell = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('td').first();
    await expectHeightInRange(nameCell, { maxHeight: 60, label: '通常氏名 master 列 @375px' });
  });

  test('375px: 長氏名セルが縦書き化しない(<100px)', async ({ page }) => {
    await setupWithMaster(page, LONG_NAME_MASTER);
    await page.click('#tab-master');
    const nameCell = page.locator('#pane-master tbody tr').filter({ hasText: '長谷川一郎太郎兵衛' }).locator('td').first();
    // 長氏名 9 文字でも横書き 1〜3 行折り返し以内に収まる(縦書き化していたら 9 × 17px = 153px+)
    await expectHeightInRange(nameCell, { maxHeight: 100, label: '長氏名 master 列 @375px' });
  });

  test('375px: 支部員区分セルが縦書き化しない(<60px)', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#tab-master');
    const memberCell = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('td.master-cell-member');
    // 「支部員」3 文字が横書き 1 行(セル padding 込みで ~30-50px)。縦書き化していたら 3 × 17px + padding で 70px+
    await expectHeightInRange(memberCell, { maxHeight: 60, label: '支部員区分セル @375px' });
  });
});
