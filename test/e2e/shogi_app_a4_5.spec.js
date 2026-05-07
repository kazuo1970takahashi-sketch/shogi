// @ts-check
// Phase A-4.5 e2e: 過去参加者パネル 3 セクション分離 + F7 簡素化 + bug fix #7
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
    {id:'m_long01',name:'長谷川一郎太郎兵衛',yomi:'はせがわいちろうたろうべえ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_long02',name:'勅使河原超長名前太郎',yomi:'てしがわらちょうながなまえたろう',first_attended:'2026-01-01',last_attended:'2026-03-01',tournament_ids:['t2'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''}
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
// §2.1: 過去参加者パネル 3 セクション分離
// ============================================================
test.describe('A-4.5 §2.1: 過去参加者パネル 3 セクション分離', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('初期状態: A 済 0 名 / B 済 0 名 / 未エントリー 3 名のヘッダ件数', async ({ page }) => {
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-section-header')).toContainText('Aクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-section-header')).toContainText('Bクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (3名)');
  });

  test('件数 0 のセクションには「該当なし」が表示される(A/B 済の 2 つ)', async ({ page }) => {
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-empty')).toContainText('該当なし');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-empty')).toContainText('該当なし');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-empty')).toHaveCount(0);
  });

  test('A エントリー後: 該当者が A クラス済セクションに移動する', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // 再描画後: A 済 1 名 / B 済 0 名 / 未エントリー 2 名
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-section-header')).toContainText('Aクラスエントリー済 (1名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-section-header')).toContainText('Bクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (2名)');
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(0);
  });

  test('A クラス済 → B 変更: A 済セクションから消えて B 済セクションに移動(クロスセクション)', async ({ page }) => {
    // 山田太郎を A に追加
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    // A 済セクション内の山田太郎の B ボタン押下 → 確認 → B 済セクションへ移動
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="B"]').click();
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-section-header')).toContainText('Aクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-section-header')).toContainText('Bクラスエントリー済 (1名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(0);
  });

  // A-4.6: ボタン色強調撤廃テストは廃止。
  // 現クラス active 強調は復活(pp-add-btn-active クラス + 背景色 + ✓ + bold) → shogi_app_a4_6.spec.js で検証。
  // 前回参加クラス強調(pp-add-btn-highlight)は撤廃のまま維持。
  test('A-4.6: pp-add-btn-highlight は撤廃のまま維持(前回参加クラスのボタン強調なし)', async ({ page }) => {
    // 山田太郎(last_class:A、未エントリー)の A ボタンには highlight クラスは付かない
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await expect(row.locator('.pp-add-btn[data-cls="A"]')).not.toHaveClass(/pp-add-btn-highlight/);
    await expect(row.locator('.pp-add-btn[data-cls="B"]')).not.toHaveClass(/pp-add-btn-highlight/);
    await expect(page.locator('.pp-add-btn-highlight')).toHaveCount(0);
  });

  test('行内要素は A-4.3 と同じ(氏名 + 前回:Xクラス + 日付 + A/B ボタン)、「現在:Xクラス」テキストは存在しない', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // エントリー済の行に pp-current-class span は無い(A-4.4 で導入されたが A-4.5 で撤廃)
    await expect(page.locator('#ppPanel .pp-current-class')).toHaveCount(0);
    // pp-last-class は維持
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-last-class')).toContainText('前回:Aクラス');
  });

  test('検索フィルタは 3 セクション横断で機能する', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    // 検索 "山" → 山田太郎(A 済) + 山本花子(未エントリー)
    await page.fill('#pp-search', '山');
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-section-header')).toContainText('Aクラスエントリー済 (1名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-section-header')).toContainText('Bクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (1名)');
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' })).toHaveCount(1);
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row').filter({ hasText: '山本花子' })).toHaveCount(1);
  });
});

