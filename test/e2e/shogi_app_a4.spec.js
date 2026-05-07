// @ts-check
// Phase A-4 e2e: 登録画面ふりがな入力欄 / IME 自動取得 / マスタ member/grade /
//                 削除済み復元 / 未入力可視化 / レイアウト揺れ
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../helpers/clickAndExpectChange');
const { clickAndExpectChangeUnchecked } = require('../helpers/clickAndExpectChangeUnchecked');
const { shogiAssertions } = require('../helpers/shogi_assertions');

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

  test('新規参加者：手動入力したふりがなが saveData 後にマスタへ反映される', async ({ context, page }) => {
    // §5 標準手順 完全書き直し: 旧 evaluate(syncBranchMasterOnSave) 直接呼出を
    // #saveBtn UI クリック経由に置換(production: saveData() 内で
    // syncBranchMasterOnSave 自動発火 + clipboard.writeText + alert)
    // Step 1: clipboard 権限付与
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.fill('#inp-name', '田中次郎');
    await page.fill('#inp-yomi', 'たなかじろう');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    // 大会日が必要（saveData → syncBranchMasterOnSave の前提、result タブを開かず DOM 値を直接設定）
    await page.evaluate(() => {
      var el = document.getElementById('rep-date');
      if (el) { el.value = '2026年5月5日'; el.dispatchEvent(new Event('input', {bubbles:true})); }
    });
    // Step 2: UI 経由フロー化(saveData → syncBranchMasterOnSave → clipboard + alert)
    page.on('dialog', d => d.accept());
    // Step 3: primary は「saveData 後 master.members に 田中次郎 が yomi='たなかじろう' で追加される」
    await clickAndExpectChange(page.locator('#saveBtn'), async (before, after, ctx) => {
      ctx.primary('saveData → syncBranchMasterOnSave: 田中次郎 added to master with yomi');
      const found = after.master.members.find(m => m.name === '田中次郎');
      expect(found).toBeDefined();
      expect(found.yomi).toBe('たなかじろう');
    });
    // Step 4: 副次効果検証(localStorage.shogi_branch_master 直接読み)
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
    // .suggest-item は addEventListener('mousedown') 経由 → Unchecked、子の .si-info を click
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
  });

  test('サジェスト由来：マスタ yomi が空のときのみ手入力した値で補完（既存値は上書きしない）', async ({ page }) => {
    // 山本花子（マスタ yomi が空）に手入力で補完
    await page.fill('#inp-name', '山本');
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await expect(page.locator('#inp-name')).toHaveValue('山本花子');
    await expect(page.locator('#inp-yomi')).toHaveValue('');
    await page.fill('#inp-yomi', 'やまもとはなこ');
    // 山本花子 last_class='B' → サジェスト選択で #inp-class が B に自動設定 → B クラスに追加
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('B'));

    let master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_bbbbbbbbbbbb').yomi).toBe('やまもとはなこ');

    // 山田太郎（マスタ yomi 既存）に違う yomi を手入力 → 上書きしないこと
    await page.fill('#inp-name', '山田');
    await clickAndExpectChangeUnchecked(
      page.locator('#suggest-list .suggest-item').first().locator('.si-info'),
      async (before, after, ctx) => {
        ctx.primary('no player added (form-only update)');
        expect(after.state.players.A.length).toBe(before.state.players.A.length);
        expect(after.state.players.B.length).toBe(before.state.players.B.length);
      }
    );
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
    await page.fill('#inp-yomi', 'まちがいよみ');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));

    master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    // 既存値「やまだたろう」のまま
    expect(master.members.find(m => m.id === 'm_aaaaaaaaaaaa').yomi).toBe('やまだたろう');
  });

  test('addPlayer 成功後：氏名欄とふりがな欄が両方クリアされる', async ({ page }) => {
    await page.fill('#inp-name', '新人タロウ');
    await page.fill('#inp-yomi', 'しんじんたろう');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    await expect(page.locator('#inp-name')).toHaveValue('');
    await expect(page.locator('#inp-yomi')).toHaveValue('');
  });

  test('removePlayer：_pendingNewYomi がクリアされ、再保存時にマスタに残らない', async ({ context, page }) => {
    // §5 標準手順 完全書き直し: 旧 evaluate(syncBranchMasterOnSave) 直接呼出を
    // #saveBtn UI クリック経由に置換
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('dialog', d => d.accept());
    await page.fill('#inp-name', '一時タロウ');
    await page.fill('#inp-yomi', 'いちじたろう');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    // 削除(.player-row 内の削除ボタン、L0 P0 catalog 未登録のため raw callback で対応)
    // TODO: L0 §1.5 見直し時に playerRemoved factory 化検討(仕様書 §4 申し送り)
    await clickAndExpectChange(
      page.locator('.player-row').filter({ hasText: '一時タロウ' }).locator('button', { hasText: '削除' }),
      async (before, after, ctx) => {
        ctx.primary('player removed from class A: state.players.A length -1');
        expect(after.state.players.A.length).toBe(before.state.players.A.length - 1);
      }
    );
    // 大会日設定(syncBranchMasterOnSave の前提、result タブの隠れた DOM のため evaluate)
    await page.evaluate(() => {
      var el = document.getElementById('rep-date');
      if (el) { el.value = '2026年5月5日'; el.dispatchEvent(new Event('input', {bubbles:true})); }
    });
    // UI 経由保存(saveData → syncBranchMasterOnSave 自動発火)
    // primary: 削除済の '一時タロウ' は master に作られていない
    await clickAndExpectChange(page.locator('#saveBtn'), async (before, after, ctx) => {
      ctx.primary('saveData → syncBranchMasterOnSave: removed player not in master');
      const trace = after.master.members.filter(m => m.name === '一時タロウ');
      expect(trace.length).toBe(0);
    });
    // 副次: localStorage 直接読み
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.filter(m => m.name === '一時タロウ').length).toBe(0);
  });

  test('player オブジェクトに yomi フィールドが追加されていない', async ({ page }) => {
    await page.fill('#inp-name', '田中次郎');
    await page.fill('#inp-yomi', 'たなかじろう');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_v4')));
    expect(state.players.A[0].yomi).toBeUndefined();
  });
});

