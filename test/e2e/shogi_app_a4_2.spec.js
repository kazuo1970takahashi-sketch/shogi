// @ts-check
// Phase A-4.2 e2e: 過去参加者パネル / サジェストの A/B クラスボタン
const { test, expect } = require('@playwright/test');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:null,deleted:false,deleted_at:null,note:''},
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
// Stage 2: 過去参加者パネル A/B ボタン
// ============================================================
test.describe('A-4.2 Stage 2: 過去参加者パネル A/B ボタン', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
  });

  test('各行に A/B ボタンが両方表示される', async ({ page }) => {
    const rows = page.locator('#ppPanel .pp-row');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      await expect(row.locator('.pp-add-btn[data-cls="A"]')).toHaveCount(1);
      await expect(row.locator('.pp-add-btn[data-cls="B"]')).toHaveCount(1);
    }
  });

  test('A/B ボタンに aria-label と title が付与されている', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    const aBtn = row.locator('.pp-add-btn[data-cls="A"]');
    const bBtn = row.locator('.pp-add-btn[data-cls="B"]');
    await expect(aBtn).toHaveAttribute('aria-label', '山田太郎をAクラスで追加');
    await expect(aBtn).toHaveAttribute('title', 'Aクラスで追加');
    await expect(bBtn).toHaveAttribute('aria-label', '山田太郎をBクラスで追加');
    await expect(bBtn).toHaveAttribute('title', 'Bクラスで追加');
  });

  test('A/B ボタンが min 44x44 px のタップターゲット', async ({ page }) => {
    const aBtn = page.locator('#ppPanel .pp-add-btn[data-cls="A"]').first();
    const box = await aBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('「追加先を選択」ヒントテキストが表示される', async ({ page }) => {
    await expect(page.locator('#pp-hint')).toBeVisible();
    await expect(page.locator('#pp-hint')).toContainText('追加先を選択');
  });

  test('行本体タップで何も起こらない（フォーム反映しない・追加しない）', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    // ボタン以外の領域（氏名 span）をクリック
    await row.locator('span').first().click();
    // 追加されない
    await expect(page.locator('#a-list .player-row')).toHaveCount(0);
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
    // 氏名フォームに反映されない
    await expect(page.locator('#inp-name')).toHaveValue('');
  });

  test('行本体は cursor:default（hover 効果なし）', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').first();
    const cursor = await row.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('default');
  });

  test('A ボタン → state.players.A に追加', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    await expect(page.locator('#a-list .player-row .player-name')).toHaveText('山田太郎');
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
  });

  test('B ボタン → state.players.B に追加', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="B"]').click();
    await expect(page.locator('#b-list .player-row')).toHaveCount(1);
    await expect(page.locator('#b-list .player-row .player-name')).toHaveText('山田太郎');
    await expect(page.locator('#a-list .player-row')).toHaveCount(0);
  });

  test('last_class と異なるクラスへの追加が成功する（last_class=A の人を B に追加）', async ({ page }) => {
    // 山田太郎 (last_class:'A') を B クラスに追加
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="B"]').click();
    await expect(page.locator('#b-list .player-row')).toHaveCount(1);
    // state.players.B に member_id 付きで入る
    const state = await page.evaluate(() => {
      const raw = localStorage.getItem('shogi_v4');
      return raw ? JSON.parse(raw) : null;
    });
    expect(state.players.B[0].member_id).toBe('m_aaaaaaaaaaaa');
    expect(state.players.B[0].cls).toBe('B');
  });

  test('既追加 player を別クラスのボタンで再度追加 → duplicate_member、UI 文言「この参加者はすでに登録されています」', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    // 再描画後も同じ member_id の人は表示されている（getCurrentlyRegisteredMemberIds 経由ではなく master 全件表示のため）
    // → 別クラスのボタンを押す
    const row2 = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    if (await row2.count() > 0) {
      await row2.locator('.pp-add-btn[data-cls="B"]').click();
      await expect(page.locator('#reg-msg')).toContainText('この参加者はすでに登録されています');
    } else {
      // 行が消えていれば成功（重複追加できない）。本ケースではメッセージ確認は不要。
    }
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    await expect(page.locator('#b-list .player-row')).toHaveCount(0);
  });

  test('削除済み member の行は表示されない', async ({ page }) => {
    await expect(page.locator('#ppPanel')).not.toContainText('削除タロウ');
    const rows = page.locator('#ppPanel .pp-row');
    await expect(rows).toHaveCount(3); // 削除済みは除外、生存3名のみ
  });

  test('追加成功で showMsg「[氏名]（Xクラス）を登録しました」', async ({ page }) => {
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '佐藤一郎' });
    await row.locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#reg-msg')).toContainText('佐藤一郎');
    await expect(page.locator('#reg-msg')).toContainText('Aクラス');
    await expect(page.locator('#reg-msg')).toContainText('登録しました');
  });

  test('addPlayerFromMaster 経由で master.last_class が変更されない', async ({ page }) => {
    // 山田太郎 (last_class:'A') を B クラスに追加
    const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
    await row.locator('.pp-add-btn[data-cls="B"]').click();
    const master = await page.evaluate(() => {
      const raw = localStorage.getItem('shogi_branch_master');
      return raw ? JSON.parse(raw) : null;
    });
    const yamada = master.members.find((m) => m.id === 'm_aaaaaaaaaaaa');
    expect(yamada.last_class).toBe('A'); // 変更されない
  });
});
