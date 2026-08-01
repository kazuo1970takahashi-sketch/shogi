#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（検査1=静的到達可能性 / 検査2=bind 先の実在）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（当初 35 関数・PHASE1-REACH-001b の走査修正後 39 関数が到達不能）を
//   常設の検査に落としたもの。
//   このファイル自身が「壊れたら落ちること」を変異検証（M1-M8）で実証する。
'use strict';

const fs = require('fs');
const path = require('path');
const { analyze, CHAR_CLASS } = require('./lib/reachability.js');

const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'reachability_allowlist.json'), 'utf8'));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

// 理由として認める最低文字数。空欄・"TODO"・"-" 等の骨抜きを拒否する。
const MIN_REASON = 20;

// =============================================================================
// 判定本体: 解析結果 × allowlist → 違反リスト
//   変異検証でも同じ関数を通す＝「本番で緑」と「変異で赤」が同一ロジックで示される。
// =============================================================================
function evaluate(a, allow) {
  const violations = [];

  const staticFound = new Map(a.unreachableStatic.map((x) => [x.name, x]));
  const runtimeFound = new Map(a.unreachableRuntimeOnly.map((x) => [x.name, x]));
  const bindingFound = new Map(a.deadBindings.map((x) => [x.selector, x]));

  const staticAllow = new Map((allow.static || []).map((e) => [e.name, e]));
  const runtimeAllow = new Map((allow.runtime || []).map((e) => [e.name, e]));
  const bindingAllow = new Map((allow.bindings || []).map((e) => [e.selector, e]));

  // R1: 静的に到達不能なのに allowlist に無い
  for (const [name, info] of staticFound) {
    if (!staticAllow.has(name)) {
      violations.push({
        rule: 'R1',
        subject: name,
        message: `L${info.line} ${name}() がルートから到達不能なのに allowlist（static）に無い`,
      });
    }
  }
  // R2: 結線先が実在せず実行時に到達不能なのに allowlist に無い
  for (const [name, info] of runtimeFound) {
    if (!runtimeAllow.has(name)) {
      violations.push({
        rule: 'R2',
        subject: name,
        message: `L${info.line} ${name}() は結線先の DOM が存在せず実行時に到達不能なのに allowlist（runtime）に無い`,
      });
    }
  }
  // R3: 生成されていないセレクタへの結線なのに allowlist に無い
  for (const [sel, info] of bindingFound) {
    if (!bindingAllow.has(sel)) {
      violations.push({
        rule: 'R3',
        subject: sel,
        message: `L${info.line} ${sel} に結線しているが、この id/class をどこでも生成していない（allowlist（bindings）に無い）`,
      });
    }
  }
  // R4: 理由の無い / 短すぎる allowlist エントリ
  const reasonCheck = (list, key, section) => {
    for (const e of list || []) {
      const r = (e.reason || '').trim();
      if (r.length < MIN_REASON) {
        violations.push({
          rule: 'R4',
          subject: e[key],
          message: `allowlist（${section}）の ${e[key]} に理由が無い / 短すぎる（${r.length} 文字・${MIN_REASON} 文字以上が必要）`,
        });
      }
    }
  };
  reasonCheck(allow.static, 'name', 'static');
  reasonCheck(allow.runtime, 'name', 'runtime');
  reasonCheck(allow.bindings, 'selector', 'bindings');

  // R5: 到達可能に戻ったのに allowlist に残っている（＝掃除漏れ。肥大を防ぐ）
  for (const [name] of staticAllow) {
    if (!staticFound.has(name)) {
      violations.push({
        rule: 'R5',
        subject: name,
        message: `allowlist（static）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`,
      });
    }
  }
  for (const [name] of runtimeAllow) {
    if (!runtimeFound.has(name)) {
      violations.push({
        rule: 'R5',
        subject: name,
        message: `allowlist（runtime）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`,
      });
    }
  }
  for (const [sel] of bindingAllow) {
    if (!bindingFound.has(sel)) {
      violations.push({
        rule: 'R5',
        subject: sel,
        message: `allowlist（bindings）の ${sel} は現在生成されている。allowlist から外すこと`,
      });
    }
  }
  return violations;
}

// =============================================================================
// 1. 走査そのものの健全性（走査が空振りしていないことの確認）
// =============================================================================
console.log('=== 走査の健全性 ===');
const t0 = Date.now();
const A = analyze(RAW);
const elapsed = Date.now() - t0;

