// @ts-check
// Phase A-4.5 §3.7: mobile-375 project visual regression(A-4.4 失敗の再発防止)
// chromium-desktop project では setViewportSize で 375px 強制しても iOS Safari 特有の
// rendering(flexbox + overflow-wrap、touch hit area)が再現されないため、
// mobile-375 project(devices.Desktop Chrome ベース + isMobile false + hasTouch true + iPhone UA)
// で過去参加者パネル + F7 編集モーダルを撮影。
//
// 本 spec ファイルは playwright.config.js で chromium-desktop project から testIgnore される。

const { test, expect } = require('@playwright/test');

const SAMPLE_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-05T12:00:00.000Z',
  members: [
    {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_bbbbbbbbbbbb',name:'山本花子',yomi:'やまもとはなこ',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t3'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''},
    {id:'m_cccccccccccc',name:'佐藤一郎',yomi:'さとういちろう',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:''},
    {id:'m_long01',name:'長谷川一郎太郎兵衛',yomi:'はせがわいちろうたろうべえ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan',last_class:'B',deleted:false,deleted_at:null,note:''}
  ]
};

const STATE_WITH_A_AND_B = {
  players: {
    A: [{id:'p_a1', name:'山田太郎', cls:'A', member:'other', grade:'chu', member_id:'m_aaaaaaaaaaaa'}],
    B: [{id:'p_b1', name:'山本花子', cls:'B', member:'member', grade:'ippan', member_id:'m_bbbbbbbbbbbb'}]
  },
  rounds: 4,
  pairings: { A: [], B: [] },
  results: { A: [], B: [] },
  started: false,
  report: {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}
};

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

const OPT = {
  animations: 'disabled',
  caret: 'hide',
  fullPage: true,
  maxDiffPixelRatio: 0.05,
};

// ============================================================
// 過去参加者パネル(3 セクション、長氏名含む)mobile-375 snapshot
// ============================================================
test('Visual mobile-375: 過去参加者パネル(3 セクション + 長氏名)', async ({ page }) => {
  await setup(page, { master: SAMPLE_MASTER, state: STATE_WITH_A_AND_B });
  await page.click('#ppToggleBtn');
  await expect(page.locator('#ppPanel')).toBeVisible();
  // 3 セクションすべてが描画されていることを確認(snapshot を撮る前のサニティチェック)
  await expect(page.locator('#ppPanel .pp-section-a-enrolled')).toBeVisible();
  await expect(page.locator('#ppPanel .pp-section-b-enrolled')).toBeVisible();
  await expect(page.locator('#ppPanel .pp-section-not-enrolled')).toBeVisible();
  await expect(page).toHaveScreenshot('mobile-pp-panel-3sections-375.png', OPT);
});

// ============================================================
// F7 編集モーダル(A/B 2 択 fieldset)mobile-375 snapshot
// ============================================================
test('Visual mobile-375: F7 編集モーダル(A/B 2 択)', async ({ page }) => {
  await setup(page, { master: SAMPLE_MASTER });
  await page.click('#tab-master');
  await page.locator('#pane-master tbody tr').filter({ hasText: '山田太郎' }).locator('.master-edit-btn').click();
  await expect(page.locator('#master-edit-modal')).toBeVisible();
  await expect(page).toHaveScreenshot('mobile-master-edit-modal-375.png', OPT);
});
