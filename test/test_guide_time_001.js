#!/usr/bin/env node
// GUIDE-TIME-001 — 案内サイト（index.html）の持ち時間を実値表示（作者依頼 2026-07-03・案A=置き換え）。
//   当日アプリと同一端末なら localStorage 'shogi_v4' の state.report（timeType/timeMain/timeByoyomi）を
//   「今大会：25分切れ負け（当日アプリの入力から自動表示）」に整形して差し替える。
//   読めない端末・壊れたデータは一般文言のまま（fail-soft）。textContent のみ＝innerHTML 不使用。
//   実データ不使用（fixture は架空のみ）。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const target = process.argv[2] || 'shogi_v4.html';
const INDEX = path.join(path.dirname(path.resolve(target)), 'index.html');
const RAW = fs.readFileSync(INDEX, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

// ---- R: RAW pin（構造）
ok(RAW.indexOf('id="timeControlLine"') >= 0, 'R1 timeControlLine が存在');
ok(RAW.indexOf('大会により異なります（当日の報告書に記載）') >= 0, 'R2 一般文言（フォールバック）が残っている');
const mk = RAW.indexOf('GUIDE-TIME-001');
ok(mk >= 0, 'R3 GUIDE-TIME-001 マーカーコメント');

// ---- スクリプト抽出（マーカー直後の <script> ブロック）
const sStart = RAW.indexOf('<script>', mk);
const sEnd = RAW.indexOf('</script>', sStart);
ok(sStart > mk && sEnd > sStart, 'R4 マーカー直後に script ブロック');
const SCRIPT = RAW.slice(sStart + 8, sEnd);
ok(SCRIPT.indexOf('textContent') >= 0 && SCRIPT.indexOf('innerHTML') < 0, 'X1 textContent のみ（innerHTML 不使用）');
ok(/try\s*\{/.test(SCRIPT) && /catch\s*\(/.test(SCRIPT), 'X2 try/catch（fail-soft）');

// ---- B: 挙動（localStorage/document モックで実行）
const GENERIC = '大会により異なります（当日の報告書に記載）。';
function run(lsValue, opts) {
  opts = opts || {};
  const el = { textContent: GENERIC };
  const sandbox = {
    localStorage: {
      getItem: function (k) {
        if (opts.throwOnGet) throw new Error('denied');
        return k === 'shogi_v4' ? lsValue : null;
      }
    },
    document: { getElementById: function (id) { return id === 'timeControlLine' ? el : null; } }
  };
  vm.runInNewContext(SCRIPT, sandbox);
  return el.textContent;
}
const mkState = (report) => JSON.stringify({ version: 4, report: report });

ok(run(mkState({ timeType: 'sudden', timeMain: 25, timeByoyomi: 30 })) === '今大会：25分切れ負け（当日アプリの入力から自動表示）', 'B1 切れ負け整形');
ok(run(mkState({ timeType: 'byoyomi', timeMain: 20, timeByoyomi: 30 })) === '今大会：20分（切れたら一手30秒）（当日アプリの入力から自動表示）', 'B2 秒読み整形');
ok(run(null) === GENERIC, 'B3 データ無し端末は一般文言のまま');
ok(run('{broken json') === GENERIC, 'B4 壊れた JSON でも例外なく一般文言');
ok(run(mkState({ timeType: 'sudden', timeMain: 0 })) === GENERIC, 'B5 timeMain 不正(0)は表示しない');
ok(run(mkState({ timeType: 'sudden', timeMain: 'abc' })) === GENERIC, 'B5b timeMain 非数値は表示しない');
ok(run(JSON.stringify({ version: 4 })) === GENERIC, 'B6 report 欠落は一般文言');
ok(run(mkState({ timeType: 'byoyomi', timeMain: 15 })) === '今大会：15分（切れたら一手30秒）（当日アプリの入力から自動表示）', 'B7 秒読み秒欠落は既定30');
ok(run(mkState({ timeType: 'sudden', timeMain: '25' })) === '今大会：25分切れ負け（当日アプリの入力から自動表示）', 'B8 文字列数値も parseInt で許容');
ok(run(null, { throwOnGet: true }) === GENERIC, 'B9 localStorage 例外（プライベートモード等）でも fail-soft');
ok(run(mkState({ timeType: 'unknown', timeMain: 25 })) === '今大会：25分切れ負け（当日アプリの入力から自動表示）', 'B10 未知 timeType は切れ負け扱い（当日アプリの normalize と同方針）');

console.log('GUIDE-TIME-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