ok(A.scriptBlocks === 2, `S1 <script> ブロックが 2（逐次スキャン＝JS 文字列内の "<script>" で二重化しない）: 実測 ${A.scriptBlocks}`);
ok(A.topLevelFunctionCount > 400, `S2 トップレベル関数を検出している: 実測 ${A.topLevelFunctionCount}`);
ok(A.functionDeclsAllDepths > A.topLevelFunctionCount, `S3 ネスト関数も数えている（全深さ ${A.functionDeclsAllDepths} > トップレベル ${A.topLevelFunctionCount}）`);
ok(A.rootNames.length >= 5, `S4 ルートを検出している（HTML インライン属性 ＋ スクリプト直下）: 実測 ${A.rootNames.length}`);
ok(A.rootNames.indexOf('initApp') >= 0, 'S5 DOMContentLoaded の initApp をルートとして拾っている');
ok(A.rootNames.indexOf('printResults') >= 0, 'S6 インライン onclick="printResults()" をルートとして拾っている');

// 罠(1) の回帰ガード: コメント参照だけの関数を「生きている」と誤判定しない。
const finalize = A.unreachableStatic.find((x) => x.name === 'finalizeAddPastParticipants');
ok(!!finalize, 'S7 finalizeAddPastParticipants が到達不能として検出される（コメント参照を数えない＝#798 の罠1）');
ok(!!finalize && finalize.commentRefs > 0, `S8 その関数はコメントで言及されている（数えていたら緑になってしまう）: cmt=${finalize ? finalize.commentRefs : 0}`);
ok(!!finalize && finalize.liveRefs > 0, `S9 かつコード参照も存在する＝「定義以外の出現0回」方式では拾えない（#798 の罠3）: refs=${finalize ? finalize.liveRefs : 0}`);

// 罠(4) の回帰ガード（PHASE1-REACH-001b）: 文字列内の言及だけの関数を「生きている」と
// 誤判定しない。初版はここで startTournament を取り逃していた（Codex P1）。
const startT = A.unreachableStatic.find((x) => x.name === 'startTournament');
ok(!!startT, 'S10 startTournament が到達不能として検出される（文字列内の言及を数えない＝罠4）');
ok(!!startT && startT.stringRefs > 0 && startT.liveRefs === 0,
  `S11 その関数はログ文字列でのみ言及されている（数えていたら緑になってしまう）: str=${startT ? startT.stringRefs : 0} refs=${startT ? startT.liveRefs : 0}`);

console.log(`  走査: ${elapsed}ms / トップレベル ${A.topLevelFunctionCount} 関数 / ルート ${A.rootNames.length}`);
console.log(`  検査1 静的到達不能: ${A.unreachableStatic.length}`);
console.log(`  検査2 実行時のみ到達不能: ${A.unreachableRuntimeOnly.length}`);
console.log(`  検査2 死んだ結線: ${A.deadBindings.length} (${A.deadBindings.map((d) => d.selector).join(', ')})`);

// =============================================================================
// 2. 本番判定: allowlist に無い到達不能コードがあれば FAIL
// =============================================================================
console.log('=== 到達可能性チェック（本番判定） ===');
const V = evaluate(A, ALLOW);
if (V.length) {
  console.log('  --- 違反 ---');
  for (const v of V) console.log(`  [${v.rule}] ${v.message}`);
  console.log('  ------------');
  console.log('  対処: (a) 到達可能に直す / (b) 意図的なら test/reachability_allowlist.json に理由つきで追加');
}
ok(V.length === 0, `R0 allowlist に無い到達不能コード / 掃除漏れ: ${V.length} 件`);

// =============================================================================
// 3. allowlist の健全性
// =============================================================================
console.log('=== allowlist の健全性 ===');
const allEntries = [
  ...(ALLOW.static || []).map((e) => ['static', e.name, e]),
  ...(ALLOW.runtime || []).map((e) => ['runtime', e.name, e]),
  ...(ALLOW.bindings || []).map((e) => ['bindings', e.selector, e]),
];
ok(allEntries.every(([, k]) => typeof k === 'string' && k.length > 0), 'A1 全エントリに name / selector がある');
ok(allEntries.every(([, , e]) => (e.reason || '').trim().length >= MIN_REASON), `A2 全エントリに ${MIN_REASON} 文字以上の理由がある`);
ok(allEntries.every(([, , e]) => typeof e.category === 'string' && e.category.length > 0), 'A3 全エントリに category がある');
const dupKey = new Set();
let dup = 0;
for (const [sec, k] of allEntries) { const kk = sec + ':' + k; if (dupKey.has(kk)) dup++; dupKey.add(kk); }
ok(dup === 0, `A4 allowlist に重複エントリが無い: ${dup} 件`);

