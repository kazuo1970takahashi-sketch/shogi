// @ts-check
// Phase 1 e2e: マスタ city フィールド追加(仕様書 §5 受け入れ条件 1〜6)
const { test, expect } = require('@playwright/test');
const { expectNoHorizontalOverflow } = require('../helpers/layout-assertions');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:'',city:'沼津市'},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:'',city:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:null,deleted:false,deleted_at:null,note:'',city:'三島市'}
  ]
};

// 旧データ(city 不在)のマスタ。仕様書 §3 / §4 の下位互換確認用。
const OLD_MASTER_WITHOUT_CITY = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_old001',name:'旧データ太郎',yomi:'きゅうでーたたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''}
    // city フィールド意図的に不在
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
// §5 #1: F7 city 入力 → 保存 → モーダル再オープンで保持
// ============================================================
test.describe('Phase 1 §5 #1: F7 city 保持', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master')).toBeVisible();
  });

  test('city 入力 → 保存 → 再オープンで保持される', async ({ page }) => {
    // 山田太郎(city='沼津市')を編集
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#me-city')).toHaveValue('沼津市');
    // 「長泉町」に変更して保存
    await page.locator('#me-city').fill('長泉町');
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    // 再オープン
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
    await expect(page.locator('#me-city')).toHaveValue('長泉町');
  });

  test('city 空入力 → 保存 → 空文字で保持(任意項目検証)', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await page.locator('#me-city').fill('');
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
    await expect(page.locator('#me-city')).toHaveValue('');
  });

  test('F7 city input に maxlength=20 属性が付与されている(UI 側保証)', async ({ page }) => {
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' });
    await row.locator('.master-edit-btn').click();
    await expect(page.locator('#me-city')).toHaveAttribute('maxlength', '20');
    await expect(page.locator('#me-city')).toHaveAttribute('placeholder', '例:沼津市');
  });
});

// ============================================================
// §5 #2: 正規化ルール一貫性(手入力 / 保存 / 旧データ補完)
// ============================================================
test.describe('Phase 1 §5 #2: 正規化ルール', () => {
  test('applyMasterMemberEdit({city:"  沼津市  "}) → trim 適用', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, { city: '  沼津市  ' });
      return { success: result.success, city: master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('沼津市');
  });

  test('applyMasterMemberEdit({city:null}) → "" に補完', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, { city: null });
      return { success: result.success, city: master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('');
  });

  test('applyMasterMemberEdit({city:undefined}) → 既存値を変更しない(undefined は no-op)', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      // city: undefined は options に含まれない扱いになる(JS の hasOwnProperty)
      const result = window.applyMasterMemberEdit('m_aaaaaaaaaaaa', '山田太郎', 'やまだたろう', master, {});
      return { success: result.success, city: master.members.find((m) => m.id === 'm_aaaaaaaaaaaa').city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('沼津市'); // 既存値維持
  });

  test('normalizeCity helper: trim + maxlength 20 + null/undefined→""', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => ({
      empty: window.normalizeCity(''),
      spaces: window.normalizeCity('   '),
      trim: window.normalizeCity('  沼津市  '),
      slice: window.normalizeCity('a'.repeat(30)),
      nullValue: window.normalizeCity(null),
      undefinedValue: window.normalizeCity(undefined),
      number: window.normalizeCity(123),
    }));
    expect(r.empty).toBe('');
    expect(r.spaces).toBe('');
    expect(r.trim).toBe('沼津市');
    expect(r.slice).toBe('a'.repeat(20));
    expect(r.slice.length).toBe(20);
    expect(r.nullValue).toBe('');
    expect(r.undefinedValue).toBe('');
    expect(r.number).toBe('');
  });

  test('normalizeBranchMaster で city が 21 文字以上 → 20 文字に切り詰め', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    const r = await page.evaluate(() => {
      const raw = {
        schema_version: 1,
        updated_at: '2026-05-05T12:00:00.000Z',
        members: [{
          id: 'm_long', name: '長氏名', yomi: 'ながしめい',
          first_attended: '2026-01-01', last_attended: '2026-04-01',
          tournament_ids: ['t1'], attendance_count: 1,
          member: 'member', grade: 'ippan', last_class: 'A',
          deleted: false, deleted_at: null, note: '',
          city: 'a'.repeat(30) // 30 文字
        }]
      };
      const normalized = window.normalizeBranchMaster(raw);
      return normalized.members[0].city;
    });
    expect(r).toBe('a'.repeat(20));
    expect(r.length).toBe(20);
  });
});

// ============================================================
// §5 #3: city 不在の旧データ → city="" で表示・編集できる
// ============================================================
test.describe('Phase 1 §5 #3: 旧データ下位互換', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithMaster(page, OLD_MASTER_WITHOUT_CITY);
  });

  test('city フィールド不在の旧データ → 読込時 city="" 補完される', async ({ page }) => {
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      return master.members.find((m) => m.id === 'm_old001').city;
    });
    expect(r).toBe('');
  });

  test('city 不在 member の F7 編集モーダル → city input が空で表示される', async ({ page }) => {
    await page.click('#tab-master');
    await page.locator('#pane-master tbody tr').filter({ hasText: '旧データ太郎' }).locator('.master-edit-btn').click();
    await expect(page.locator('#me-city')).toHaveValue('');
    // city を入力して保存できる
    await page.locator('#me-city').fill('沼津市');
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    expect(after.members.find((m) => m.id === 'm_old001').city).toBe('沼津市');
  });
});

