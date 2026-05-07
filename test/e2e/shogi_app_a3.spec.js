// @ts-check
// Phase A-3 e2e: 登録画面サジェスト / F7 マスタ編集・削除 / F8 import-export / クイックフィルタ
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../helpers/clickAndExpectChange');
const { clickAndExpectChangeUnchecked } = require('../helpers/clickAndExpectChangeUnchecked');
const { shogiAssertions } = require('../helpers/shogi_assertions');

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
    // .suggest-item は addEventListener('mousedown') / inline onclick 不在 → Unchecked。
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
    // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
    // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(item.locator('.si-info'), async (before, after, ctx) => {
      ctx.primary('no player added (form-only update)');
      expect(after.state.players.A.length).toBe(before.state.players.A.length);
      expect(after.state.players.B.length).toBe(before.state.players.B.length);
    });
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    // 山田太郎は last_class:'A'
    await expect(page.locator('#inp-class')).toHaveValue('A');
    // 候補リストが閉じる
    await expect(page.locator('#suggest-list')).toBeHidden();
  });

  test('候補選択 → 追加で参加者行に支部員区分・中学生区分がマスタ前回値で入る', async ({ page }) => {
    // 山田太郎 (member:'other', grade:'chu', last_class:'A') を選択して追加
    await page.fill('#inp-name', '山田');
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
     // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
     // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
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
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
     // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
     // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    // 氏名を別文字列に変更（normalizePersonName 後一致しない）
    await page.fill('#inp-name', '別の名前');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
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

  test('カタカナ入力（ヤマダ）でひらがな yomi にヒットする（yomi 部分一致）', async ({ page }) => {
    await page.fill('#inp-name', 'ヤマダ');
    // 山田太郎（yomi: やまだたろう）にヒット。山本花子（やまもとはなこ）はヒットしない。
    await expect(page.locator('#suggest-list .suggest-item')).toHaveCount(1);
    await expect(page.locator('#suggest-list')).toContainText('山田太郎');
  });

  test('候補選択 → 追加で player.member_id が localStorage の state に保存される', async ({ page }) => {
    await page.fill('#inp-name', '山田');
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
     // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
     // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));

    const state = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_v4');
      return raw ? JSON.parse(raw) : null;
    });
    expect(state).not.toBeNull();
    expect(state.players).toBeDefined();
    expect(state.players.A.length).toBe(1);
    expect(state.players.A[0].member_id).toBe('m_aaaaaaaaaaaa');
    // member / grade もマスタ前回値を保持
    expect(state.players.A[0].member).toBe('other');
    expect(state.players.A[0].grade).toBe('chu');
  });

  test('既登録の member_id は候補リストから除外される（二重追加防止）', async ({ page }) => {
    // 1回目: 山田太郎 を追加
    await page.fill('#inp-name', '山田');
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
     // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
     // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);

    // 2回目: 「山」で検索 → 山田太郎 は除外、山本花子 のみ表示
    await page.fill('#inp-name', '山');
    await expect(page.locator('#suggest-list .suggest-item')).toHaveCount(1);
    await expect(page.locator('#suggest-list')).toContainText('山本花子');
    await expect(page.locator('#suggest-list')).not.toContainText('山田太郎');
  });

  test('同じ氏名を直接再入力して追加するとエラー（同名拒否）', async ({ page }) => {
    // 1回目: 山田太郎 を追加（候補から）
    await page.fill('#inp-name', '山田');
    // .suggest-item の角は親 #suggest-list の border-radius 領域に重なって hit-test が
     // 親要素にヒットするため、Stage 2b と同じく子の .si-info を click target とする
     // (親 .suggest-item の addEventListener('mousedown') がバブリングで発火する)
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);

    // 2回目: 同じ氏名を直接入力 → 候補に出ないが手で入れて追加
    await page.fill('#inp-name', '山田太郎');
    // 同名拒否で player は増えない(raw callback で primary)
    await clickAndExpectChange(page.locator('#addBtn'), async (before, after, ctx, p) => {
      ctx.primary('duplicate name rejected (no addition)');
      expect(after.state.players.A.length).toBe(before.state.players.A.length);
      await expect(p.locator('#reg-msg')).toContainText('同じ名前の参加者がいます');
    });
    // 行数は増えていない
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
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

  // master-list 列構成変更(2026-05-08): ふりがな列を撤廃 → ヘッダ存在 assert を「氏名」「支部員区分」に変更
  test('マスタ一覧テーブル（5 列構成・編集・削除ボタン）が表示される', async ({ page }) => {
    const masterPane = page.locator('#pane-master');
    await expect(masterPane).toBeVisible();
    // 5 列ヘッダ(ふりがな列は撤廃)
    await expect(masterPane.getByRole('columnheader', { name: '氏名' })).toBeVisible();
    await expect(masterPane.getByRole('columnheader', { name: '支部員区分' })).toBeVisible();
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
    // 山田太郎の行の編集ボタン → 編集モーダルが開く(state 不変、L0 §1.5 P1)
    const targetRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await clickAndExpectChange(targetRow.locator('.master-edit-btn'), async (before, after, ctx, p) => {
      ctx.primary('master edit modal opened');
      await expect(p.locator('#master-edit-modal')).toBeVisible();
    });
    // 既存値が入っていることを確認
    await expect(page.locator('#me-name')).toHaveValue('山田太郎');
    await expect(page.locator('#me-yomi')).toHaveValue('やまだたろう');
    // 編集して保存
    await page.fill('#me-name', '山田 改名');
    await page.fill('#me-yomi', 'やまだ かいめい');
    await clickAndExpectChange(
      page.locator('#me-save'),
      shogiAssertions.masterMemberEdited('m_aaaaaaaaaaaa')
    );
    // モーダルが閉じる
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 一覧の氏名に反映（master-list 列構成変更でふりがな列撤廃、氏名のみ確認）
    await expect(page.locator('#pane-master').getByText('山田 改名')).toBeVisible();
    // ふりがな(やまだかいめい)は localStorage で確認(F7 編集モーダル内では確認可、一覧には非表示)
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').yomi).toBe('やまだかいめい');
  });

  test('削除ボタン → confirm 後に一覧から消える', async ({ page }) => {
    // confirm() を accept
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const targetRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await clickAndExpectChange(
      targetRow.locator('.master-delete-btn'),
      shogiAssertions.masterMemberDeleted('m_aaaaaaaaaaaa')
    );
    // 削除後、一覧に「山田太郎」が表示されない（tombstone なので非表示）
    await expect(page.locator('#pane-master').getByText('山田太郎')).toHaveCount(0);
    // 他の member は残っている
    await expect(page.locator('#pane-master').getByText('佐藤一郎')).toBeVisible();
  });

  test('削除は tombstone（物理削除なし、deleted=true + deleted_at 設定）', async ({ page }) => {
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    const targetRow = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await clickAndExpectChange(
      targetRow.locator('.master-delete-btn'),
      shogiAssertions.masterMemberDeleted('m_aaaaaaaaaaaa')
    );
    // UI 上は消える
    await expect(page.locator('#pane-master').getByText('山田太郎')).toHaveCount(0);
    // localStorage 検証: members 配列に残っており tombstone が立っている
    const stored = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    // 元の 4 件すべて残る（物理削除なし）
    expect(stored.members.length).toBe(4);
    const target = stored.members.find((m) => m.id === 'm_aaaaaaaaaaaa');
    expect(target).toBeDefined();
    expect(target.deleted).toBe(true);
    // 日付フォーマット YYYY-MM-DD
    expect(target.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 他の生存 member は影響なし
    const m_b = stored.members.find((m) => m.id === 'm_bbbbbbbbbbbb');
    expect(m_b.deleted).toBe(false);
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
    // クイックフィルタは L0 §1.5 P1: state を持たない UI 状態変化のため raw callback で
    // primary は「.pp-check 件数が絞り込まれる」(3 → 1)
    await clickAndExpectChange(
      page.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]'),
      async (before, after, ctx, p) => {
        ctx.primary('quick filter applied: row count narrowed');
        await expect(p.locator('#ppPanel .pp-check')).toHaveCount(1);
      }
    );
    const checks = page.locator('#ppPanel .pp-check');
    await expect(checks).toHaveCount(1);
    await expect(page.locator('#ppPanel').getByText('佐藤一郎')).toBeVisible();
  });

  test('同じフィルタを再タップすると解除される（全件に戻る）', async ({ page }) => {
    // 「常連」 = attendance_count >= 5 → 佐藤一郎のみ
    await clickAndExpectChange(
      page.locator('.pp-quick-filter-btn[data-qfkey="regular"]'),
      async (before, after, ctx, p) => {
        ctx.primary('quick filter applied: row count narrowed to 1');
        await expect(p.locator('#ppPanel .pp-check')).toHaveCount(1);
      }
    );
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(1);
    // 再タップで解除
    await clickAndExpectChange(
      page.locator('.pp-quick-filter-btn[data-qfkey="regular"]'),
      async (before, after, ctx, p) => {
        ctx.primary('quick filter cleared: all rows back');
        await expect(p.locator('#ppPanel .pp-check')).toHaveCount(3);
      }
    );
    await expect(page.locator('#ppPanel .pp-check')).toHaveCount(3);
  });

  test('別のフィルタに切り替えると排他選択になる', async ({ page }) => {
    await clickAndExpectChange(
      page.locator('.pp-quick-filter-btn[data-qfkey="regular"]'),
      async (before, after, ctx, p) => {
        ctx.primary('quick filter "regular" applied (active class set)');
        await expect(p.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).toHaveClass(/active/);
      }
    );
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).toHaveClass(/active/);
    // 切り替え：前回参加へ
    await clickAndExpectChange(
      page.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]'),
      async (before, after, ctx, p) => {
        ctx.primary('quick filter switched: recent_last active, regular inactive');
        await expect(p.locator('.pp-quick-filter-btn[data-qfkey="recent_last"]')).toHaveClass(/active/);
        await expect(p.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).not.toHaveClass(/active/);
      }
    );
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
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    await expect(page.locator('#mi-file')).toBeVisible();
    await expect(page.locator('#mi-paste-area')).toBeVisible();
    // textarea font-size が 16px 以上（iPhone Safari 自動ズーム回避）
    const fontSize = await page.locator('#mi-paste-area').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test('インポートモーダルに「上書き」「マージ」のラジオが存在する（マージは有効）', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    const overwriteRadio = page.locator('input[name="mi-mode"][value="overwrite"]');
    const mergeRadio = page.locator('input[name="mi-mode"][value="merge"]');
    await expect(overwriteRadio).toBeVisible();
    await expect(mergeRadio).toBeVisible();
    // Stage 6 で有効化済み
    await expect(mergeRadio).not.toBeDisabled();
  });

  test('上書き選択 + 実行 → 確認ダイアログが出る', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
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
    // dismiss なので master 不変、primary は dialog 文言確認
    await clickAndExpectChange(page.locator('#mi-run'), async (before, after, ctx) => {
      ctx.primary('overwrite confirmation dialog appeared with warning text');
      await expect.poll(() => dialogText, { timeout: 3000 }).toContain('元に戻せません');
      // dismiss なので master は変更されない
      expect(after.master.members.length).toBe(before.master.members.length);
    });
  });

  test('大会データ形式 JSON を貼り付けると過去大会統合機能への案内エラーが出る', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    const tournamentJson = JSON.stringify({
      schema_version: 4,
      tournament_id: 't_2026_05_05',
      players: { A: [{id:'p1',name:'X'}], B: [] }
    });
    await page.locator('#mi-paste-area').fill(tournamentJson);
    // エラーケース: master 不変、primary は #mi-status の案内文言
    await clickAndExpectChange(page.locator('#mi-run'), async (before, after, ctx, p) => {
      ctx.primary('error: tournament data rejected with guidance to merge feature');
      await expect(p.locator('#mi-status')).toContainText('過去大会データ');
      await expect(p.locator('#mi-status')).toContainText('支部マスタに統合');
      expect(after.master.members.length).toBe(before.master.members.length);
    });
  });

  test('不正な JSON を貼り付けると解析エラーが出る', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    await page.locator('#mi-paste-area').fill('{ broken json');
    // エラーケース: master 不変、primary は #mi-status のエラー文言
    await clickAndExpectChange(page.locator('#mi-run'), async (before, after, ctx, p) => {
      ctx.primary('error: parse error shown, master unchanged');
      await expect(p.locator('#mi-status')).toContainText('解析');
      expect(after.master.members.length).toBe(before.master.members.length);
    });
  });

  test('エクスポート実行後、localStorage の branch master は schema_version:1 と members を保持する', async ({ page }) => {
    // alert と download を吸収
    page.on('dialog', async (dialog) => { await dialog.accept(); });
    // 仕様書 §4 の masterExport は production 実装が clipboard ではなく Blob+anchor download
    // のため、download primary + master 不変 の raw callback で対応(末尾 commit で
    // 仕様書 §4 を「download primary」に修正同梱)
    let downloadPromise;
    await clickAndExpectChange(
      page.locator('#masterExportBtn'),
      async (before, after, ctx) => {
        ctx.primary('download triggered with master json filename, master unchanged');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^shogi_branch_master_\d{4}-\d{2}-\d{2}\.json$/);
        // localStorage の branch master が壊れていない(エクスポートは read-only)
        expect(after.localStorage.shogi_branch_master).toBe(before.localStorage.shogi_branch_master);
      },
      { beforeClick: () => { downloadPromise = page.waitForEvent('download'); } }
    );
    // 補助: localStorage の中身検証(従来テストの assertion を温存)
    const stored = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    expect(stored.schema_version).toBe(1);
    expect(Array.isArray(stored.members)).toBe(true);
    expect(stored.members.length).toBe(4);  // tombstone 含む
  });

  test('上書きインポート実行で localStorage の branch master が置換される', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    await page.locator('input[name="mi-mode"][value="overwrite"]').check();
    const newMaster = {
      schema_version: 1,
      updated_at: '2026-05-05T13:00:00.000Z',
      members: [
        {id:'m_zzzzzzzzzzzz',name:'置換太郎',yomi:'ちかんたろう',first_attended:'2026-05-05',last_attended:'2026-05-05',tournament_ids:['t_new']},
        {id:'m_yyyyyyyyyyyy',name:'置換次郎',yomi:'ちかんじろう',first_attended:'2026-05-05',last_attended:'2026-05-05',tournament_ids:[]}
      ]
    };
    await page.locator('#mi-paste-area').fill(JSON.stringify(newMaster));
    // 確認ダイアログを accept
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    // 上書き: 4 → 2(expectedNewCount: -2、existingMemberIds=[] 既存非保持、tombstone なし)
    await clickAndExpectChange(
      page.locator('#mi-run'),
      shogiAssertions.masterImported({ expectedNewCount: -2 }),
      { afterClick: async (p) => { await expect(p.locator('#master-import-modal')).toHaveCount(0); } }
    );

    // localStorage 検証: 完全置換（元の 4 件 → 新 2 件）
    const stored = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.members.length).toBe(2);
    const ids = stored.members.map((m) => m.id).sort();
    expect(ids).toEqual(['m_yyyyyyyyyyyy', 'm_zzzzzzzzzzzz']);
    // 元のメンバー（山田太郎 m_aaaaaaaaaaaa 等）はもう存在しない
    expect(stored.members.find((m) => m.id === 'm_aaaaaaaaaaaa')).toBeUndefined();
  });

  test('マージインポート実行で 新規追加 + 既存 name は既存側維持', async ({ page }) => {
    await clickAndExpectChange(page.locator('#masterImportBtn'), async (before, after, ctx, p) => {
      ctx.primary('master import modal opened');
      await expect(p.locator('#master-import-modal')).toBeVisible();
    });
    await page.locator('input[name="mi-mode"][value="merge"]').check();
    // imported: 既存 m_aaaaaaaaaaaa の name を別名にしたものと、新規 m_eeeeeeeeeeee
    const importMaster = {
      schema_version: 1,
      updated_at: '2026-05-05T13:00:00.000Z',
      members: [
        {id:'m_aaaaaaaaaaaa',name:'別の名前',yomi:'べつのなまえ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t_new']},
        {id:'m_eeeeeeeeeeee',name:'新規メンバー',yomi:'しんき',first_attended:'2026-05-05',last_attended:'2026-05-05',tournament_ids:['t_e']}
      ]
    };
    await page.locator('#mi-paste-area').fill(JSON.stringify(importMaster));
    // マージ: 4 → 5(expectedNewCount: 1、既存 m_aaaaaaaaaaaa の name/yomi は既存側維持)
    await clickAndExpectChange(
      page.locator('#mi-run'),
      shogiAssertions.masterImported({
        expectedNewCount: 1,
        existingMemberIds: ['m_aaaaaaaaaaaa'],
      }),
      { afterClick: async (p) => { await expect(p.locator('#master-import-modal')).toHaveCount(0); } }
    );

    // localStorage 検証
    const stored = await page.evaluate(() => {
      var raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    // 元の 4 件 + 新規 1 件 = 5 件
    expect(stored.members.length).toBe(5);
    // 既存 m_aaaaaaaaaaaa は name 維持（既存側優先）
    const m_a = stored.members.find((m) => m.id === 'm_aaaaaaaaaaaa');
    expect(m_a.name).toBe('山田太郎');
    expect(m_a.yomi).toBe('やまだたろう');
    // tournament_ids は union（t1, t2, t_new）
    expect(m_a.tournament_ids).toEqual(expect.arrayContaining(['t1', 't2', 't_new']));
    // 新規 m_eeeeeeeeeeee は追加されている
    const m_e = stored.members.find((m) => m.id === 'm_eeeeeeeeeeee');
    expect(m_e).toBeDefined();
    expect(m_e.name).toBe('新規メンバー');
  });
});