// #798 のベースラインと現状の件数差を可視化する（増減そのものは FAIL にしない＝
// 削除・修正が進めば減るのが正しい。R5 が掃除漏れを、R1-R3 が増加を捕まえる）。
const b = ALLOW.baseline || {};
console.log(`  baseline(#798): static=${b.static_unreachable} runtime=${b.runtime_unreachable} bindings=${b.dead_bindings} 関数総数=${b.top_level_functions}`);
console.log(`  現在        : static=${A.unreachableStatic.length} runtime=${A.unreachableRuntimeOnly.length} bindings=${A.deadBindings.length} 関数総数=${A.topLevelFunctionCount}`);
ok((ALLOW.static || []).length + (ALLOW.runtime || []).length <= b.static_unreachable + b.runtime_unreachable,
  `A5 allowlist が #798 ベースライン（${b.static_unreachable + b.runtime_unreachable} 件）を超えて肥大していない: 実測 ${(ALLOW.static || []).length + (ALLOW.runtime || []).length} 件`);

// =============================================================================
// 4. 変異検証 — 「壊れたら本当に落ちるか」
//    すべてメモリ上のコピーに対して行う。shogi_v4.html は 1 バイトも書き換えない。
// =============================================================================
console.log('=== 変異検証（検査自体の検算） ===');

const before = RAW;

// --- M1: 生きている関数の bind を外す（DOMContentLoaded から 1 行削る） -------
const m1Src = RAW.replace('  bindTabEvents();\n', '  /* PHASE1-REACH-001 変異検証: bind を外した */\n');
ok(m1Src !== RAW, 'M1-0 変異が適用された（DOMContentLoaded の bindTabEvents() 呼出を除去）');
const m1 = analyze(m1Src);
const m1v = evaluate(m1, ALLOW);
ok(m1.rootNames.indexOf('bindTabEvents') < 0, 'M1-1 bindTabEvents がルートから消える');
ok(m1.unreachableStatic.some((x) => x.name === 'bindTabEvents'), 'M1-2 bindTabEvents が到達不能として検出される');
ok(m1v.some((v) => v.rule === 'R1' && v.subject === 'bindTabEvents'), 'M1-3 allowlist に無い違反として報告される');
ok(m1v.length > 0, `M1-4 検査が FAIL する（違反 ${m1v.length} 件・生きている bind を外したら落ちる）`);

// --- M2: インライン onclick を外す -------------------------------------------
const m2Src = RAW.replace('onclick="printResults()"', 'onclick=""');
ok(m2Src !== RAW, 'M2-0 変異が適用された（インライン onclick="printResults()" を除去）');
const m2 = analyze(m2Src);
const m2v = evaluate(m2, ALLOW);
ok(m2.unreachableStatic.some((x) => x.name === 'printResults'), 'M2-1 printResults が到達不能として検出される');
ok(m2v.some((v) => v.rule === 'R1' && v.subject === 'printResults'), 'M2-2 allowlist に無い違反として報告される');

// --- M3: 生きている結線先の id を描画しなくする（検査2 の変異） --------------
function pickLiveIdForMutation(src) {
  const ids = new Set();
  for (const m of src.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) ids.add(m[1]);
  for (const id of [...ids].sort()) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = 'id="' + id + '"';
    if (src.split(tag).length - 1 !== 1) continue;                       // HTML に 1 箇所だけ
    const selCount = (src.match(new RegExp("getElementById\\(\\s*'" + esc + "'\\s*\\)", 'g')) || []).length;
    const total = (src.match(new RegExp('(?<![A-Za-z0-9_$-])' + esc + '(?![A-Za-z0-9_$-])', 'g')) || []).length;
    if (total === selCount + 1) return { id, tag };                      // 出現は「セレクタ ＋ id 属性 1 個」だけ
  }
  return null;
}
const cand = pickLiveIdForMutation(RAW);
ok(!!cand, 'M3-0 変異対象の live な id を 1 つ選べた');
if (cand) {
  const m3Src = RAW.replace(cand.tag, 'id="' + cand.id + '-phase1reach-mutated"');
  ok(m3Src !== RAW, `M3-1 変異が適用された（#${cand.id} を描画しないようにした）`);
  const m3 = analyze(m3Src);
  const m3v = evaluate(m3, ALLOW);
  ok(m3.deadBindings.some((d) => d.selector === '#' + cand.id), `M3-2 #${cand.id} が死んだ結線として検出される`);
  ok(m3v.some((v) => v.rule === 'R3' && v.subject === '#' + cand.id), 'M3-3 allowlist に無い違反として報告される');
}