// ============================================================
// Stage 2: IME 自動取得（synthetic CompositionEvent ベース／Should Fix 3）
// ============================================================
//   注: iPhone Safari の実機 IME 挙動は Playwright で完全再現できないため、
//       compositionstart / compositionupdate / compositionend を手動 dispatch して
//       ロジック単体を検証する。実機確認は A-4 完了条件として別途残す。
async function imeCompose(page, hiraganaSeq, finalKanji) {
  await page.evaluate(({ seq, kanji }) => {
    const el = document.getElementById('inp-name');
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    let last = '';
    for (const piece of seq) {
      last = piece;
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: piece }));
    }
    // 確定（漢字変換した場合は kanji を、しない場合は最後のひらがなをそのまま）
    const finalText = (kanji != null) ? kanji : last;
    // 漢字変換中の compositionupdate（kanji が data として来る）→ 仕様: 非ひらがなは無視
    if (kanji != null) {
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: kanji }));
    }
    el.value = (el.value || '') + finalText;
    el.dispatchEvent(new CompositionEvent('compositionend', { data: finalText }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { seq: hiraganaSeq, kanji: finalKanji });
}

test.describe('A-4 Stage 2: IME 自動取得', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
  });

  test('IME 入力（漢字変換あり）でふりがな欄にひらがなが追記される', async ({ page }) => {
    await imeCompose(page, ['や', 'やま', 'やまだ'], '山田');
    await imeCompose(page, ['た', 'たろ', 'たろう'], '太郎');
    await expect(page.locator('#inp-name')).toHaveValue('山田太郎');
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
  });

  test('苗字・名前を別々に変換した場合、ふりがなが累積される', async ({ page }) => {
    await imeCompose(page, ['や', 'やま', 'やまだ'], '山田');
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだ');
    await imeCompose(page, ['た', 'たろう'], '太郎');
    await expect(page.locator('#inp-yomi')).toHaveValue('やまだたろう');
  });

  test('ふりがな欄を手動編集した後、IME イベントで上書きされない', async ({ page }) => {
    await page.fill('#inp-yomi', 'てどうにゅう');
    // 手動編集後は IME 確定でも追記されない
    await imeCompose(page, ['や', 'やま', 'やまだ'], '山田');
    await expect(page.locator('#inp-yomi')).toHaveValue('てどうにゅう');
  });

  test('漢字をコピペした場合、ふりがな欄は空のまま（compositionend が発火しないケース）', async ({ page }) => {
    // ペースト相当: input イベントのみで CompositionEvent なし
    await page.evaluate(() => {
      const el = document.getElementById('inp-name');
      el.value = '佐藤一郎';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#inp-yomi')).toHaveValue('');
    // 手動入力できる
    await page.fill('#inp-yomi', 'さとういちろう');
    await expect(page.locator('#inp-yomi')).toHaveValue('さとういちろう');
  });

  test('サジェスト選択後にふりがな欄を手動修正 → 修正後 yomi がマスタに反映される', async ({ page }) => {
    // 山本花子（マスタ yomi 空）を選択
    await page.fill('#inp-name', '山本');
    await page.locator('#suggest-list .suggest-item').first().click();
    // ふりがな欄を手動編集（_yomiManuallyEdited=true になる）
    await page.fill('#inp-yomi', 'やまもとはなこ');
    await page.click('#addBtn');
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_bbbbbbbbbbbb').yomi).toBe('やまもとはなこ');
  });

  test('addPlayer 成功後、_yomiManuallyEdited / _yomiAutoBuffer がリセットされる', async ({ page }) => {
    await page.fill('#inp-name', 'タロウ');
    await page.fill('#inp-yomi', 'たろう');
    await page.click('#addBtn');
    const flags = await page.evaluate(() => ({
      manual: typeof _yomiManuallyEdited !== 'undefined' ? _yomiManuallyEdited : null,
      buffer: typeof _yomiAutoBuffer !== 'undefined' ? _yomiAutoBuffer : null
    }));
    expect(flags.manual).toBe(false);
    expect(flags.buffer).toBe('');
  });

  test('氏名欄をクリアすると _yomiManuallyEdited がリセットされる', async ({ page }) => {
    // 手動編集状態を作る
    await page.fill('#inp-yomi', 'てどうにゅう');
    await page.fill('#inp-name', 'テスト');
    let manual = await page.evaluate(() => _yomiManuallyEdited);
    expect(manual).toBe(true);
    // 氏名欄をクリア
    await page.fill('#inp-name', '');
    manual = await page.evaluate(() => _yomiManuallyEdited);
    expect(manual).toBe(false);
  });
});

