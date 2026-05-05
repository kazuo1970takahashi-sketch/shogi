// @ts-check
// Phase A-3 e2e: 登録画面サジェスト / F7 マスタ編集・削除 / F8 import-export / クイックフィルタ
const { test, expect } = require('@playwright/test');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_dddddddddddd',name:'削除タロウ',yomi:'さくじょたろう',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1'],attendance_count:1,deleted:true,deleted_at:'2026-04-10',member:'member',grade:'ippan',last_class:'A',note:''}
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
// 登録画面サジェスト
// ============================================================
test.describe('A-3 登録画面サジェスト', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
  });

  test('氏名欄に入力するとマスタ候補リストが表示される', async ({ page }) => {
    await page.fill('#inp-name', '山');
    // 山田太郎・山本花子の2件
    await expect(page.locator('#suggest-list .suggest-item')).toHaveCount(2);
    await expect(page.locator('#suggest-list')).toBeVisible();
  });

  test('候補タップでフォームに氏名・クラスが反映される', async ({ page }) => {
    await page.fill('#inp-name', '山田');
    const item = page.locator('#suggest-list .suggest-item').first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    // 山田太郎は last_class:'A'
    await expect(page.locator('#inp-class')).toHaveValue('A');
    // 候補リストが閉じる
    await expect(page.locator('#suggest-list')).toBeHidden();
  });

  test('候補選択 → 追加で参加者行に支部員区分・中学生区分がマスタ前回値で入る', async ({ page }) => {
    // 山田太郎 (member:'other', grade:'chu', last_class:'A') を選択して追加
    await page.fill('#inp-name', '山田');
    await page.locator('#suggest-list .suggest-item').first().click();
    await page.click('#addBtn');
    // A クラスに参加者行が1行追加される
    const rows = page.locator('#a-list .player-row');
    await expect(rows).toHaveCount(1);
    const row = rows.first();
    await expect(row.locator('.player-name')).toHaveText('山田太郎');
    // 行内の支部員区分セレクト = 'other'、中学生区分セレクト = 'chu'
    const selects = row.locator('select');
    await expect(selects.nth(0)).toHaveValue('other');
    await expect(selects.nth(1)).toHaveValue('chu');
  });

  test('候補選択後に氏名を変更すると member_id 引き継ぎが解除される', async ({ page }) => {
    // 候補選択
    await page.fill('#inp-name', '山田');
    await page.locator('#suggest-list .suggest-item').first().click();
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    // 氏名を別文字列に変更（normalizePersonName 後一致しない）
    await page.fill('#inp-name', '別の名前');
    await page.click('#addBtn');
    // 解除されているので、追加された行はデフォルト値（member, ippan）
    const row = page.locator('#a-list .player-row').first();
    await expect(row.locator('.player-name')).toHaveText('別の名前');
    const selects = row.locator('select');
    await expect(selects.nth(0)).toHaveValue('member');
    await expect(selects.nth(1)).toHaveValue('ippan');
  });

  test('削除済み member（deleted=true）は候補に表示されない', async ({ page }) => {
    // 「削除」で検索 → 削除タロウは deleted=true なので候補に出ない
    await page.fill('#inp-name', '削除');
    // 一覧 0 件、または非表示
    await expect(page.locator('#suggest-list .suggest-item')).toHaveCount(0);
  });
});

// ============================================================
// マスタタブ
// ============================================================
test.describe('A-3 マスタタブ', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('マスタ一覧テーブル（ふりがな列・編集・削除ボタン）が表示される', async ({ page }) => {
    const masterPane = page.locator('#pane-master');
    await expect(masterPane).toBeVisible();
    // ふりがな列ヘッダ
    await expect(masterPane.getByRole('columnheader', { name: 'ふりがな' })).toBeVisible();
    // 編集・削除ボタンが存在
    await expect(masterPane.locator('.master-edit-btn').first()).toBeVisible();
    await expect(masterPane.locator('.master-delete-btn').first()).toBeVisible();
    // 削除済みは表示されない
    await expect(masterPane.getByText('削除タロウ')).toHaveCount(0);
    // 生存3名は表示される
    await expect(masterPane.getByText('山田太郎')).toBeVisible();
    await expect(masterPane.getByText('山本花子')).toBeVisible();
    await expect(masterPane.getByText('佐藤一郎')).toBeVisible();
  });

  test('編集ボタン → モーダルで name + yomi を変更して保存できる', async ({ page }) => {
    // 山田太郎の行の編集ボタン
    const targetRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await targetRow.locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    // 既存値が入っていることを確認
    await expect(page.locator('#me-name')).toHaveValue('山田太郎');
    await expect(page.locator('#me-yomi')).toHaveValue('やまだたろう');
    // 編集して保存
    await page.fill('#me-name', '山田 改名');
    await page.fill('#me-yomi', 'やまだ かいめい');
    await page.click('#me-save');
    // モーダルが閉じる
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 一覧に反映（normalize 後: 全角空白→半角、yomi の空白除去）
    await expect(page.locator('#pane-master').getByText('山田 改名')).toBeVisible();
    await expect(page.locator('#pane-master').getByText('やまだかいめい')).toBeVisible();
  });

  test('削除ボタン → confirm 後に一覧から消える', async ({ page }) => {
    // confirm() を accept
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const targetRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await targetRow.locator('.master-delete-btn').click();
    // 削除後、一覧に「山田太郎」が表示されない（tombstone なので非表示）
    await expect(page.locator('#pane-master').getByText('山田太郎')).toHaveCount(0);
    // 他の member は残っている
    await expect(page.locator('#pane-master').getByText('佐藤一郎')).toBeVisible();
  });
});