// --- M4: allowlist から 1 件外す（allowlist が効いていることの確認） ---------
const m4Allow = JSON.parse(JSON.stringify(ALLOW));
const dropped = m4Allow.static.shift();
ok(!!dropped, 'M4-0 allowlist（static）から 1 件外した');
const m4v = evaluate(A, m4Allow);
ok(m4v.some((v) => v.rule === 'R1' && v.subject === dropped.name),
  `M4-1 外した ${dropped.name} が「allowlist に無い到達不能関数」として FAIL する`);

// --- M5: allowlist の理由を空にする（骨抜き防止） -----------------------------
const m5Allow = JSON.parse(JSON.stringify(ALLOW));
m5Allow.static[0].reason = '';
const m5v = evaluate(A, m5Allow);
ok(m5v.some((v) => v.rule === 'R4' && v.subject === m5Allow.static[0].name),
  'M5-1 理由を空にすると FAIL する（理由の無いエントリを許さない）');

// --- M6: 死んだ関数の名前を文字列リテラルの中に置く（PHASE1-REACH-001b の穴） -
//   Codex P1 / cowork 再現の再発防止。生きている bind を外したうえで、その名前を
//   ログ文字列の中に書く。初版の走査は 'S'（文字列）を呼出辺に数えていたため、
//   これで「到達可能」に見えてしまい検査が緑のままだった（＝startTournament の見逃し）。
const M6_STR = "  var __m6CallsiteId='REACH-M6-bindTabEvents-'+String(1);\n";
const m6Src = RAW.replace('  bindTabEvents();\n', M6_STR);
ok(m6Src !== RAW, 'M6-0 変異が適用された（bind を外し、名前は文字列リテラルの中だけに残した）');
const m6 = analyze(m6Src);
const m6v = evaluate(m6, ALLOW);
const m6info = m6.unreachableStatic.find((x) => x.name === 'bindTabEvents');
ok(m6.rootNames.indexOf('bindTabEvents') < 0, 'M6-1 文字列内の言及は root にならない');
ok(!!m6info, 'M6-2 bindTabEvents が到達不能として検出される（文字列を呼出辺に数えない）');
ok(!!m6info && m6info.stringRefs > 0,
  `M6-3 その名前は確かに文字列の中に存在する（数えていたら M6-2 が緑になってしまう）: str=${m6info ? m6info.stringRefs : 0}`);
ok(m6v.some((v) => v.rule === 'R1' && v.subject === 'bindTabEvents'), 'M6-4 allowlist に無い違反として報告される');
ok(m6v.length > 0, `M6-5 検査が FAIL する（違反 ${m6v.length} 件）`);