// ============================================================
// §5 #4: backup → restore round-trip で city 保持
// ============================================================
test.describe('Phase 1 §5 #4: backup/restore round-trip', () => {
  test('export → city が JSON に含まれる(serializeBranchMasterForExport)', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const json = window.serializeBranchMasterForExport(master);
      const parsed = JSON.parse(json);
      return parsed.members.find((m) => m.id === 'm_aaaaaaaaaaaa').city;
    });
    expect(r).toBe('沼津市');
  });

  test('city 含む JSON を applyOverwriteImport → 保持される', async ({ page }) => {
    await setupWithMaster(page);
    const r = await page.evaluate(() => {
      const importJson = {
        schema_version: 1,
        updated_at: '2026-05-08T00:00:00.000Z',
        members: [{
          id: 'm_imp01', name: 'インポート太郎', yomi: 'いんぽーとたろう',
          first_attended: '2026-04-12', last_attended: '2026-04-12',
          tournament_ids: ['t_2026_04_12'], attendance_count: 1,
          member: 'member', grade: 'ippan', last_class: 'A',
          deleted: false, deleted_at: null, note: '',
          city: '清水町'
        }]
      };
      const result = window.applyOverwriteImport(importJson);
      return { success: result.success, city: result.newMaster.members[0].city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('清水町');
  });

  test('city 不在の旧 JSON を applyOverwriteImport → city="" 補完(下位互換)', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    const r = await page.evaluate(() => {
      const oldJson = {
        schema_version: 1,
        updated_at: '2026-05-05T12:00:00.000Z',
        members: [{
          id: 'm_oldimp', name: '旧 import 太郎', yomi: 'きゅういんぽーとたろう',
          first_attended: '2026-01-01', last_attended: '2026-04-01',
          tournament_ids: ['t1'], attendance_count: 1,
          member: 'member', grade: 'ippan', last_class: 'A',
          deleted: false, deleted_at: null, note: ''
          // city 意図的に不在
        }]
      };
      const result = window.applyOverwriteImport(oldJson);
      return { success: result.success, city: result.newMaster.members[0].city, hasField: 'city' in result.newMaster.members[0] };
    });
    expect(r.success).toBe(true);
    expect(r.hasField).toBe(true);
    expect(r.city).toBe('');
  });

  test('applyMergeImport で id 一致 → city は既存維持(name/yomi/member/grade と同方針)', async ({ page }) => {
    await setupWithMaster(page); // 山田太郎 city='沼津市' 既存
    const r = await page.evaluate(() => {
      const current = window.loadBranchMaster();
      const importJson = {
        schema_version: 1,
        updated_at: '2026-05-08T00:00:00.000Z',
        members: [{
          id: 'm_aaaaaaaaaaaa', // 既存と id 一致
          name: '山田太郎',
          yomi: 'やまだたろう',
          first_attended: '2026-01-01',
          last_attended: '2026-05-01',
          tournament_ids: ['t1', 't2', 't_new'],
          attendance_count: 3,
          member: 'other', grade: 'chu', last_class: 'A',
          deleted: false, deleted_at: null, note: '',
          city: '三島市' // 異なる city
        }]
      };
      const result = window.applyMergeImport(importJson, current);
      return { success: result.success, city: result.newMaster.members.find((m) => m.id === 'm_aaaaaaaaaaaa').city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('沼津市'); // 既存維持(import の '三島市' を採用しない)
  });
});

// ============================================================
// §5 #5: マスタ一覧 5 列構成 + 既存挙動変化なし
// ============================================================
test.describe('Phase 1 §5 #5: マスタ一覧不変', () => {
  test('マスタ一覧 thead は 5 列のまま(city 列追加なし)', async ({ page }) => {
    await setupWithMaster(page);
    await page.click('#tab-master');
    await expect(page.locator('#pane-master thead th')).toHaveCount(5);
    await expect(page.locator('#pane-master thead')).not.toContainText('市町村');
    await expect(page.locator('#pane-master thead')).not.toContainText('city');
  });
});

// ============================================================
// §5 #5(L-3): F7 編集モーダルが iPhone 375px で水平 overflow なし
// ============================================================
test.describe('Phase 1 §5 #5: F7 モーダル Layout Safety @375px', () => {
  test('375px: F7 city 入力欄を含むモーダルが viewport 内に収まる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await setupWithMaster(page);
    await page.click('#tab-master');
    await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
    await expect(page.locator('#master-edit-modal')).toBeVisible();
    await expect(page.locator('#me-city')).toBeVisible();
    await expectNoHorizontalOverflow(page, { label: 'F7 modal with city @375px' });
  });
});
