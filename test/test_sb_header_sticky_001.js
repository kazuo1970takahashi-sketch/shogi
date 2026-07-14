#!/usr/bin/env node
// SB-HEADER-STICKY-001 (#770): スマホ星取表の列ヘッダ（回戦・勝/負/B/C）を縦スクロールに追従させる。
//   背景（2026-07-13 スケール監査 S5）: thead は position:sticky;top:0 指定済みだが、縦スクロールが
//   #scoreboard-view（overflow-y:auto）で起き、sticky の基準になる .sb-scroll は横スクロール専用で
//   縦に伸び切るため sticky が機能せず、50行スクロールで列ヘッダが画面外（実測 top=-984px）へ消えた。
//   修正: .sb-scroll に max-height + overflow-y:auto を与え、縦スクロールを .sb-scroll 内側へ閉じ込めて
//   thead sticky を成立させる（横スクロール overflow-x・左列 sticky・thead sticky 指定は不変）。
//   本テストは CSS ソースの静的担保（実 sticky 挙動は実ブラウザ検証で担保）。
var fs = require('fs');
var target = process.argv[2] || 'shogi_v4.html';
var RAW = fs.readFileSync(target, 'utf8');
var pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// .sb-scroll ルールを抽出
var m = RAW.match(/\.sb-scroll\{([^}]*)\}/);
ok(!!m, 'S0 .sb-scroll ルールが存在');
var rule = m ? m[1] : '';

// 縦スクロール成立の3点セット
ok(/overflow-x:auto/.test(rule), 'S1 横スクロール（overflow-x:auto）は不変（左右の回戦列スクロール）');
ok(/overflow-y:auto/.test(rule), 'S2 縦スクロール（overflow-y:auto）を .sb-scroll に付与（sticky 基準を移す）');
ok(/max-height:calc\(100dvh - 230px\)/.test(rule), 'S3 max-height:calc(100dvh - 230px)（縦スクロールを内側に閉じ込める）');
ok(/max-height:calc\(100vh - 230px\)/.test(rule), 'S4 100vh フォールバックを 100dvh より先に置く（dvh 非対応ブラウザ）');

// thead sticky 指定は不変（これが .sb-scroll の縦スクロールで初めて効く）
ok(/\.sb-table thead th\{[^}]*position:sticky;top:0/.test(RAW), 'S5 thead th の position:sticky;top:0 は不変');

// 左列 sticky（横方向）は不変
ok(/\.sb-col-rank\{[^}]*position:sticky;left:0/.test(RAW), 'S6 順位列 sticky left:0 不変');
ok(/\.sb-col-name\{[^}]*position:sticky;left:40px/.test(RAW), 'S7 氏名列 sticky left:40px 不変');

// #scoreboard-view の overflow-y:auto は温存（外側スクロール＝タブ/検索が多い場合の保険・多クラス時の縦つなぎ）
ok(/#scoreboard-view\{[^}]*overflow-y:auto/.test(RAW), 'S8 #scoreboard-view の overflow-y:auto は温存（多クラス縦つなぎ・保険）');

console.log('SB-HEADER-STICKY-001: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
