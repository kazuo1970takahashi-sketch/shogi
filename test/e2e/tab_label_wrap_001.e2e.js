#!/usr/bin/env node
// Playwright E2E: TAB-LABEL-WRAP-001 — タブ名の折れ位置
//
//   出どころ: 作者「スマホで見ると参加者登録のところが２段になってる」
//             →「せめて参加者が１段目、登録が２段目にして欲しい。今は参加者登が１段目だから格好悪い」
//
//   何を測るか: **実際に描かれた行box** を Range.getClientRects() で読み、各文字が
//   何行目に落ちたかを組み立てる。CSS の宣言（display:inline-block があるか）を見ても
//   折れ位置は分からない。折れ位置は font / 幅 / flex 配分の相互作用で決まるので、
//   実ブラウザで文字の矩形を読む以外に測る方法が無い。
//
//   なぜ実ブラウザか: DOM モックには行box が無く、textContent は折り返しても変わらない。
//   壊れた実装（span を外した実装）でもモックでは緑になる。
//
// 使い方（Mac・リポジトリ直下で）:
//   node test/e2e/tab_label_wrap_001.e2e.js
//   node test/e2e/tab_label_wrap_001.e2e.js <html-or-url>
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

// ページ内で走る採取器: タブごとに「各行に落ちた文字列」を返す。
function readTabLines() {
  const out = [];
  const bar = document.querySelector('.tab-bar');
  for (const b of document.querySelectorAll('.tab-bar .tab')) {
    const tns = [];
    (function walk(n) { for (const c of n.childNodes) { if (c.nodeType === 3) tns.push(c); else walk(c); } })(b);
    const lines = []; let cur = null;
    const r = document.createRange();
    for (const tn of tns) {
      for (let i = 0; i < tn.length; i++) {
        r.setStart(tn, i); r.setEnd(tn, i + 1);
        const rect = r.getClientRects()[0];
        const top = rect ? Math.round(rect.top) : -1;
        if (!cur || cur.top !== top) { cur = { top: top, s: '' }; lines.push(cur); }
        cur.s += tn.data[i];
      }
    }
    const box = b.getBoundingClientRect();
    out.push({
      id: b.id,
      label: b.textContent,
      lines: lines.map(function (l) { return l.s; }),
      w: Math.round(box.width),
      h: Math.round(box.height)
    });
  }
  return {
    tabs: out,
    barH: Math.round(bar.getBoundingClientRect().height),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
}

const WIDTHS = [320, 360, 375, 390, 414, 430, 768];

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const byWidth = {};

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tab-bar .tab', { timeout: 10000 });
    byWidth[w] = await page.evaluate(readTabLines);
    await ctx.close();
  }

  const tabOf = (w, id) => byWidth[w].tabs.filter(t => t.id === id)[0];
  const linesOf = (w, id) => (tabOf(w, id) || { lines: [] }).lines;
  const show = (w, id) => linesOf(w, id).join(' / ');

  // ---- T1: 本題。折り返すときは「参加者 / 登録」で折れる（語の切れ目）
  //   ★ 折り返しが起きる幅でのみ意味を持つ命題なので、まず「2行になっている」ことを確かめてから
  //     折れ位置を見る。1行に収まる幅（768px）で緑になっても何も証明していない。
  for (const w of [360, 375, 390, 414, 430]) {
    const L = linesOf(w, 'tab-reg');
    ok(L.length === 2, 'T1-' + w + ' 参加者登録は2行になる（前提の確認・実測 ' + L.length + '行）');
    ok(L.length === 2 && L[0] === '参加者' && L[1] === '登録',
      'T1-' + w + ' 折れ位置は「参加者 / 登録」  [実測 ' + show(w, 'tab-reg') + ']');
  }

  // ---- T2: 320px（極小幅）では5本とも折り返すが、どれも語の切れ目で折れる
  const T2 = { 'tab-reg': ['参加者', '登録'], 'tab-tournament': ['対局', '管理'],
               'tab-result': ['最終', '結果'], 'tab-master': ['会員', '名簿'],
               'tab-history': ['大会', '履歴'] };
  for (const id of Object.keys(T2)) {
    const L = linesOf(320, id);
    ok(L.length === 2 && L[0] === T2[id][0] && L[1] === T2[id][1],
      'T2 320px ' + id + ' は「' + T2[id].join(' / ') + '」  [実測 ' + show(320, id) + ']');
  }

  // ---- T3: 折り返さない幅では1行のまま（余計な改行を作っていない）
  for (const id of Object.keys(T2)) {
    ok(linesOf(768, id).length === 1, 'T3 768px ' + id + ' は1行のまま  [実測 ' + show(768, id) + ']');
  }
  for (const id of ['tab-tournament', 'tab-result', 'tab-master', 'tab-history']) {
    ok(linesOf(375, id).length === 1, 'T3 375px ' + id + ' は1行のまま  [実測 ' + show(375, id) + ']');
  }

  // ---- T4: ページの横あふれを作っていない（white-space:nowrap で潰す解法との差）
  for (const w of WIDTHS) {
    ok(byWidth[w].pageOverflow === 0,
      'T4 ' + w + 'px ページの横あふれ 0  [実測 ' + byWidth[w].pageOverflow + 'px]');
  }

  // ---- T5: タップ標的（STYLE-GUIDE §10.3）を縮めていない
  //   ★ 44px を要求するのはスマホ幅（=2行になる幅）だけ。768px では5本とも1行になり、
  //     .tab の padding 10px×2 + 行高で **39px** にしかならない。これは本スライスが
  //     作ったものではなく **base（`10a052b`）でも 39px** の既存不適合で、
  //     本スライスは1px も動かしていない（実測で base と head が完全一致）。
  //     ここでは「変えていないこと」を対照として固定する。直すのはタブ帯の設計の話＝別便。
  for (const w of [320, 360, 375, 390, 414, 430]) {
    const minH = Math.min.apply(null, byWidth[w].tabs.map(t => t.h));
    ok(minH >= 44, 'T5 ' + w + 'px タブの高さは 44px 以上  [実測 ' + minH + 'px]');
  }
  {
    const hs = byWidth[768].tabs.map(t => t.h);
    ok(hs.every(h => h === 39),
      'T5 対照 768px は1行ぶんの 39px のまま（既存不適合・本便で不変）  [実測 ' + hs.join(',') + ']');
  }

  ok(pageErrors.length === 0, '未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-TAB-LABEL-WRAP-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
