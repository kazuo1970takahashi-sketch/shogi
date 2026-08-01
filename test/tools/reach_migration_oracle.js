#!/usr/bin/env node
// PHASE1-REACH-001 移行オラクル — 旧版の走査と現行の走査を機械で突き合わせる。
//
//   使い方:
//     node test/tools/reach_migration_oracle.js [<旧版の git rev>] [<対象ファイル>]
//     既定: rev=9176cc5（PHASE1-REACH-001c＝面レクサ導入の直前）／対象=shogi_v4.html
//
//   なぜ要るか: 001d で走査を「単一の面レクサ」へ全面移行したとき、退行がゼロで
//   あることを散文で主張しても第三者は再現できない（#799 の差し戻し 4 回目・中）。
//   このスクリプトは旧版の lib を git から取り出して同じ入力に当て、
//     (1) JS 領域の文字分類
//     (2) 「参照として数えるか」の判定（全文字）
//     (3) 解析結果（root / 静的・実行時到達不能 / 死んだ結線 / 死んだ領域 / 参照内訳）
//   を突き合わせて差分を表示する。差分ゼロなら exit 0。
//
//   注意: 旧版と現行で**意図的に変えた**ところは差分として出る。001e では
//   「制御構文の `)` 直後の正規表現」「`++` 直後」「on* の有限リスト化」を直したので、
//   対象ファイルにその形が実在すれば差分が出るのが正しい（出た差分は理由つきで読むこと）。
//
//   このファイルは test_*.js に一致しないので run_tests.sh の自動発見には載らない。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rev = process.argv[2] || '9176cc5';
const target = process.argv[3] || 'shogi_v4.html';
const repo = path.resolve(__dirname, '..', '..');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-oracle-'));
const oldPath = path.join(dir, 'reachability_old.js');
fs.writeFileSync(oldPath, execFileSync('git', ['-C', repo, 'show', `${rev}:test/lib/reachability.js`], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}), 'utf8');

const OLD = require(oldPath);
const NEW = require(path.join(repo, 'test/lib/reachability.js'));
const src = fs.readFileSync(path.resolve(repo, target), 'utf8');

console.log(`旧版 rev=${rev} / 対象=${target} (${src.length} 文字)`);

const AO = OLD.analyze(src);
const AN = NEW.analyze(src);
const F = NEW.FACE;
const FN = NEW.FACE_NAME;
let bad = 0;
const say = (label, okFlag, detail) => {
  console.log(`[${okFlag ? 'OK' : '差分'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!okFlag) bad++;
};

// --- 1. 完全性（現行のみが持つ不変条件）--------------------------------------
const st = NEW.faceStats(AN._internal.baseFace);
say('面の完全性（未分類 0・総延長＝ファイル長）',
  st.unclassified === 0 && st.covered === st.total,
  `covered=${st.covered}/${st.total} unclassified=${st.unclassified}`);

// --- 2. JS 領域の文字分類 -----------------------------------------------------
//   旧版の文字クラス C/S/X へ面を射影して比較する。
const CC = OLD.CHAR_CLASS;
const proj = (f) => {
  switch (f) {
    case F.JS_CODE: case F.JS_TMPL_DELIM: return CC.C;
    case F.JS_STR_SQ: case F.JS_STR_DQ: case F.JS_TMPL_STR: case F.JS_REGEX: return CC.S;
    case F.JS_LINE_COMMENT: case F.JS_BLOCK_COMMENT: return CC.X;
    default: return null;
  }
};
const oldCls = AO._internal.cls;
const base = AN._internal.baseFace;
const face = AN._internal.face;
let jsChars = 0;
let diff1 = 0;
const s1 = [];
for (let i = 0; i < src.length; i++) {
  const p = proj(base[i]);
  if (p === null) continue;
  jsChars++;
  // 旧版が on*= を H で上書きした位置／現行が派生パスで昇格した位置は 3 で比べる
  if (oldCls[i] === CC.H || face[i] === F.ATTR_VAL_ON) continue;
  if (oldCls[i] !== p) {
    diff1++;
    if (s1.length < 10) s1.push(`  @${i} 旧=${String.fromCharCode(oldCls[i])} 新=${FN[base[i]]} ${JSON.stringify(src.slice(i - 45, i + 45))}`);
  }
}
say(`JS 領域の文字分類（${jsChars} 文字）`, diff1 === 0, `不一致 ${diff1}`);
s1.forEach((l) => console.log(l));

// --- 3. 「参照として数えるか」の判定（全文字）---------------------------------
let diff2 = 0;
const s2 = [];
for (let i = 0; i < src.length; i++) {
  const r3 = oldCls[i] === CC.C || oldCls[i] === CC.H;
  const r4 = NEW.isRefFace(face[i]);
  if (r3 !== r4) {
    diff2++;
    if (s2.length < 12) s2.push(`  @${i} 旧=${String.fromCharCode(oldCls[i])} 新=${FN[face[i]]} ${JSON.stringify(src.slice(i - 45, i + 45))}`);
  }
}
say(`参照面の判定（全 ${src.length} 文字）`, diff2 === 0, `不一致 ${diff2}`);
s2.forEach((l) => console.log(l));

// --- 4. 解析結果 --------------------------------------------------------------
const cmp = (label, a, b2) => say(label, String(a) === String(b2), `旧=${a} 新=${b2}`);
cmp('scriptBlocks', AO.scriptBlocks, AN.scriptBlocks);
cmp('topLevelFunctionCount', AO.topLevelFunctionCount, AN.topLevelFunctionCount);
cmp('functionDeclsAllDepths', AO.functionDeclsAllDepths, AN.functionDeclsAllDepths);
cmp('inlineHandlerCount', AO.inlineHandlerCount, AN.inlineHandlerCount);
cmp('rootNames', AO.rootNames.join(','), AN.rootNames.join(','));
cmp('selectorAliases', AO.selectorAliases.join(','), AN.selectorAliases.join(','));
cmp('unreachableStatic', AO.unreachableStatic.map((x) => x.name).join(','), AN.unreachableStatic.map((x) => x.name).join(','));
cmp('unreachableRuntimeOnly', AO.unreachableRuntimeOnly.map((x) => x.name).join(','), AN.unreachableRuntimeOnly.map((x) => x.name).join(','));
cmp('deadBindings', AO.deadBindings.map((x) => x.selector).join(','), AN.deadBindings.map((x) => x.selector).join(','));
cmp('deadRegions', AO._internal.deadRegions.map((r) => r.start + '-' + r.end).join(','),
  AN._internal.deadRegions.map((r) => r.start + '-' + r.end).join(','));

// 全関数の参照内訳（live / comment / string / markup）
const bag = (a) => [...a._internal.byName.keys()].sort().map((n) => {
  const d = a._internal.describe(n);
  return `${n}:${d.liveRefs}/${d.commentRefs}/${d.stringRefs}/${d.markupRefs}`;
});
const b1 = bag(AO);
const b2b = bag(AN);
const rowDiff = [];
for (let i = 0; i < Math.max(b1.length, b2b.length); i++) if (b1[i] !== b2b[i]) rowDiff.push(`  ${b1[i]} -> ${b2b[i]}`);
say(`全 ${b1.length} 関数の参照内訳（live/cmt/str/markup）`, rowDiff.length === 0, `不一致 ${rowDiff.length} 行`);
rowDiff.slice(0, 20).forEach((l) => console.log(l));

fs.rmSync(dir, { recursive: true, force: true });
console.log(bad === 0 ? '差分ゼロ' : `差分あり: ${bad} 項目`);
process.exit(bad === 0 ? 0 : 1);