// ============================================================
// §4 #6: iPhone 375px 行レイアウト破綻なし(A-4.4 失敗の再発防止)
// ============================================================
test.describe('A-4.5 §4 #6: iPhone 375px 行レイアウト', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
  });

  // A-4.4 失敗(縦書き化)の再発検出: 各文字が縦に並ぶ場合 1 文字 ≒ 14-21px × N 文字で 60〜200px+ になる。
  // 横書き 1〜3 行折り返しなら 60px 未満(line-height ≒ 14-21px × 行数)。閾値 60px で縦書き化を検出。
  // L-4: expectHeightInRange に置き換え(可読性向上、ロジックは同等)
  test('375px: 通常氏名(3〜4 文字)で氏名 span が縦書き化しない(<60px)', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).first();
    const nameSpan = row.locator('span').first(); // 氏名 + ふりがな包含 span(flex:1)
    await expectHeightInRange(nameSpan, { maxHeight: 60, label: '通常氏名 nameSpan @375px' });
  });

  test('375px: 長氏名(10 文字以上)で氏名 span が縦書き化しない(<100px)', async ({ page }) => {
    await setupWithMaster(page, LONG_NAME_MASTER);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '長谷川一郎太郎兵衛' }).first();
    const nameSpan = row.locator('span').first();
    // 長氏名 + ふりがな(計 25 文字以上)が横書き 3〜4 行折り返しなら 60〜85px。
    // 縦書き化していたら 17px × 9 文字 + α = 150px+ になる。100px 未満で縦書き化を検出。
    await expectHeightInRange(nameSpan, { maxHeight: 100, label: '長氏名 nameSpan @375px' });
  });

  test('375px: 長氏名行の A/B ボタンが 44x44 タップターゲットを満たす', async ({ page }) => {
    await setupWithMaster(page, LONG_NAME_MASTER);
    await page.click('#ppToggleBtn');
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '長谷川一郎太郎兵衛' }).first();
    const aBtn = row.locator('.pp-add-btn[data-cls="A"]');
    const aBox = await aBtn.boundingBox();
    expect(aBox.width).toBeGreaterThanOrEqual(44);
    expect(aBox.height).toBeGreaterThanOrEqual(44);
    // viewport 内に収まる
    expect(aBox.x + aBox.width).toBeLessThanOrEqual(376);
  });

  // L-3: 過去参加者パネル(通常氏名)が viewport 内に収まる(水平 overflow なし)
  test('375px: 過去参加者パネルが viewport 内に収まる(通常氏名)', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'pp-panel 通常 @375px' });
  });

  // L-3: 過去参加者パネル(長氏名)が viewport 内に収まる
  test('375px: 過去参加者パネルが viewport 内に収まる(長氏名)', async ({ page }) => {
    await setupWithMaster(page, LONG_NAME_MASTER);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'pp-panel 長氏名 @375px' });
  });

  // L-3: F7 編集モーダルが viewport 内に収まる
  test('375px: F7 編集モーダルが viewport 内に収まる', async ({ page }) => {
    await setupWithMaster(page, SAMPLE_MASTER);
    await page.click('#tab-master');
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'F7 edit modal @375px' });
  });
});

// ============================================================
// §2.7: F7 保存後の過去参加者パネル即時反映(bug fix #7)
// ============================================================
test.describe('A-4.5 §2.7: F7 保存後 bug fix #7', () => {
  test('F7 で last_class を A → B に変更 → 過去参加者パネル「前回:Bクラス」がリロードなしで反映', async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await expect(row.locator('.pp-last-class')).toContainText('前回:Aクラス');
    // F7 で last_class を B に変更
    await page.click('#tab-master');
    const masterRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await masterRow.locator('.master-edit-btn').click();
    await page.locator('input[name="me-last-class"][value="B"]').check();
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 過去参加者タブに戻って即時反映を確認
    await page.click('#tab-reg');
    const updatedRow = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await expect(updatedRow.locator('.pp-last-class')).toContainText('前回:Bクラス');
  });
});

// ============================================================
// §2.6: applyMasterMemberEdit null 撤廃検証
// ============================================================
test.describe('A-4.5 §2.6: applyMasterMemberEdit null 撤廃', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('options.last_class === null → invalid_last_class_value', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, { last_class: null });
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_last_class_value');
  });

  test('options.last_class undefined(未指定) → 既存値維持で success', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, {});
      return { success: result.success, lastClass: master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').last_class };
    });
    expect(r.success).toBe(true);
    expect(r.lastClass).toBe('A');
  });
});