// ============================================================
// クイックフィルタ
// ============================================================
test.describe('A-3 クイックフィルタ（過去参加者パネル）', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    // 過去参加者パネルを開く
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('「前回参加」ボタンで最終大会日に一致する member だけに絞られる', async ({ page }) => {
    // 初期: 3名（山田太郎・山本花子・佐藤一郎）
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(3);
    // 「前回参加」 = last_attended が最大日 (2026-04-15) と一致 → 佐藤一郎のみ
    await page.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]').click();
    const checks = page.locator('#ppPanel .pp-check');
    await expect(checks).toHaveCount(1);
    await expect(page.locator('#ppPanel').getByText('佐藤一郎')).toBeVisible();
  });

  test('同じフィルタを再タップすると解除される（全件に戻る）', async ({ page }) => {
    // 「常連」 = attendance_count >= 5 → 佐藤一郎のみ
    await page.locator('.pp-quick-filter-btn[data-qfkey="regular"]').click();
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(1);
    // 再タップで解除
    await page.locator('.pp-quick-filter-btn[data-qfkey="regular"]').click();
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(3);
  });

  test('別のフィルタに切り替えると排他選択になる', async ({ page }) => {
    await page.locator('.pp-quick-filter-btn[data-qfkey="regular"]').click();
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).toHaveClass(/active/);
    // 切り替え：前回参加へ
    await page.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]').click();
    // active は前回参加のみ
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]')).toHaveClass(/active/);
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).not.toHaveClass(/active/);
    // 結果は前回参加の絞り込み（佐藤一郎のみ）
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(1);
  });
});

// ============================================================
// F8 エクスポート / インポート
// ============================================================
test.describe('A-3 F8 エクスポート/インポート', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('「マスタをエクスポート」ボタンが存在する', async ({ page }) => {
    await expect(page.locator('#masterExportBtn')).toBeVisible();
    await expect(page.locator('#masterExportBtn')).toHaveText(/マスタをエクスポート/);
  });

  test('「マスタをインポート」ボタンクリックでモーダルが開く（ファイル選択 + 貼り付け両対応）', async ({ page }) => {
    await page.click('#masterImportBtn');
    await expect(page.locator('#master-import-modal')).toBeVisible();
    await expect(page.locator('#mi-file')).toBeVisible();
    await expect(page.locator('#mi-paste-area')).toBeVisible();
    // textarea font-size が 16px 以上（iPhone Safari 自動ズーム回避）
    const fontSize = await page.locator('#mi-paste-area').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test('インポートモーダルに「上書き」「マージ」のラジオが存在する（マージは有効）', async ({ page }) => {
    await page.click('#masterImportBtn');
    const overwriteRadio = page.locator('input[name="mi-mode"][value="overwrite"]');
    const mergeRadio = page.locator('input[name="mi-mode"][value="merge"]');
    await expect(overwriteRadio).toBeVisible();
    await expect(mergeRadio).toBeVisible();
    // Stage 6 で有効化済み
    await expect(mergeRadio).not.toBeDisabled();
  });

  test('上書き選択 + 実行 → 確認ダイアログが出る', async ({ page }) => {
    await page.click('#masterImportBtn');
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    const validJson = JSON.stringify({
      schema_version: 1,
      members: [{id:'m_xxxxxxxxxxxx', name:'新規', yomi:'しんき', first_attended:'2026-05-05', last_attended:'2026-05-05', tournament_ids:[]}]
    });
    await page.locator('#mi-paste-area').fill(validJson);
    let dialogText = '';
    page.once('dialog', async (dialog) => {
      dialogText = dialog.message();
      await dialog.dismiss();
    });
    await page.click('#mi-run');
    // 確認ダイアログのメッセージに「元に戻せません」が含まれる
    await expect.poll(() => dialogText, { timeout: 3000 }).toContain('元に戻せません');
  });

  test('大会データ形式 JSON を貼り付けると過去大会統合機能への案内エラーが出る', async ({ page }) => {
    await page.click('#masterImportBtn');
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    const tournamentJson = JSON.stringify({
      schema_version: 4,
      tournament_id: 't_2026_05_05',
      players: { A: [{id:'p1',name:'X'}], B: [] }
    });
    await page.locator('#mi-paste-area').fill(tournamentJson);
    await page.click('#mi-run');
    // 大会データを誤って入れた場合は明確に「過去大会データ」と「過去大会を支部マスタに統合」へ誘導される
    await expect(page.locator('#mi-status')).toContainText('過去大会データ');
    await expect(page.locator('#mi-status')).toContainText('支部マスタに統合');
  });

  test('不正な JSON を貼り付けると解析エラーが出る', async ({ page }) => {
    await page.click('#masterImportBtn');
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    await page.locator('#mi-paste-area').fill('{ broken json');
    await page.click('#mi-run');
    await expect(page.locator('#mi-status')).toContainText('解析');
  });
});
