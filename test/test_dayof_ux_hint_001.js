#!/usr/bin/env node
// DAYOF-UX-HINT-001 — 当日アプリの案内強化2点（作者依頼 2026-07-03）。
//   ① PP モードバー: 「① 受付するクラス:」＋「② 名前をタップ → ◯◯に受付」（手順番号で2段階操作を明示・
//      選択中クラス名を動的表示・クラス名は escapeHtml 経由）。
//   ② ヘッダ: 運営サイト（index.html）への参照リンク「📖 案内」（新規タブ・rel=noopener・静的リンク）。
//   RAW pin 方式（文言スライス）。実データ不使用。

const fs = require('fs');
const RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

// ---- モードバー手順番号
ok(RAW.indexOf('① 受付するクラス:') >= 0, 'M1 ①付きのクラス選択ラベル');
ok(RAW.indexOf('>受付するクラス:') < 0, 'M2 旧ラベル（番号なし）が残っていない');
ok(/② 名前をタップ → '\+escapeHtml\(ppDenseClsName\(active\)\)\+'に受付/.test(RAW), 'M3 ②ヒントに選択中クラス名（escapeHtml 経由）');
ok(RAW.indexOf('>名前をタップで受付<') < 0, 'M4 旧ヒント文言が残っていない');
var barPos = RAW.indexOf('pp-mode-bar');
ok(barPos >= 0 && RAW.indexOf('① 受付するクラス:') > barPos && RAW.indexOf('② 名前をタップ') > barPos, 'M5 ①②はモードバー内');

// ---- ヘッダの運営サイトリンク
var linkPos = RAW.indexOf('id="openGuideLink"');
ok(linkPos >= 0, 'H1 openGuideLink が存在');
var linkTag = RAW.slice(RAW.lastIndexOf('<a', linkPos), RAW.indexOf('</a>', linkPos) + 4);
ok(linkTag.indexOf('href="index.html"') >= 0, 'H2 リンク先は index.html');
ok(linkTag.indexOf('target="_blank"') >= 0 && linkTag.indexOf('rel="noopener"') >= 0, 'H3 新規タブ＋noopener（運営状態を離れない）');
ok(linkTag.indexOf('📖 案内') >= 0, 'H4 リンク文言');
ok(linkTag.indexOf('no-print') >= 0, 'H5 印刷には出さない（no-print）');
// HEADER-TIDY-001 (#746 / ⑤c) 追随: 意図（ヘッダからワンアクションで案内に到達・新規タブ）は不変のまま、
//   置き場所を常時ボタン → ☰ボトムシート（#header-menu-sheet・参加者向けグループ）へ移設。
var sheetPos = RAW.indexOf('id="header-menu-sheet"');
ok(sheetPos >= 0 && linkPos > sheetPos && linkPos < RAW.indexOf('id="headerMenuCloseBtn"'), 'H6 ☰メニューシート配下に配置（ヘッダから1タップで到達）');

console.log('DAYOF-UX-HINT-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