// ============================================================
// Stage 3: マスタ一覧 + 編集モーダル member/grade 表示・編集
// ============================================================
test.describe('A-4 Stage 3: マスタ一覧 区分列', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('一覧テーブルに「区分」列ヘッダが表示される', async ({ page }) => {
    await expect(page.locator('#pane-master').getByRole('columnheader', { name: '区分' })).toBeVisible();
  });

  test('支部員区分・中学生以下区分が一覧に2段表示される', async ({ page }) => {
    // 山田太郎: member='other', grade='chu' → "他" + "中学"
    const row1 = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    const cell1 = row1.locator('td.master-cell-grade');
    await expect(cell1).toContainText('他');
    await expect(cell1).toContainText('中学');
    // 佐藤一郎: member='member', grade='ippan' → "支部員" のみ（中学行は出ない）
    const row2 = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    const cell2 = row2.locator('td.master-cell-grade');
    await expect(cell2).toContainText('支部員');
    await expect(cell2).not.toContainText('中学');
  });
});

test.describe('A-4 Stage 3: マスタ編集モーダル', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
  });

  test('編集モーダルに支部員区分・中学生以下のラジオが現在値で表示される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    // 山田太郎: member='other', grade='chu'
    await expect(page.locator('input[name="me-member"][value="other"]')).toBeChecked();
    await expect(page.locator('input[name="me-grade"][value="chu"]')).toBeChecked();
  });

  test('履歴情報（初回・最終・回数）が読み取り専用で表示される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    const hist = page.locator('#me-history');
    await expect(hist).toBeVisible();
    await expect(hist).toContainText('初回参加：2026-01-01');
    await expect(hist).toContainText('最終参加：2026-04-01');
    await expect(hist).toContainText('参加回数：2回');
  });

  test('支部員区分を変更して保存 → localStorage に反映される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await row.locator('.master-edit-btn').click();
    // member: member → other に切り替え
    await page.check('input[name="me-member"][value="other"]');
    await page.click('#me-save');
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_cccccccccccc').member).toBe('other');
    // grade は触っていない → 不変
    expect(master.members.find(m => m.id === 'm_cccccccccccc').grade).toBe('ippan');
  });

  test('中学生以下区分を変更して保存 → localStorage に反映される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await row.locator('.master-edit-btn').click();
    await page.check('input[name="me-grade"][value="chu"]');
    await page.click('#me-save');
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_cccccccccccc').grade).toBe('chu');
  });

  test('一覧表示が更新される（編集後 renderMasterTab で再描画）', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await row.locator('.master-edit-btn').click();
    await page.check('input[name="me-grade"][value="chu"]');
    await page.click('#me-save');
    // 再描画後の佐藤一郎の行に「中学」が表示される
    const row2 = page.locator('#pane-master tbody tr').filter({ hasText: '佐藤一郎' });
    await expect(row2.locator('td.master-cell-grade')).toContainText('中学');
  });
});