// --- M7: 連結 ID の生成側を別名に変える（PHASE1-REACH-001b の穴その2） --------
//   `getElementById('prefix_'+x)` は初版の正規表現（単一リテラル引数のみ）に掛からず、
//   生成側 id を改名する変異が素通りしていた（Codex 実測）。
function pickConcatIdForMutation(src, cls) {
  const prefixes = new Set();
  for (const m of src.matchAll(/getElementById\(\s*'([^']*)'\s*\+/g)) {
    if (m[1].length >= 3) prefixes.add(m[1]);
  }
  for (const p of [...prefixes].sort()) {
    const gen = 'id="' + p;
    if (src.split(gen).length - 1 !== 1) continue;   // 生成側が HTML 中に 1 箇所だけ
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let produced = 0;
    for (const m of src.matchAll(re)) {
      const q = m.index;
      if (cls[q] === CHAR_CLASS.X) continue;                                   // コメント / CSS
      if (/getElementById\(\s*['"]$/.test(src.slice(Math.max(0, q - 24), q))) continue; // セレクタ引数
      produced++;
    }
    if (produced === 1) return { prefix: p, gen };   // 生成は 1 箇所だけ＝改名すれば 0 になる
  }
  return null;
}
const concat = pickConcatIdForMutation(RAW, A._internal.cls);
ok(!!concat, 'M7-0 変異対象の連結 ID（生成側が 1 箇所だけのもの）を選べた');
if (concat) {
  // 接頭辞そのものが残らないよう、末尾 1 文字の手前へ差し込む
  //   'helpBtnFirstRound_' → 'helpBtnFirstRoundPhase1ReachMutated_'
  const renamed = concat.prefix.slice(0, -1) + 'Phase1ReachMutated' + concat.prefix.slice(-1);
  ok(renamed.indexOf(concat.prefix) < 0, 'M7-1a 別名は元の接頭辞を含まない（改名になっている）');
  const m7Src = RAW.replace(concat.gen, 'id="' + renamed);
  ok(m7Src !== RAW, `M7-1 変異が適用された（生成側 id="${concat.prefix}…" → id="${renamed}…"）`);
  const m7 = analyze(m7Src);
  const m7v = evaluate(m7, ALLOW);
  const sel = '#' + concat.prefix + '*';
  ok(m7.deadBindings.some((d) => d.selector === sel), `M7-2 ${sel} が死んだ結線として検出される`);
  ok(m7v.some((v) => v.rule === 'R3' && v.subject === sel), 'M7-3 allowlist に無い違反として報告される');
  ok(m7v.length > 0, `M7-4 検査が FAIL する（違反 ${m7v.length} 件）`);
  ok(A.deadBindings.every((d) => d.selector !== sel), `M7-5 変異前は ${sel} が死んでいない＝この変異だけが原因`);
}

// --- M8: 死んだ関数の名前をコメントの中に置く（#798 の罠1 の再発防止） -------
const m8Src = RAW.replace('  bindTabEvents();\n', '  // bindTabEvents(); ← 変異検証で外した\n');
ok(m8Src !== RAW, 'M8-0 変異が適用された（bind を外し、名前はコメントの中だけに残した）');
const m8 = analyze(m8Src);
const m8v = evaluate(m8, ALLOW);
const m8info = m8.unreachableStatic.find((x) => x.name === 'bindTabEvents');
ok(!!m8info, 'M8-1 bindTabEvents が到達不能として検出される（コメントを呼出辺に数えない＝#798 の罠1）');
ok(!!m8info && m8info.commentRefs > 0,
  `M8-2 その名前は確かにコメントの中に存在する: cmt=${m8info ? m8info.commentRefs : 0}`);
ok(m8v.some((v) => v.rule === 'R1' && v.subject === 'bindTabEvents'), 'M8-3 allowlist に無い違反として報告される');

// --- M-FP: 偽陽性が無いこと（生きた関数を 1 本足しても緑のまま） --------------
//   ①の修正で参照の数え方を絞ったので、「正しく結線された関数を死んだと言わない」
//   ことを明示的に確かめる。onclick 結線つきのトップレベル関数を 1 本足す。
const FP_NAME = '__reachProbeAliveFn';
const FP_ANCHOR_HTML = '<button type="button" class="btn-primary" onclick="printPairings()">';
const FP_ANCHOR_JS = '\nfunction startTournament(){';
const fpSrc = RAW
  .replace(FP_ANCHOR_HTML, `<button type="button" onclick="${FP_NAME}()">probe</button>` + FP_ANCHOR_HTML)
  .replace(FP_ANCHOR_JS, `\nfunction ${FP_NAME}(){ return 1; }` + FP_ANCHOR_JS);
ok(fpSrc !== RAW && fpSrc.indexOf(FP_NAME) > 0, 'FP-0 変異が適用された（onclick 結線つきの生きた関数を 1 本追加）');
const fp = analyze(fpSrc);
const fpv = evaluate(fp, ALLOW);
ok(fp.topLevelFunctionCount === A.topLevelFunctionCount + 1,
  `FP-1 追加した関数がトップレベル関数として検出される: ${A.topLevelFunctionCount} → ${fp.topLevelFunctionCount}`);
ok(fp.rootNames.indexOf(FP_NAME) >= 0, 'FP-2 インライン onclick からルートとして拾われる');
ok(!fp.unreachableStatic.some((x) => x.name === FP_NAME), 'FP-3 到達不能とは判定されない');
ok(fpv.length === 0, `FP-4 検査は PASS のまま（違反 ${fpv.length} 件・偽陽性なし）`);

// --- 変異が本体を汚していないこと ---------------------------------------------
ok(RAW === before, 'M9 変異検証は全てメモリ上のコピーに対して行われ、読み込んだ原文は不変');
ok(fs.readFileSync(target, 'utf8') === before, `M9b ${target} はディスク上でも 1 バイトも変わっていない`);

console.log('PHASE1-REACH-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
