#!/usr/bin/env node
// APP-HARNESS-001 [PHASE1-LOADER-001]: テスト読込共通ヘルパ test/lib/app_harness.js のセルフテスト。
//   検出装置そのものが壊れたときに黙って緑にならないことを固定する。
//   B2（抽出器の破損＝抽出漏れ・空束）／B3（アプリ定義名を評価前 override に渡す）／
//   B1（評価後 stub が実際に効いている）を含む。
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./lib/app_harness');

const TARGET = process.argv[2] || 'shogi_v4.html';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
function throws(fn, re, m) {
  let e = null;
  try { fn(); } catch (err) { e = err; }
  ok(e !== null && re.test(String(e && e.message)), m + (e ? '' : '（例外が出なかった）'));
  return e;
}

console.log('=== A 抽出器（既存テストの複製実装との等価）===');
const eq = H.assertExtractionMatchesLegacy(TARGET);
ok(eq.equal, 'A1 共通ヘルパの抽出結果は既存テストの正規表現と byte 一致（新旧で読む束が同じ）');
ok(eq.newLen > 100000, 'A2 抽出量が実サイズ（10万字超）＝抽出漏れしていない');
ok(H.extractScripts('<script src="x.js"></script><script>var a=1;</script>').indexOf('var a=1;') >= 0,
  'A3 inline script は抽出される');
ok(H.extractScripts('<script src="x.js">IGNORED</script>').indexOf('IGNORED') < 0,
  'A4 src= 付き script は除外される');
ok(H.extractScripts('<div>x</div>') === '', 'A5 script が無ければ空束');

console.log('=== B2 抽出器の破損は必ず失敗になる（空束で黙って緑にならない）===');
const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-harness-'));
const emptyHtml = path.join(tmpdir, 'no_script.html');
fs.writeFileSync(emptyHtml, '<!doctype html><html><body><div id="x"></div></body></html>', 'utf8');
throws(() => H.loadApp(emptyHtml), /<script> を1本も抽出できなかった/, 'B2-1 空束（抽出0本）は loadApp が例外');
const srcOnlyHtml = path.join(tmpdir, 'src_only.html');
fs.writeFileSync(srcOnlyHtml, '<!doctype html><html><body><script src="app.js"></script></body></html>', 'utf8');
throws(() => H.loadApp(srcOnlyHtml), /<script> を1本も抽出できなかった/, 'B2-2 外部 script だけでも空束として例外');

console.log('=== C 全束評価の基本（対象アプリ）===');
const app = H.loadApp(TARGET);
ok(typeof app.ctx.state === 'object' && app.ctx.state !== null, 'C1 state が ctx グローバルとして見える');
ok(app.appNames.length > 500, 'C2 アプリ定義グローバルが多数公開される（実測 ' + app.appNames.length + '）');
ok(app.appNames.filter((n) => typeof app.ctx[n] === 'function').length > 400, 'C3 うち関数が多数（隠れた抽出漏れの検出）');
app.ctx.state = { marker: 1 };
ok(app.ctx.state.marker === 1, 'C4 host→vm の state 代入が見える');
ok(app.html.length > 0 && app.source.length > 0, 'C5 html / source を参照できる');
ok(H.readHtml(TARGET) === app.html, 'C6 readHtml は評価せず同じ生ソースを返す');

// トップレベル const/let は ctx グローバルにならない（vm のレキシカルスコープに入る）。
// 現状 0 件であることを pin する。増えたらこのテストが落ちて MIGRATION.md の注意書きに戻れる。
const topLexical = app.source.split('\n').filter((l) => /^(const|let)\s/.test(l)).length;
ok(topLexical === 0, 'C7 対象のトップレベル const/let は 0 件（あると ctx へ出ない・実測 ' + topLexical + '）');

console.log('=== B3 アプリ定義名を評価前 override に渡すと例外（黙って clobber されない）===');
throws(() => H.loadApp(TARGET, { overrides: { normalizeCity: function () { return 'STUB'; } } }),
  /評価前 override がアプリ自身の定義で上書きされた/, 'B3-1 アプリ関数名を overrides に渡すと loadApp が例外');
throws(() => H.loadApp(TARGET, { overrides: { state: { marker: 9 } } }),
  /評価前 override がアプリ自身の定義で上書きされた/, 'B3-2 state を overrides に渡しても例外');