// ============================================================
// Stage 4: 削除済み member 復元 UI
// ============================================================

const MASTER_WITH_DELETED = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_dddddddddddd',name:'削除タロウ',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1'],attendance_count:1,deleted:true,deleted_at:'2026-04-10',member:'member',grade:'ippan',last_class:'A',note:''}
  ]
};

test.describe('A-4 Stage 4: 削除済み表示トグル', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page, MASTER_WITH_DELETED);
    await page.click('#tab-master');
  });

  test('トグルOFF（既定）: 削除済み member は表示されない', async ({ page }) => {
    await expect(page.locator('#pane-master').getByText('削除タロウ')).toHaveCount(0);
    // 登録数は生存のみ（2名）
    await expect(page.locator('#pane-master')).toContainText('登録: 2名');
    // 復元ボタンも出ない
    await expect(page.locator('.master-restore-btn')).toHaveCount(0);
  });

  test('トグルON: 削除済み member が薄背景・取り消し線で表示され、削除日時と復元ボタンが出る', async ({ page }) => {
    await page.click('#masterShowDeletedBtn');
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '削除タロウ' });
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/master-row-deleted/);
    await expect(row).toContainText('削除日：2026-04-10');
    await expect(row.locator('.master-restore-btn')).toBeVisible();
    // 編集・削除ボタンは出ない
    await expect(row.locator('.master-edit-btn')).toHaveCount(0);
    await expect(row.locator('.master-delete-btn')).toHaveCount(0);
  });

  test('トグル文言が状態で切り替わる', async ({ page }) => {
    await expect(page.locator('#masterShowDeletedBtn')).toContainText('削除済みを表示');
    await page.click('#masterShowDeletedBtn');
    await expect(page.locator('#masterShowDeletedBtn')).toContainText('削除済みを隠す');
  });
});

test.describe('A-4 Stage 4: 復元ボタン', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page, MASTER_WITH_DELETED);
    await page.click('#tab-master');
    await page.click('#masterShowDeletedBtn');
  });

  test('復元 confirm cancel では復元されない', async ({ page }) => {
    page.once('dialog', d => d.dismiss());
    await page.locator('.master-restore-btn').click();
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(master.members.find(m => m.id === 'm_dddddddddddd').deleted).toBe(true);
  });

  test('復元 confirm accept で localStorage が deleted=false / deleted_at=null', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.locator('.master-restore-btn').click();
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    const target = master.members.find(m => m.id === 'm_dddddddddddd');
    expect(target.deleted).toBe(false);
    expect(target.deleted_at).toBe(null);
    // 復元後、通常マスタ一覧（トグルOFF状態にしない場合でも生存リストに含まれる）
    await expect(page.locator('#pane-master')).toContainText('登録: 3名');
  });

  test('復元後、登録画面サジェスト候補に再表示される', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.locator('.master-restore-btn').click();
    // 登録タブへ
    await page.click('#tab-reg');
    await page.fill('#inp-name', '削除');
    // 候補リストに「削除タロウ」が出る
    await expect(page.locator('#suggest-list')).toContainText('削除タロウ');
  });

  test('復元後、過去参加者パネルに再表示される', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.locator('.master-restore-btn').click();
    await page.click('#tab-reg');
    // 過去参加者パネルを開く
    const panelToggle = page.locator('#ppToggleBtn');
    if (await panelToggle.isVisible()) await panelToggle.click();
    await expect(page.locator('#ppPanel')).toContainText('削除タロウ');
  });

  test('復元後、yomi 未入力なら未入力マスタの一員として残る（Stage 5 の検証下準備）', async ({ page }) => {
    // 削除タロウの yomi は空
    page.once('dialog', d => d.accept());
    await page.locator('.master-restore-btn').click();
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    const target = master.members.find(m => m.id === 'm_dddddddddddd');
    expect(target.deleted).toBe(false);
    expect(target.yomi).toBe('');
  });
});

