#!/usr/bin/env node
// Playwright E2E: FRP-PANEL-DECLUTTER-001（Issue #957）— 「1局目 未割当参加者」パネルの説明文3本を消す
//
//   出どころ: 作者の実機確認（2026-09-04・v153）。「1回理解したらもう読まない」説明文が
//   375px でパネルの 48%（266px）を占めていた。同じ内容は「？ ヘルプ」に全部ある。
//
//   何を測るか: **実寸**（パネルの高さ）と、**残すものが残っていること**と、**消した要点がヘルプで読めること**。
//   文の有無を grep するだけでは「消したが別の場所に移した」を通してしまうので、高さを読む。
//
// 使い方（Mac・リポジトリ直下で）:
//   node test/e2e/frp_panel_declutter_957.e2e.js
//   node test/e2e/frp_panel_declutter_957.e2e.js <html-or-url>
//
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 4名1クラス・1局目に1組だけ作成済み＝未割当2名（作者の実機と同じ形）。
function FIXTURE() {
  const NAMES = ['佐藤太郎', '鈴木一郎', '高橋次郎', '田中三郎'];
  const A = NAMES.map((n, i) => ({ id: 'a' + i, name: n, cls: 'A', entry_no: i + 1 }));
  return {
    classes: [{ id: 'A', name: 'Aクラス', started: true }],
    players: { A: A },
    results: { A: [] },
    pairings: { A: [{ p1: 'a0', p2: 'a1', winner: null }] },
    rounds: 4, started: true,
    report: { date: '2026-09-01', name: '沼津支部月例大会', office: '沼津市' }
  };
}

const SNAP = `(function(){
  var sec=document.querySelector('.frp-partial-section');
  if(!sec)return {found:false};
  var r=sec.getBoundingClientRect();
  var ps=[...sec.querySelectorAll('p')].map(function(e){return {cls:e.className,h:e.getBoundingClientRect().height,t:e.textContent};});
  return {
    found:true, height:r.height,
    heading:(sec.querySelector('h3')||{}).textContent||'',
    hasHelpBtn:!!sec.querySelector('#helpBtnFirstRound_A'),
    projection:(sec.querySelector('.frp-pairing-projection')||{}).textContent||'',
    hasAddAll:!!sec.querySelector('#addAllTablesBtn_A'),
    hasAddSel:!!sec.querySelector('#frpAddBtn_A'),
    cbCount:sec.querySelectorAll('.frp-unassigned-cb').length,
    paragraphs:ps,
    text:sec.textContent.replace(/\\s+/g,'')
  };
})()`;

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof renderTournament === 'function', null, { timeout: 15000 });
  await page.evaluate((s) => { Object.assign(state, s); document.getElementById('tab-tournament').click(); }, FIXTURE());
  const S = await page.evaluate(SNAP);

  // ---- D1: パネルの実寸。旧構成は 560px（説明文3本＝266px）。300px 以下で「消えている」と言える網
  ok(S.found, 'D0 部分開始中のパネルが出ている（未割当2名）');
  ok(S.height <= 300, 'D1 375px でパネルは 300px 以下（旧 560px・実測 ' + Math.round(S.height) + 'px）');
  ok(S.height >= 200, 'D1b 潰れていない（200px 以上・実測 ' + Math.round(S.height) + 'px）');

  // ---- D2: 残すものは残っている
  ok(/^1局目 未割当参加者（2名）/.test(S.heading), 'D2 見出し「1局目 未割当参加者（2名）」（実測 ' + S.heading + '）');
  ok(S.hasHelpBtn, 'D2b 「？ ヘルプ」ボタンが残っている');
  ok(/2名.*1組/.test(S.projection), 'D2c 「2名を選ぶと1組」の1行は残す（操作の結果を示す動的な文・実測 ' + S.projection + '）');
  ok(S.hasAddAll && S.hasAddSel, 'D2d ボタン2つ（まとめて作成・選択して作成）が残っている');
  ok(S.cbCount === 2, 'D2e チェック一覧に未割当2名（実測 ' + S.cbCount + '）');

  // ---- D3: 消した3本が無い（p 要素は projection の1本だけ）
  const others = S.paragraphs.filter(p => p.cls !== 'frp-pairing-projection');
  ok(others.length === 0, 'D3 説明文の p は残っていない（projection 以外の p=' + others.length + '）');
  ok(S.text.indexOf('部分開始中です') < 0 && S.text.indexOf('受付順で2人ずつ') < 0 && S.text.indexOf('2人以上を選択してください') < 0,
    'D3b 消した3本の文言がパネル内に無い');

  // ---- D4: 消した要点はヘルプで読める（実際に開いて本文を読む）
  await page.click('#helpBtnFirstRound_A');
  await page.waitForTimeout(100);
  const help = await page.evaluate(() => {
    var m = document.getElementById('help-modal');
    if (!m || m.getBoundingClientRect().height === 0) return '';
    return m.textContent.replace(/\s+/g, '');
  });
  ok(/1局目の作り方ヘルプ/.test(help), 'D4 ヘルプが開く（#help-modal が可視・見出し「1局目の作り方ヘルプ」）');
  ok(/受付順/.test(help) && /2人ずつ/.test(help), 'D4b ヘルプに「受付順」「2人ずつ」（まとめて作成の組成順序・Codex 1巡目 P2）');
  ok(/奇数/.test(help) && /不戦勝にはなりません/.test(help), 'D4c ヘルプに「奇数」「不戦勝にはなりません」（待機の説明）');
  ok(/チェックして組みます/.test(help), 'D4d ヘルプに「チェックして組みます」（選択して作成の説明）');

  // ---- D5: 「2人以上」は押したときに出る（文を消しても案内は失われない）
  await page.evaluate(() => { var b = document.getElementById('help-modal-close'); if (b) b.click(); });
  await page.waitForTimeout(100);
  //   ★ Codex 1巡目 P1: showMsg の出力先 #reg-msg は受付ペインの中＝対局管理タブでは見えない。
  //   body.textContent に文字が在るかではなく、**対局管理タブで実際に可視な要素**に出ているかを読む。
  await page.evaluate(() => { document.getElementById('frpAddBtn_A').click(); });
  await page.waitForTimeout(100);
  const vis = await page.evaluate(() => {
    var hits = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.children.length) continue;
      if ((e.textContent || '').indexOf('2人以上を選択してください') < 0) continue;
      var r = e.getBoundingClientRect();
      var cs = getComputedStyle(e);
      var visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
      // 祖先が display:none なら getBoundingClientRect は 0 になる＝非可視として落ちる
      hits.push({ id: e.id || e.className, visible: visible, inRegPane: !!e.closest('#pane-reg') });
    }
    return hits;
  });
  const visibleOutsideReg = vis.filter(h => h.visible && !h.inRegPane);
  ok(visibleOutsideReg.length >= 1, 'D5 未選択で「選択して作成」を押すと「2人以上を選択してください」が**対局管理タブで見える**（実測 ' + JSON.stringify(vis) + '）');

  ok(pageErrors.length === 0, 'D6 未捕捉例外なし' + (pageErrors.length ? '（' + pageErrors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-FRP-PANEL-DECLUTTER-957: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