const e3 = throws(() => H.loadApp(TARGET, { overrides: { normalizeCity: function () {} } }), /./, 'B3-3 例外は直し方を示す');
ok(e3 && /評価後 stub/.test(e3.message) && /normalizeCity/.test(e3.message), 'B3-4 例外文言に該当名と「評価後 stub」の誘導がある');

console.log('=== B1 評価後 stub は実際に呼ばれて効く（素通りしたら落ちる）===');
const app1 = H.loadApp(TARGET);
const master = { members: [{ id: 'm1', name: '架空太郎', city: '沼津市' }] };
const before = app1.ctx.addPlayerFromMaster('m1', 'A', master, { players: { A: [], B: [] } });
ok(before && before.player && before.player.city === '沼津市', 'B1-1 stub 前は本物の normalizeCity が効いている');
const restore = app1.stub('normalizeCity', function () { return 'STUBBED'; });
const after = app1.ctx.addPlayerFromMaster('m1', 'A', master, { players: { A: [], B: [] } });
ok(after && after.player && after.player.city === 'STUBBED', 'B1-2 評価後 stub が呼び出し経路で実際に効く（素通りなら「沼津市」で落ちる）');
restore();
const restored = app1.ctx.addPlayerFromMaster('m1', 'A', master, { players: { A: [], B: [] } });
ok(restored.player.city === '沼津市', 'B1-3 restore() で本物に戻る');
throws(() => app1.stub('thisFunctionDoesNotExist_zzz', function () {}),
  /stub 対象がアプリに存在しない/, 'B1-4 存在しない名前への stub は例外（typo が黙って無効化されない）');

console.log('=== D 二相の分離（評価前 override はブラウザ API 側）===');
const throwLS = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
const appD = H.loadApp(TARGET, { overrides: { localStorage: throwLS } });
ok(appD.ctx.localStorage === throwLS, 'D1 評価前 override は評価後も同一（clobber されていない）');
ok(appD.ctx.probeStorageWritable() === false, 'D2 override した localStorage がアプリから見えている');
ok(appD.ctx.window.localStorage === throwLS, 'D3 window 越しの参照も差し替えに追従する');

console.log('=== E 副作用の記録と節ごとの独立性 ===');
const appE = H.loadApp(TARGET);
appE.ctx.localStorage.setItem('k', 'v');
ok(appE.record.localSetItem.length === 1 && appE.record.localSetItem[0][0] === 'k', 'E1 setItem が記録される');
appE.ctx.alert('しらせ');
ok(appE.record.alert.length === 1 && appE.record.alert[0] === 'しらせ', 'E2 alert 文言が記録される');
const spyLog = appE.spy('normalizeCity');
appE.ctx.normalizeCity('  沼津市  ');
ok(spyLog.length === 1 && spyLog[0][0] === '  沼津市  ', 'E3 spy が引数を記録する（既定は通過）');
ok(appE.ctx.normalizeCity('  沼津市  ') === '沼津市', 'E4 spy は本物の返り値を通す');
const appE2 = H.loadApp(TARGET);
ok(appE2.record.localSetItem.length === 0, 'E5 loadApp をやり直すと記録は空（節をまたいで漏れない）');
ok(appE2.ctx.normalizeCity.toString().indexOf('log.push') < 0, 'E6 前の節の spy/stub が新しい環境に漏れない');
ok(appE2.ctx.localStorage.getItem('k') === null, 'E7 前の節の localStorage の中身が漏れない');
ok(appE2.els !== appE.els, 'E8 DOM 要素レジストリも節ごとに別');

console.log('=== F アクセサ ===');
ok(appE2.fn('normalizeCity') === appE2.ctx.normalizeCity, 'F1 fn(name) は同じ関数を返す');
throws(() => appE2.fn('nope_zzz'), /関数ではない\/未定義/, 'F2 未定義名の fn は例外');
throws(() => appE2.get('nope_zzz'), /未定義のグローバル/, 'F3 未定義名の get は例外');
ok(appE2.el('storage-warn') === appE2.ctx.document.getElementById('storage-warn'), 'F4 el(id) は評価コンテキストの document を引く');
ok(appE2.APP_HARNESS_VERSION === H.APP_HARNESS_VERSION, 'F5 バージョンを公開している');

try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) { /* 後始末は best-effort */ }

console.log('APP-HARNESS-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