// ============================================================
// Stage 5: ふりがな未入力可視化（サマリー / バッジ / クイックフィルタ）
// ============================================================

// 未入力者を含むマスタ（生存3名のうち2名 yomi 未入力）
const MASTER_WITH_NO_YOMI = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'   ',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''}
  ]
};

test.describe('A-4 Stage 5: マスタタブ ふりがな未入力サマリー・バッジ', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page, MASTER_WITH_NO_YOMI);
    await page.click('#tab-master');
  });

  test('サマリーに「うちふりがな未入力: N名」が表示される', async ({ page }) => {
    await expect(page.locator('#master-no-yomi-summary')).toContainText('（うちふりがな未入力:');
    await expect(page.locator('#master-no-yomi-summary')).toContainText('2名');
  });

  test('サマリー数と一覧バッジ数が一致する', async ({ page }) => {
    const summaryText = await page.locator('#master-no-yomi-summary').innerText();
    // "（うちふりがな未入力: 2名）"
    const match = summaryText.match(/(\d+)名/);
    expect(match).not.toBeNull();
    const summaryCount = Number(match[1]);
    const badgeCount = await page.locator('.master-no-yomi-badge').count();
    expect(badgeCount).toBe(summaryCount);
    expect(summaryCount).toBe(2);
  });

  test('未入力 member の行に ⚠️ 未入力 バッジが表示される', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山本花子' });
    await expect(row.locator('.master-no-yomi-badge')).toBeVisible();
    await expect(row.locator('.master-no-yomi-badge')).toContainText('未入力');
  });

  test('入力済み member の行にはバッジが出ない', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await expect(row.locator('.master-no-yomi-badge')).toHaveCount(0);
  });
});

test.describe('A-4 Stage 5: 過去参加者パネルのクイックフィルタ', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page, MASTER_WITH_NO_YOMI);
    // 過去参加者パネルを開く
    const panelToggle = page.locator('#ppToggleBtn');
    if (await panelToggle.isVisible()) await panelToggle.click();
  });

  test('「ふりがな未入力」フィルタボタンが表示される', async ({ page }) => {
    const btn = page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('ふりがな未入力');
  });

  test('フィルタ ON で結果数 = サマリー数（マスタタブとの一致）', async ({ page }) => {
    await page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]').click();
    // ppPanel に表示される member 行数（生存3名中の未入力2名）
    const items = page.locator('#ppPanel [data-mid]');
    const count = await items.count();
    expect(count).toBe(2);
    // 山本花子 / 佐藤一郎 が含まれ、山田太郎は含まれない
    await expect(page.locator('#ppPanel')).toContainText('山本花子');
    await expect(page.locator('#ppPanel')).toContainText('佐藤一郎');
    await expect(page.locator('#ppPanel')).not.toContainText('山田太郎');
  });

  test('排他選択：別フィルタを押すと「ふりがな未入力」は外れる', async ({ page }) => {
    await page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]').click();
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]')).toHaveClass(/active/);
    await page.locator('.pp-quick-filter-btn[data-qfkey="regular"]').click();
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]')).not.toHaveClass(/active/);
    await expect(page.locator('.pp-quick-filter-btn[data-qfkey="regular"]')).toHaveClass(/active/);
  });

  test('検索との AND 条件：「ふりがな未入力」+ 検索「山本」→ 山本花子のみ', async ({ page }) => {
    await page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]').click();
    await page.fill('#pp-search', '山本');
    const items = page.locator('#ppPanel [data-mid]');
    const count = await items.count();
    expect(count).toBe(1);
    await expect(page.locator('#ppPanel')).toContainText('山本花子');
  });

  test('50音タブとの AND 条件：「ふりがな未入力」+ 「他」タブ → 未入力 + 他カテゴリ', async ({ page }) => {
    // 「他」タブは yomi 空 + getYomiInitialRow が other の人 → 未入力2名は両方とも該当する
    await page.locator('.pp-quick-filter-btn[data-qfkey="no_yomi"]').click();
    await page.locator('.pp-yomi-tab[data-row="other"]').click();
    const items = page.locator('#ppPanel [data-mid]');
    const count = await items.count();
    expect(count).toBe(2);
  });
});

