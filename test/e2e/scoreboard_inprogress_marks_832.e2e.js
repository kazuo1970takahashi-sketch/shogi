#!/usr/bin/env node
// Playwright E2E: SCOREBOARD-INPROGRESS-MARKS-001（Issue #832）
//   実 Chromium で「ライブ配信ルート（?live=）」と「会場スマホ閲覧（#scoreboard）」の
//   両方に、勝敗登録の時点で進行中の○×が出ることを確認する（作者決定2＝経路分岐を作らない）。
//   純関数層は test/test_scoreboard_inprogress_marks_832.js。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright && npx playwright install chromium   # 初回のみ
//   node test/e2e/scoreboard_inprogress_marks_832.e2e.js
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

const SETUP = () => {
  const players = [1,2,3,4].map(i => ({ id:'p'+i, name:'選手'+i, yomi:'せんしゅ', entry_no:i }));
  return {
    classes:[{id:'A',name:'Aクラス'}],
    players:{A:players},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]]},
    pairings:{A:[{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]},
    rounds:4, report:{}
  };
};

// 描かれた表から「行の id → 2回戦セルのテキストとクラス」を読む
const READ = () => {
  const out = {};
  document.querySelectorAll('#scoreboard-view tr[data-sbpid]').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    const cell = tds[3]; // [0]順位 [1]氏名 [2]1回戦 [3]2回戦
    const mark = cell ? cell.querySelector('.sb-mark') : null;
    out[tr.getAttribute('data-sbpid')] = {
      text: mark ? mark.textContent.trim() : null,
      live: mark ? mark.classList.contains('sb-mark-live') : false,
      cellLive: cell ? cell.classList.contains('sb-cell-live') : false,
      opp: cell && cell.querySelector('.sb-opp') ? cell.querySelector('.sb-opp').textContent.trim() : null
    };
  });
  const th = [...document.querySelectorAll('#scoreboard-view thead th')].map(e => e.textContent.trim());
  return { rows: out, th, legend: (document.querySelector('#scoreboard-view .sb-legend') || {}).textContent || '' };
};

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  // ---- ① 会場スマホ閲覧（#scoreboard・storage 追従経路）----
  let pg = await browser.newPage();
  pg.on('pageerror', e => errors.push(String(e && e.message || e)));
  await pg.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  let r = await pg.evaluate((s) => { Object.assign(state, s); renderScoreboard(); return null; }, SETUP());
  r = await pg.evaluate(READ);
  ok(r.rows.p1 && r.rows.p1.text === '○' && r.rows.p1.live === true, '① #scoreboard: 勝者(p1)に進行中様式の○  [実測 ' + JSON.stringify(r.rows.p1) + ']');
  ok(r.rows.p3 && r.rows.p3.text === '×' && r.rows.p3.live === true, '① #scoreboard: 敗者(p3)に進行中様式の×');
  ok(r.rows.p2 && r.rows.p2.text === '…', '① #scoreboard: 未入力(p2)は「…」');
  ok(r.rows.p1.opp === '#03', '① 相手番号は #03');
  ok(r.th.some(t => t.indexOf('2回戦') === 0 && t.indexOf('進行中') > 0), '① 2回戦の見出しに「進行中」  [実測 ' + JSON.stringify(r.th) + ']');
  ok(r.legend.indexOf('まだ確定していない回戦') >= 0, '① 凡例に進行中の説明');
  await pg.close();

  // ---- ② ライブ配信ルート（?live=）----
  pg = await browser.newPage();
  pg.on('pageerror', e => errors.push(String(e && e.message || e)));
  await pg.goto(TARGET + '?live=demo#scoreboard', { waitUntil: 'domcontentloaded' });
  await pg.evaluate((s) => {
    _sbLiveViewState = s;                       // 受信した公開スナップショット相当
    _sbLiveEnvelope = { updated_at: '2026-08-11T00:00:00Z' };
    renderScoreboard();
  }, SETUP());
  r = await pg.evaluate(READ);
  ok(r.rows.p1 && r.rows.p1.text === '○' && r.rows.p1.live === true, '② ?live=: 勝者(p1)に進行中様式の○＝経路分岐なし（作者決定2）');
  ok(r.rows.p2 && r.rows.p2.text === '…', '② ?live=: 未入力(p2)は「…」');

  // 2周目: トグル取り消し → 「…」に戻る
  await pg.evaluate(() => { _sbLiveViewState.pairings.A[0].winner = null; renderScoreboard(); });
  r = await pg.evaluate(READ);
  ok(r.rows.p1.text === '…' && r.rows.p3.text === '…', '② トグル取り消しで両者とも「…」に戻る');

  // 確定済み回戦は通常表示のまま
  await pg.evaluate(() => { _sbLiveViewState.pairings.A[0].winner = 'p1'; renderScoreboard(); });
  const firstRound = await pg.evaluate(() => {
    const tr = document.querySelector('#scoreboard-view tr[data-sbpid="p1"]');
    const c = tr.querySelectorAll('td')[2].querySelector('.sb-mark');
    return { text: c.textContent.trim(), live: c.classList.contains('sb-mark-live') };
  });
  ok(firstRound.text === '○' && firstRound.live === false, '② 確定済みの1回戦は通常表示のまま  [実測 ' + JSON.stringify(firstRound) + ']');

  // 個人ビュー（論点2）
  const pv = await pg.evaluate(() => {
    _sbFocusId = 'p1'; _sbFocusCls = 'A'; renderScoreboard();
    const v = document.querySelector('#scoreboard-view .sb-player');
    return v ? v.textContent.replace(/\s+/g, ' ') : null;
  });
  ok(pv && pv.indexOf('2回戦（進行中）') >= 0 && pv.indexOf('次の対戦') < 0,
    '② 個人ビューも「2回戦（進行中）」＝星取表と矛盾しない  [実測 ' + String(pv).slice(0, 90) + '…]');
  await pg.close();

  // ---- ③ 全回戦確定なら進行中列が消える ----
  pg = await browser.newPage();
  await pg.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  const doneTh = await pg.evaluate((s) => {
    Object.assign(state, s);
    state.rounds = 1; state.pairings = { A: [] };
    renderScoreboard();
    return [...document.querySelectorAll('#scoreboard-view thead th')].map(e => e.textContent.trim());
  }, SETUP());
  ok(!doneTh.some(t => t.indexOf('進行中') >= 0), '③ 全回戦確定＋pairings 空なら「進行中」列は出ない  [実測 ' + JSON.stringify(doneTh) + ']');
  await pg.close();

  ok(errors.length === 0, '未捕捉例外なし' + (errors.length ? '（実際: ' + errors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-SCOREBOARD-INPROGRESS-MARKS-832: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
