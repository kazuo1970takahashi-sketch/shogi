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

  // ---- D5: 「2人以上」は押したときに**発生元のパネルの中**に出る（N5・STYLE-GUIDE §3.2）
  //   ★ Codex 1巡目 P1: showMsg の出力先 #reg-msg は受付ペインの中＝対局管理タブでは見えない。
  //   ★ Codex 2巡目 P2: 止めた理由はトースト（3秒で消える）ではなく、同じ面の role=alert・danger 面色のスロットへ。
  //   body.textContent に文字が在るかではなく、**可視な要素**を読み、**パネルの中**に在り、**消えない**ことまで見る。
  await page.evaluate(() => { var b = document.getElementById('help-modal-close'); if (b) b.click(); });
  await page.waitForTimeout(100);
  const errBefore = await page.evaluate(() => { var e = document.getElementById('frpErr_A'); return e ? { hidden: e.hidden, h: e.getBoundingClientRect().height } : null; });
  ok(errBefore && errBefore.hidden && errBefore.h === 0, 'D5 押す前はスロットが hidden＝高さ 0（パネルを伸ばさない・実測 ' + JSON.stringify(errBefore) + '）');
  await page.evaluate(() => { document.getElementById('frpAddBtn_A').click(); });
  await page.waitForTimeout(100);
  const err = await page.evaluate(() => {
    var e = document.getElementById('frpErr_A');
    if (!e) return null;
    var r = e.getBoundingClientRect(); var cs = getComputedStyle(e);
    return { hidden: e.hidden, h: r.height, role: e.getAttribute('role'), inPanel: !!e.closest('.frp-partial-section'),
             text: e.textContent, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, inReg: !!e.closest('#pane-reg') };
  });
  ok(err && !err.hidden && err.h > 0 && !err.inReg, 'D5b 押すと対局管理タブで**見える**（実測 ' + JSON.stringify(err && { h: err.h, hidden: err.hidden }) + '）');
  ok(err && err.inPanel && err.role === 'alert', 'D5c 発生元のパネルの中・role=alert（§3.2）');
  ok(err && /2人以上を選択してください/.test(err.text) && /もう一度押して/.test(err.text), 'D5d 文に「止めた理由」と「次の行動」がある（§4.3・実測 ' + (err && err.text) + '）');
  //   ★ Codex 3巡目 P2: 色だけに意味を載せない（§3.1）＝見出し語（またはアイコン）を必ず添える。
  const head = await page.evaluate(() => { var h = document.querySelector('#frpErr_A .frp-err-head'); return h ? { text: h.textContent, display: getComputedStyle(h).display } : null; });
  ok(head && /作成できません/.test(head.text) && /\u26a0/.test(head.text) && head.display === 'block', 'D5d2 見出し語「⚠ 作成できません」が独立した行で付いている（§3.1・実測 ' + JSON.stringify(head) + '）');
  ok(err && err.bg === 'rgb(253, 236, 234)' && err.color === 'rgb(165, 14, 14)' && err.border === 'rgb(217, 48, 37)', 'D5e danger 面色が効いている（実測 bg=' + (err && err.bg) + ' color=' + (err && err.color) + '）');
  await page.waitForTimeout(3200);
  const still = await page.evaluate(() => { var e = document.getElementById('frpErr_A'); return e && !e.hidden && e.getBoundingClientRect().height > 0; });
  ok(still, 'D5f 3秒経っても消えない（トーストではない）');
  await page.click('.frp-unassigned-cb');
  await page.waitForTimeout(50);
  const cleared = await page.evaluate(() => { var e = document.getElementById('frpErr_A'); return e && e.hidden; });
  ok(cleared, 'D5g チェックを1つ触ると消える（次の行動を取ったら止めた理由は役目を終える）');
  const toast = await page.evaluate(() => { var t = document.getElementById('app-toast'); return t ? t.className : ''; });
  ok(!/show/.test(toast), 'D5h トーストは出していない（実測 class=' + toast + '）');

  ok(pageErrors.length === 0, 'D6 未捕捉例外なし' + (pageErrors.length ? '（' + pageErrors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-FRP-PANEL-DECLUTTER-957: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