// ============================================================
// Stage 6: スマホレイアウト揺れ 1px 許容 e2e（Should Fix 5 / 回帰防止）
//   - 揺れ自体の原因修正は A-4.1 で実施（iPhone Safari 実機計測必要）
//   - 本テストは Chromium で「横スクロールが発生していない」ことの回帰防止
// ============================================================
async function expectNoOverflow(page, label) {
  const m = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    bodyW: document.body.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(m.docW - m.innerW, `[${label}] documentElement.scrollWidth (${m.docW}) - innerWidth (${m.innerW})`).toBeLessThanOrEqual(1);
  expect(m.bodyW - m.innerW, `[${label}] body.scrollWidth (${m.bodyW}) - innerWidth (${m.innerW})`).toBeLessThanOrEqual(1);
}

for (const width of [375, 430]) {
  test.describe('A-4 Stage 6: 横スクロール検出 ' + width + 'px', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setupWithMaster(page, MASTER_WITH_DELETED);
    });

    test('参加者登録タブで横スクロールしない', async ({ page }) => {
      await page.click('#tab-reg');
      await expectNoOverflow(page, 'reg @' + width);
    });

    test('対局管理タブで横スクロールしない', async ({ page }) => {
      await page.click('#tab-tournament');
      await expectNoOverflow(page, 'tournament @' + width);
    });

    test('最終結果タブで横スクロールしない', async ({ page }) => {
      await page.click('#tab-result');
      await expectNoOverflow(page, 'result @' + width);
    });

    test('マスタタブで横スクロールしない', async ({ page }) => {
      await page.click('#tab-master');
      await expectNoOverflow(page, 'master @' + width);
    });

    test('マスタタブ 削除済み表示ONで横スクロールしない', async ({ page }) => {
      await page.click('#tab-master');
      await page.click('#masterShowDeletedBtn');
      await expectNoOverflow(page, 'master+showDeleted @' + width);
    });

    test('マスタ編集モーダル表示時に横スクロールしない', async ({ page }) => {
      await page.click('#tab-master');
      await page.locator('.master-edit-btn').first().click();
      await expect(page.locator('#master-edit-modal')).toBeVisible();
      await expectNoOverflow(page, 'master+editModal @' + width);
    });
  });
}

// ============================================================
// Stage 2 単体: _pendingNewYomi の同名衝突回避（player.id キー方式 / Should Fix 1）
// ============================================================
test.describe('A-4 Stage 2 unit: _pendingNewYomi 同名衝突回避', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
  });

  test('同名（normalize 同一）の参加者を別 yomi で複数登録 → それぞれ player.id キーで保持される', async ({ page }) => {
    // 1人目: 田中タロウ / たなかたろう
    await page.fill('#inp-name', '田中タロウ');
    await page.fill('#inp-yomi', 'たなかたろう');
    await page.click('#addBtn');
    // addPlayer 内の同名拒否は exact 一致なので、わずかに変えて 2 人目
    await page.fill('#inp-name', '田中　タロウ'); // 全角スペース
    await page.fill('#inp-yomi', 'たなかたろう（兄）');
    await page.click('#addBtn');

    const peek = await page.evaluate(() => {
      const ids = Object.keys(_pendingNewYomi);
      return { count: ids.length, sample: ids.map(k => ({id:k, val:_pendingNewYomi[k]})) };
    });
    // 2件とも player.id キーで保持されている（同名でも衝突しない）
    expect(peek.count).toBe(2);
    expect(peek.sample.every(s => s.id.indexOf('p') === 0)).toBe(true);
  });
});
