#!/usr/bin/env node
// Playwright E2E: MEMBER-EDIT-TOUCHED-COLS-001（#901）
//   なぜ実ブラウザで測るか: このスライスの直前、わたしは **UI から到達できない退役モーダル**
//   （openMasterEditModal・#798）に修正を書き、DOM モックのテストは全緑になってその誤りを
//   一つも検出しなかった。app_harness の getElementById は未知 id でもノードを自動生成するため、
//   「その画面が本当に開くのか」「そのボタンが本当に押せるのか」はモックでは測れない。
//   ここでは実ブラウザで **名簿タブの氏名セルをタップ → 編集パネル → セグメントを押す → 保存**
//   まで人間と同じ経路を通し、クラウドへ実際に送られた行を捕まえる。
//
//   supabase は addInitScript で差し替える（ネットワークアクセスなし・実 CDN も叩かない）。
//
// 使い方: node test/e2e/member_edit_touched_cols_901.e2e.js [html-or-url]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');
const EXEC = process.env.PW_CHROME || undefined;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

const MID = 'm-kakuu-e2e';
const MASTER = {
  schema_version: 1,
  members: [{ id: MID, name: '架空太郎', yomi: 'かくうたろ', member: 'member', grade: 'ippan', city: '',
              last_class: 'A', last_attended: '2026-06-01', deleted: false, tournament_ids: [] }],
};
// クラウド側は「その他・女性・沼津市」を持っている（＝端末は取り込み前で既定値のまま）
const CLOUD_ROW = { member_id: MID, name: '架空太郎', yomi: 'かくうたろ', member_kind: 'other', grade: 'josei', city: '沼津市' };

function initScript(cloudRow) {
  return `(function(){
    window.__e2e901 = { upserts: [], selects: 0 };
    window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
    window.supabase = { createClient: function(){ return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: {} } } }); } },
      rpc: function(){ return Promise.resolve({ data: [{ club_id: 'club-kakuu', status: 'active' }] }); },
      from: function(t){ return {
        select: function(){ return { eq: function(){ return { in: function(){
          window.__e2e901.selects++;
          return Promise.resolve({ data: ${JSON.stringify([cloudRow])}, error: null });
        } }; } }; },
        upsert: function(rows){ window.__e2e901.upserts.push(rows); return { select: function(){
          return Promise.resolve({ data: rows, error: null }); } }; }
      }; }
    }; } };
  })();`;
}

async function openMasterTab(page) {
  await page.waitForFunction(() => typeof showTab === 'function' && typeof renderMasterTab === 'function');
  await page.evaluate((m) => {
    localStorage.setItem('shogi_branch_master', JSON.stringify(m));
    showTab('master');
    renderMasterTab();
  }, MASTER);
  await page.waitForSelector('.master-cell-name', { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

  // ---- A: 名簿タブ → 氏名セルをタップ → 編集パネルが実際に開く -------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openMasterTab(page);

    ok(await page.locator('#masterCloudPullStatus').count() === 1, 'A1 クラウド結果を出す status 行が実在する');
    await page.locator('.master-cell-name').first().click();
    await page.waitForSelector('#ms-edit-save', { timeout: 5000 });
    ok(await page.locator('#ms-edit-name').count() === 1, 'A2 氏名セルのタップで編集パネルが実際に開く（氏名入力が出る）');
    ok(await page.locator('#ms-edit-member').count() === 1 && await page.locator('#ms-edit-grade').count() === 1,
       'A3 支部員区分・級のセグメントが出る');
    ok(await page.locator('#ms-edit-city').count() === 0, 'A4 市町村の欄はこのパネルに無い（＝常に「操作していない」欄）');

    // ふりがなの誤字だけ直す。区分・級には触らない。
    await page.fill('#ms-edit-yomi', 'かくうたろう');
    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e901.upserts.length > 0, null, { timeout: 8000 });
    const cap = await page.evaluate(() => window.__e2e901);
    const row = cap.upserts[0][0];
    ok(cap.selects === 1, 'A5 送信前にクラウドの現在値を 1 回読む');
    ok(row.yomi === 'かくうたろう', 'A6 直したふりがなが実際にクラウドへ届く');
    ok(row.member_kind === 'other' && row.grade === 'josei' && row.city === '沼津市',
       '★A7 触っていない区分・級・市町村はクラウドの実値のまま（従来は member/ippan/null で潰していた）');
    const st = await page.locator('#masterCloudPullStatus').innerText();
    ok(/反映しました/.test(st) && /⚠/.test(st) && /市町村/.test(st),
       '★A8 端末の表示と違う値をクラウドに残したことを status 行の ⚠ で名指しする  [' + st.replace(/\s+/g, ' ').slice(0, 70) + ']');
    ok(errs.length === 0, 'A9 未捕捉の JS 例外なし  [' + (errs.join(' / ') || 'なし') + ']');
    await page.close();
  }

  // ---- B: 同じ値を押し直した保存は「操作した」として届く -------------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openMasterTab(page);
    await page.locator('.master-cell-name').first().click();
    await page.waitForSelector('#ms-edit-save', { timeout: 5000 });

    // ローカルは既に「支部員・一般」。クラウドだけ古い。利用者は同じ値のボタンを押し直す。
    const before = await page.evaluate(() =>
      document.getElementById('ms-edit-grade').getAttribute('data-touched'));
    await page.locator('#ms-edit-member button[data-val="member"]').click();
    await page.locator('#ms-edit-grade button[data-val="ippan"]').click();
    const after = await page.evaluate(() =>
      document.getElementById('ms-edit-grade').getAttribute('data-touched'));
    ok(before === null && after === '1', '★B1 初期値と同じ値を押し直しても「操作した」印が実際に立つ（差分ゼロでも訂正を送れる）');

    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e901.upserts.length > 0, null, { timeout: 8000 });
    const row = (await page.evaluate(() => window.__e2e901.upserts))[0][0];
    ok(row.member_kind === 'member' && row.grade === 'ippan',
       '★B2 押し直した区分・級は既定値方向でもクラウドへ届く（#901 の本題）');
    ok(row.city === '沼津市', 'B3 同じ保存でも欄の無い市町村はクラウドの実値のまま（欄ごとに独立）');
    await page.close();
  }

  await browser.close();
  console.log(`\n  #901 実ブラウザ検証: ${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('  ✗ 例外: ' + ((e && e.stack) || e)); process.exit(1); });
