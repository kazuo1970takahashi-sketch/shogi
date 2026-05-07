// @ts-check
// Phase A-T Stage 6: Visual Regression baseline 13 件
// 仕様書: docs/specs/20260507_1548_shogi_at_stage_6_visual_regression_mini_spec_v1.md
// production 不変、外部 SaaS 不採用、Playwright 標準 toHaveScreenshot のみ。

const { test, expect } = require('@playwright/test');

// ============================================================
// Seed データ
// ============================================================

const EMPTY_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [],
};

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''}
  ]
};

const MASTER_WITH_DELETED = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:true,deleted_at:'2026-04-10',note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''}
  ]
};

const PLAYERS_4A = [
  {id:'pA1', name:'田中', cls:'A', member:'member', grade:'ippan'},
  {id:'pA2', name:'佐藤', cls:'A', member:'member', grade:'ippan'},
  {id:'pA3', name:'鈴木', cls:'A', member:'member', grade:'ippan'},
  {id:'pA4', name:'高橋', cls:'A', member:'member', grade:'ippan'},
];

// 対局管理(ペアリング後): 4 名・第 1 ラウンドのペアリング生成済、結果未入力
const STATE_PAIRED_4A = {
  players: { A: PLAYERS_4A, B: [] },
  rounds: 4,
  pairings: { A: [{p1:'pA1',p2:'pA2',winner:null},{p1:'pA3',p2:'pA4',winner:null}], B: [] },
  results: { A: [], B: [] },
  started: true,
  report: {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}
};

// 最終結果(全ラウンド確定): 4 名 round-robin × 3 ラウンド勝敗確定済
const STATE_FINALIZED_4A = {
  players: { A: PLAYERS_4A, B: [] },
  rounds: 4,
  pairings: { A: [], B: [] },
  results: {
    A: [
      [{p1:'pA1',p2:'pA2',winner:'pA1'},{p1:'pA3',p2:'pA4',winner:'pA3'}],
      [{p1:'pA1',p2:'pA3',winner:'pA1'},{p1:'pA2',p2:'pA4',winner:'pA2'}],
      [{p1:'pA1',p2:'pA4',winner:'pA1'},{p1:'pA2',p2:'pA3',winner:'pA2'}],
    ],
    B: []
  },
  started: true,
  report: {date:'2026-04-15',place:'労政会館',start:'09:30',end:'12:00',sei:'',fuku:'',note:''}
};

// ============================================================
// Setup helper
// ============================================================

async function setup(page, { master, state } = {}) {
  await page.addInitScript(({ m, s }) => {
    try {
      localStorage.clear();
      if (m) localStorage.setItem('shogi_branch_master', JSON.stringify(m));
      if (s) localStorage.setItem('shogi_v4', JSON.stringify(s));
    } catch (e) {}
  }, { m: master || null, s: state || null });
  await page.goto('/shogi_v4.html');
}

// 共通スクショオプション(仕様書 §3.1)
const OPT = {
  animations: 'disabled',
  caret: 'hide',
  fullPage: true,
  maxDiffPixelRatio: 0.05,
};

// ============================================================
// #1 参加者登録(空) — 375 / 1280
// ============================================================
test.describe('Visual: 参加者登録 (空)', () => {
  for (const w of [375, 1280]) {
    test(`width=${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await setup(page, { master: EMPTY_MASTER });
      await expect(page).toHaveScreenshot(`reg-empty-${w}.png`, OPT);
    });
  }
});

// ============================================================
// #2 参加者登録(過去参加者パネル展開) — 375 / 1280
// ============================================================
test.describe('Visual: 参加者登録 (過去参加者パネル展開)', () => {
  for (const w of [375, 1280]) {
    test(`width=${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await setup(page, { master: SAMPLE_MASTER });
      await page.click('#ppToggleBtn');
      await expect(page.locator('#ppPanel')).toBeVisible();
      await expect(page).toHaveScreenshot(`reg-pp-panel-${w}.png`, OPT);
    });
  }
});

// ============================================================
// #3 参加者登録(サジェスト表示中) — 375 のみ
// ============================================================
test('Visual: 参加者登録 (サジェスト表示中) width=375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setup(page, { master: SAMPLE_MASTER });
  await page.fill('#inp-name', '山');
  await expect(page.locator('#suggest-list .suggest-item').first()).toBeVisible();
  await expect(page).toHaveScreenshot('reg-suggest-375.png', OPT);
});

// ============================================================
// #4 対局管理(ペアリング後) — 375 / 1280
// ============================================================
test.describe('Visual: 対局管理 (ペアリング後)', () => {
  for (const w of [375, 1280]) {
    test(`width=${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await setup(page, { master: SAMPLE_MASTER, state: STATE_PAIRED_4A });
      await page.click('#tab-tournament');
      await expect(page.locator('#pane-tournament')).toBeVisible();
      await expect(page).toHaveScreenshot(`tournament-paired-${w}.png`, OPT);
    });
  }
});

// ============================================================
// #5 最終結果(全ラウンド確定) — 375 / 1280
// ============================================================
test.describe('Visual: 最終結果 (全ラウンド確定)', () => {
  for (const w of [375, 1280]) {
    test(`width=${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await setup(page, { master: SAMPLE_MASTER, state: STATE_FINALIZED_4A });
      await page.click('#tab-result');
      await expect(page.locator('#pane-result')).toBeVisible();
      await expect(page).toHaveScreenshot(`result-finalized-${w}.png`, OPT);
    });
  }
});

// ============================================================
// #6 マスタ一覧 — 375 / 1280
// ============================================================
test.describe('Visual: マスタ一覧', () => {
  for (const w of [375, 1280]) {
    test(`width=${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await setup(page, { master: SAMPLE_MASTER });
      await page.click('#tab-master');
      await expect(page.locator('#pane-master')).toBeVisible();
      await expect(page).toHaveScreenshot(`master-list-${w}.png`, OPT);
    });
  }
});

// ============================================================
// #7 マスタ編集モーダル — 375 のみ
// ============================================================
test('Visual: マスタ編集モーダル width=375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setup(page, { master: SAMPLE_MASTER });
  await page.click('#tab-master');
  await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
  await expect(page.locator('#master-edit-modal')).toBeVisible();
  await expect(page).toHaveScreenshot('master-edit-modal-375.png', OPT);
});

// ============================================================
// #8 tombstone 復元 UI — 375 のみ
// ============================================================
test('Visual: tombstone 復元 UI width=375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setup(page, { master: MASTER_WITH_DELETED });
  await page.click('#tab-master');
  await page.click('#masterShowDeletedBtn');
  await expect(page.locator('.master-restore-btn').first()).toBeVisible();
  await expect(page).toHaveScreenshot('master-restore-tombstone-375.png', OPT);
});
