// @ts-check
// Phase A-4.6 e2e: エントリー済の現クラスボタンに色強調を復活
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
// §2.1: エントリー済の現クラスボタン色強調復活
// ============================================================
test.describe('A-4.6 §2.1: エントリー済ボタン色強調', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('A 登録済の A ボタン: pp-add-btn-active + 背景 #bbdefb + テキスト「A ✓」+ bold', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const enrolledRow = page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' });
    const aBtn = enrolledRow.locator('.pp-add-btn[data-cls="A"]');
    await expect(aBtn).toHaveClass(/pp-add-btn-active/);
    await expect(aBtn).toHaveText(/A\s*✓/);
    const aStyle = await aBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight };
    });
    // #bbdefb = rgb(187, 222, 251)
    expect(aStyle.bg).toMatch(/rgb\(187,\s*222,\s*251\)/);
    // #0d47a1 = rgb(13, 71, 161)
    expect(aStyle.color).toMatch(/rgb\(13,\s*71,\s*161\)/);
    // bold は 700 として返る
    expect(['bold', '700']).toContain(aStyle.fontWeight);
  });

  test('B 登録済の B ボタン: pp-add-btn-active + 背景 #ffe0b2 + テキスト「B ✓」+ bold', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山本花子' }).locator('.pp-add-btn[data-cls="B"]').click();
    const enrolledRow = page.locator('#ppPanel .pp-section-b-enrolled .pp-row').filter({ hasText: '山本花子' });
    const bBtn = enrolledRow.locator('.pp-add-btn[data-cls="B"]');
    await expect(bBtn).toHaveClass(/pp-add-btn-active/);
    await expect(bBtn).toHaveText(/B\s*✓/);
    const bStyle = await bBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight };
    });
    // #ffe0b2 = rgb(255, 224, 178)
    expect(bStyle.bg).toMatch(/rgb\(255,\s*224,\s*178\)/);
    // #5d4037 = rgb(93, 64, 55)
    expect(bStyle.color).toMatch(/rgb\(93,\s*64,\s*55\)/);
    expect(['bold', '700']).toContain(bStyle.fontWeight);
  });

  test('未エントリーセクションの両ボタン: active クラスなし、テキストは「A」「B」のみ、白背景', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-section-not-enrolled .pp-row').filter({ hasText: '佐藤一郎' });
    const aBtn = row.locator('.pp-add-btn[data-cls="A"]');
    const bBtn = row.locator('.pp-add-btn[data-cls="B"]');
    await expect(aBtn).not.toHaveClass(/pp-add-btn-active/);
    await expect(bBtn).not.toHaveClass(/pp-add-btn-active/);
    expect((await aBtn.textContent()).trim()).toBe('A');
    expect((await bBtn.textContent()).trim()).toBe('B');
    const aBg = await aBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    // 白 = rgb(255, 255, 255)
    expect(aBg).toMatch(/rgb\(255,\s*255,\s*255\)/);
  });

  test('A 登録済の B ボタン(別クラスボタン): active クラスなし、白背景、テキスト「B」', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const enrolledRow = page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' });
    const bBtn = enrolledRow.locator('.pp-add-btn[data-cls="B"]');
    await expect(bBtn).not.toHaveClass(/pp-add-btn-active/);
    expect((await bBtn.textContent()).trim()).toBe('B');
    const bBg = await bBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bBg).toMatch(/rgb\(255,\s*255,\s*255\)/);
  });

  test('A → B クラス変更: A ボタン色消失 + B ボタン色出現の遷移', async ({ page }) => {
    // A 登録
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]')).toHaveClass(/pp-add-btn-active/);
    // B に変更
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="B"]').click();
    // 再描画後: B 済セクションへ移動 + B ボタンが active、A ボタンは active 解除
    const bSecRow = page.locator('#ppPanel .pp-section-b-enrolled .pp-row').filter({ hasText: '山田太郎' });
    await expect(bSecRow.locator('.pp-add-btn[data-cls="B"]')).toHaveClass(/pp-add-btn-active/);
    await expect(bSecRow.locator('.pp-add-btn[data-cls="A"]')).not.toHaveClass(/pp-add-btn-active/);
  });

  // Devil's Advocate §6 #2: ボタンサイズが背景色追加で変化していないこと(border 厚さ変更なし)
  test('active 状態でも min-width/min-height 44px を満たす', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const aBtn = page.locator('#ppPanel .pp-section-a-enrolled .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]');
    const box = await aBtn.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  // Devil's Advocate §6 #4: 二重視覚言語(セクション位置 + ボタン色)の整合性
  test('A 済セクション内の行は必ず A ボタンが active かつ B ボタンが非 active', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    const aSecRows = page.locator('#ppPanel .pp-section-a-enrolled .pp-row');
    const count = await aSecRows.count();
    for (let i = 0; i < count; i++) {
      const r = aSecRows.nth(i);
      await expect(r.locator('.pp-add-btn[data-cls="A"]')).toHaveClass(/pp-add-btn-active/);
      await expect(r.locator('.pp-add-btn[data-cls="B"]')).not.toHaveClass(/pp-add-btn-active/);
    }
  });
});
