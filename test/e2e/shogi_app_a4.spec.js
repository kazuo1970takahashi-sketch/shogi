// @ts-check
// Phase A-4 e2e: 登録画面ふりがな入力欄 / IME 自動取得 / マスタ member/grade /
//                 削除済み復元 / 未入力可視化 / レイアウト揺れ
const { test, expect } = require('@playwright/test');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''}
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
// Stage 1: 登録画面ふりがな入力欄（UIのみ・手動入力）
// ============================================================
test.describe('A-4 Stage 1: 登録画面ふりがな入力欄', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
  });

  test('ふりがな入力欄が表示される', async ({ page }) => {
    const yomi = page.locator('#inp-yomi');
    await expect(yomi).toBeVisible();
    await expect(yomi).toHaveAttribute('placeholder', 'ふりがな');
  });

  test('新規参加者：手動入力したふりがなが saveData 後にマスタへ反映される', async ({ page }) => {
    await page.fill('#inp-name', '田中次郎');
    await page.fill('#inp-yomi', 'たなかじろう');
    await page.click('#addBtn');
    // 大会日が必要（saveData → syncBranchMasterOnSave の前提、result タブを開かず DOM 値を直接設定）
    await page.evaluate(() => {
      var el = document.getElementById('rep-date');
      if (el) { el.value = '2026年5月5日'; el.dispatchEvent(new Event('input', {bubbles:true})); }
    });
    await page.evaluate(() => { try { syncBranchMasterOnSave(); } catch(e) {} });

    const master = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    expect(master).not.toBeNull();
    const found = master.members.find(m => m.name === '田中次郎');
    expect(found).toBeDefined();
    expect(found.yomi).toBe('たなかじろう');
  });

  test('サジェスト選択時：マスタの yomi がふりがな欄に反映される', async ({ page }) => {
    await page.fill('#inp-name', '山田');
    await page.locator('#suggest-list .suggest-item').first().click();
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
  });

  test('サジェスト由来：マスタ yomi が空のときのみ手入力した値で補完（既存値は上書きしない）', async ({ page }) => {
    // 山本花子（マスタ yomi が空）に手入力で補完
    await page.fill('#inp-name', '山本');
    await page.locator('#suggest-list .suggest-item').first().click();
    await expect(page.locator('#inp-name')).toHaveValue('山本花子');
    await expect(page.locator('#inp-yomi')).toHaveValue('');
    await page.fill('#inp-yomi', 'やまもとはなこ');
    await page.click('#addBtn');

    let master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_bbbbbbbbbbbb').yomi).toBe('やまもとはなこ');

    // 山田太郎（マスタ yomi 既存）に違う yomi を手入力 → 上書きしないこと
    await page.fill('#inp-name', '山田');
    await page.locator('#suggest-list .suggest-item').first().click();
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
    await page.fill('#inp-yomi', 'まちがいよみ');
    await page.click('#addBtn');

    master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    // 既存値「やまだたろう」のまま
    expect(master.members.find(m => m.id === 'm_aaaaaaaaaaaa').yomi).toBe('やまだたろう');
  });

  test('addPlayer 成功後：氏名欄とふりがな欄が両方クリアされる', async ({ page }) => {
    await page.fill('#inp-name', '新人タロウ');
    await page.fill('#inp-yomi', 'しんじんたろう');
    await page.click('#addBtn');
    await expect(page.locator('#inp-name')).toHaveValue('');
    await expect(page.locator('#inp-yomi')).toHaveValue('');
  });

  test('removePlayer：_pendingNewYomi がクリアされ、再保存時にマスタに残らない', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.fill('#inp-name', '一時タロウ');
    await page.fill('#inp-yomi', 'いちじたろう');
    await page.click('#addBtn');
    // 削除
    await page.locator('.player-row').filter({ hasText: '一時タロウ' }).locator('button', { hasText: '削除' }).click();
    // syncBranchMasterOnSave を呼ぶ（rep-date は result タブの隠れた DOM のため evaluate で値を入れる）
    await page.evaluate(() => {
      var el = document.getElementById('rep-date');
      if (el) { el.value = '2026年5月5日'; el.dispatchEvent(new Event('input', {bubbles:true})); }
      try { syncBranchMasterOnSave(); } catch(e) {}
    });
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    // 一時タロウはマスタに作られていない（既存3名のみ）
    expect(master.members.filter(m => m.name === '一時タロウ').length).toBe(0);
  });

  test('player オブジェクトに yomi フィールドが追加されていない', async ({ page }) => {
    await page.fill('#inp-name', '田中次郎');
    await page.fill('#inp-yomi', 'たなかじろう');
    await page.click('#addBtn');
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_v4')));
    expect(state.players.A[0].yomi).toBeUndefined();
  });
});
