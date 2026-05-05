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
