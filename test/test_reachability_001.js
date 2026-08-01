#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（検査1=静的到達可能性 / 検査2=bind 先の実在）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（当初 35 関数・走査修正後 40 関数が到達不能）を常設の検査に落としたもの。
//   このファイル自身が「壊れたら落ちること」を変異検証（M1-M11）で実証する。
//
//   PHASE1-REACH-001c（PR #799 差し戻し対応）で追加した観点:
//     - 変異は「何かが落ちた」ではなく**違反の種別と対象名**まで照合する（中4）
//     - 文字列は 3 形（' / " / テンプレート）、コメントは 3 形（// / /* */ / <!-- -->）を pin（中1・中2）
//     - 連結セレクタは**該当する全接頭辞**を回す。MIN_SELECTOR_PREFIX は import する（中3）
//     - HTML 属性値・起動経路・等価リファクタの偽陽性を FP-* で pin（高1〜高5）
'use strict';

const fs = require('fs');
const path = require('path');
const { analyze, CHAR_CLASS, MIN_SELECTOR_PREFIX } = require('./lib/reachability.js');

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
  // R2: 結線先が実在しない / 起動経路が無く、実行時に到達不能なのに allowlist に無い
  for (const [name, info] of runtimeFound) {
    if (!runtimeAllow.has(name)) {
      violations.push({
        rule: 'R2',
        subject: name,
        message: `L${info.line} ${name}() は結線先の DOM が存在しない or 起動経路が無く実行時に到達不能なのに allowlist（runtime）に無い`,
      });
    }
  }
  // R3: 死んだ結線（生成されない id/class ／ 起動経路の無い要素）なのに allowlist に無い
  for (const [sel, info] of bindingFound) {
    const why = info.reason === 'no-live-activation'
      ? 'この要素を起動するコードが到達不能なものしかない'
      : 'この id/class をどこでも生成していない';
    if (!bindingAllow.has(sel)) {
      violations.push({
        rule: 'R3',
        subject: sel,
        message: `L${info.line} ${sel} に結線しているが、${why}（allowlist（bindings）に無い）`,
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
        message: `allowlist（bindings）の ${sel} は現在生成されている / 起動経路がある。allowlist から外すこと`,
      });
    }
  }
  return violations;
}

// =============================================================================
// 変異の照合ヘルパ（中4: violations.length > 0 では検査器が壊れていても緑になる）
//   「意図した違反だけが出ていること」を、規則の種別と対象名の集合で確かめる。
// =============================================================================
const sig = (v) => v.rule + ':' + v.subject;
const show = (vs) => (vs.length ? vs.map(sig).sort().join(' / ') : 'なし');

// vs が「期待した規則の、期待した対象だけ」で構成されているか。
//   want: { R1: [必ず含む名前...], ... }
//   allowedSubjects: 規則ごとに「出てもよい」対象名の集合（波及先の閉包など）
function checkViolations(vs, spec, label) {
  const rules = Object.keys(spec);
  const strayRule = vs.filter((v) => rules.indexOf(v.rule) < 0);
  ok(strayRule.length === 0,
    `${label}: 想定外の規則の違反が出ている（期待 ${rules.join('/')} ・実測 ${show(vs)}）`);
  for (const r of rules) {
    const got = vs.filter((v) => v.rule === r).map((v) => v.subject);
    const { must, allowed } = spec[r];
    for (const m of must) {
      ok(got.indexOf(m) >= 0, `${label}: ${r}:${m} が報告されていない（実測 ${show(vs)}）`);
    }
    const stray = got.filter((s) => allowed.indexOf(s) < 0);
    ok(stray.length === 0,
      `${label}: ${r} に想定外の対象が混ざっている: ${stray.join(', ')}（実測 ${show(vs)}）`);
  }
}

// name から静的呼び出しグラフで到達できる関数の集合（変異の波及先の上限）
function closureOf(a, name) {
  const g = a._internal.graph;
  const seen = new Set([name]);
  const stack = [name];
  while (stack.length) {
    const n = stack.pop();
    const cs = g.get(n);
    if (cs) for (const c of cs) if (!seen.has(c)) { seen.add(c); stack.push(c); }
  }
  return [...seen];
}

// 参照の内訳カウンタ（commentRefs / stringRefs / markupRefs）。
// 走査側が公開していない場合は 0 を返す＝assert が FAIL するだけで、落ちない。
const refCount = (a, kind, name) => {
  const m = a._internal && a._internal[kind];
  return (m && typeof m.get === 'function') ? (m.get(name) || 0) : 0;
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const allowCount = (allow) => (allow.static || []).length + (allow.runtime || []).length;

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
ok(A.rootNames.length >= 5, `S4 ルートを検出している（インライン on*= 属性 ＋ スクリプト直下）: 実測 ${A.rootNames.length}`);
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

// 罠(6) の回帰ガード（PHASE1-REACH-001c / 高1）: HTML の id / class / data-* に
// 関数名と同じトークンが出るだけではルートにしない。
//   save() は <span id="save-warning-indicator" class="save-warn-pill"> の save トークンで
//   初版ではルート認定されていた（JS 側の参照を全部つぶしても永久に「生きている」）。
const saveMarkupRefs = refCount(A, 'markupRefs', 'save');
ok(!!A._internal.byName && A._internal.byName.has('save'), 'S12 save() はトップレベル関数として存在する（この pin の前提）');
ok(saveMarkupRefs > 0, `S13 save という HTML マークアップ由来のトークンが実在する: markup=${saveMarkupRefs}`);
ok(A.rootNames.indexOf('save') < 0, 'S14 それでも save はルートにならない（HTML マークアップは参照ではない＝罠6）');
ok(!A.unreachableStatic.some((x) => x.name === 'save'), 'S15 かつ save は到達可能なまま（コード側の呼出で生きている＝偽陽性を作っていない）');

// 罠(7)（高3）: インラインイベントハンドラ属性は HTML でも JS 文字列でも参照になる。
ok(A.inlineHandlerCount >= 3, `S16 インライン on*= 属性の値を拾っている（HTML ＋ JS 文字列内）: 実測 ${A.inlineHandlerCount}`);

// 罠(8)（高2）: 起動経路が無い結線。L437 の温存マーカーとの突き合わせが検算になる。
//   「loadFile input は温存（loadData の受け皿）。openLoadModal/loadData/loadFromPaste は温存。」
ok(A.deadBindings.some((d) => d.selector === '#loadFile' && d.reason === 'no-live-activation'),
  'S17 #loadFile が「起動経路なし」の死んだ結線として検出される（罠8）');
ok(A.unreachableStatic.some((x) => x.name === 'openLoadModal'),
  'S18 L437 が名指しで温存と書いている openLoadModal は静的に到達不能');
ok(A.unreachableRuntimeOnly.some((x) => x.name === 'loadData'),
  'S19 同じく loadData は実行時に到達不能（結線はあるが起動経路が無い＝初版はここを素通りしていた）');
// L437 の 3 番目 loadFromPaste は「温存」と書かれているが、実際にはバックアップ modal
// （L13217）から生きている。コメントのほうが古い＝検算で分かるのが正しい姿。
ok(!A.unreachableStatic.some((x) => x.name === 'loadFromPaste')
  && !A.unreachableRuntimeOnly.some((x) => x.name === 'loadFromPaste'),
  'S20 loadFromPaste は L13217（バックアップ modal）から生きている＝L437 のコメントのほうが古い');

console.log(`  走査: ${elapsed}ms / トップレベル ${A.topLevelFunctionCount} 関数 / ルート ${A.rootNames.length} / インライン on*= ${A.inlineHandlerCount}`);
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
const LIMITS = ALLOW.limits || {};
console.log(`  baseline(#798): static=${b.static_unreachable} runtime=${b.runtime_unreachable} bindings=${b.dead_bindings} 関数総数=${b.top_level_functions}`);
console.log(`  現在        : static=${A.unreachableStatic.length} runtime=${A.unreachableRuntimeOnly.length} bindings=${A.deadBindings.length} 関数総数=${A.topLevelFunctionCount}`);
console.log(`  allowlist    : ${allowCount(ALLOW)} 件 / 上限 ${LIMITS.allowlist_max}（余裕 ${LIMITS.allowlist_max - allowCount(ALLOW)}）`);

// A5 の上限は baseline（＝過去の実測の記録）とは別に外部化する。
// baseline そのものを上限にすると余裕ゼロになり、意図的な温存が 1 件増えるだけで
// R1 と A5 が同時に赤になって「allowlist への追記だけでは緑にできない」状態になる。
ok(typeof LIMITS.allowlist_max === 'number' && LIMITS.allowlist_max > 0,
  'A5-0 allowlist の上限が limits.allowlist_max として外部化されている');
ok((LIMITS.reason || '').trim().length >= MIN_REASON,
  'A5-1 上限には理由が書かれている（引き上げがレビュー対象になる）');
ok(allowCount(ALLOW) <= LIMITS.allowlist_max,
  `A5-2 allowlist が上限（${LIMITS.allowlist_max} 件）を超えて肥大していない: 実測 ${allowCount(ALLOW)} 件`);
ok(LIMITS.allowlist_max > allowCount(ALLOW),
  `A5-3 上限に余裕がある（追記 1 件で詰まらない）: 余裕 ${LIMITS.allowlist_max - allowCount(ALLOW)} 件`);

// =============================================================================
// 4. 変異検証 — 「壊れたら本当に落ちるか」
//    すべてメモリ上のコピーに対して行う。shogi_v4.html は 1 バイトも書き換えない。
// =============================================================================
console.log('=== 変異検証（検査自体の検算） ===');

const before = RAW;
const BIND = '  bindTabEvents();\n';
const BIND_CLOSURE = closureOf(A, 'bindTabEvents');

// bind を外す系の変異は bindTabEvents とその配下だけを落とすはず。
const bindSpec = { R1: { must: ['bindTabEvents'], allowed: BIND_CLOSURE } };

// --- M1: 生きている関数の bind を外す（DOMContentLoaded から 1 行削る） -------
const m1Src = RAW.replace(BIND, '  /* PHASE1-REACH-001 変異検証: bind を外した */\n');
ok(m1Src !== RAW, 'M1-0 変異が適用された（DOMContentLoaded の bindTabEvents() 呼出を除去）');
const m1 = analyze(m1Src);
const m1v = evaluate(m1, ALLOW);
ok(m1.rootNames.indexOf('bindTabEvents') < 0, 'M1-1 bindTabEvents がルートから消える');
ok(m1.unreachableStatic.some((x) => x.name === 'bindTabEvents'), 'M1-2 bindTabEvents が到達不能として検出される');
checkViolations(m1v, bindSpec, 'M1-3');

// --- M2: インライン onclick を外す -------------------------------------------
const m2Src = RAW.replace('onclick="printResults()"', 'onclick=""');
ok(m2Src !== RAW, 'M2-0 変異が適用された（インライン onclick="printResults()" を除去）');
const m2 = analyze(m2Src);
const m2v = evaluate(m2, ALLOW);
ok(m2.unreachableStatic.some((x) => x.name === 'printResults'), 'M2-1 printResults が到達不能として検出される');
checkViolations(m2v, { R1: { must: ['printResults'], allowed: closureOf(A, 'printResults') } }, 'M2-2');

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
  // 死んだ結線 1 件と、その結線の先で実行時到達不能になった関数だけが出るはず。
  checkViolations(m3v, {
    R3: { must: ['#' + cand.id], allowed: ['#' + cand.id] },
    R2: { must: [], allowed: [...A._internal.byName.keys()] },
  }, 'M3-3');
}

// --- M4: allowlist から 1 件外す（allowlist が効いていることの確認） ---------
const m4Allow = clone(ALLOW);
const dropped = m4Allow.static.shift();
ok(!!dropped, 'M4-0 allowlist（static）から 1 件外した');
const m4v = evaluate(A, m4Allow);
checkViolations(m4v, { R1: { must: [dropped.name], allowed: [dropped.name] } }, 'M4-1');

// --- M5: allowlist の理由を空にする（骨抜き防止） -----------------------------
const m5Allow = clone(ALLOW);
m5Allow.static[0].reason = '';
const m5v = evaluate(A, m5Allow);
checkViolations(m5v, { R4: { must: [m5Allow.static[0].name], allowed: [m5Allow.static[0].name] } }, 'M5-1');

// --- M6: 死んだ関数の名前を文字列リテラルの中に置く（罠(4) の再発防止） -------
//   中1: 単引用符だけでなく、二重引用符・テンプレートリテラルの 3 形すべてを pin する。
//   1 形だけだと、他の 2 形の除外を外しても検査が緑のまま通ってしまう。
const M6_FORMS = [
  { tag: 'a', label: '単引用符', code: "  var __m6a='REACH-M6-bindTabEvents-'+String(1);\n" },
  { tag: 'b', label: '二重引用符', code: '  var __m6b="REACH-M6-bindTabEvents-"+String(1);\n' },
  { tag: 'c', label: 'テンプレートリテラル', code: '  var __m6c=`REACH-M6-bindTabEvents-${String(1)}`;\n' },
];
for (const f of M6_FORMS) {
  const src = RAW.replace(BIND, f.code);
  ok(src !== RAW, `M6${f.tag}-0 変異が適用された（bind を外し、名前は${f.label}の文字列の中だけに残した）`);
  const m = analyze(src);
  const v = evaluate(m, ALLOW);
  const info = m.unreachableStatic.find((x) => x.name === 'bindTabEvents');
  ok(m.rootNames.indexOf('bindTabEvents') < 0, `M6${f.tag}-1 ${f.label}の文字列内の言及は root にならない`);
  ok(!!info, `M6${f.tag}-2 bindTabEvents が到達不能として検出される（${f.label}を呼出辺に数えない）`);
  ok(!!info && info.stringRefs > 0,
    `M6${f.tag}-3 その名前は確かに${f.label}の文字列の中に存在する: str=${info ? info.stringRefs : 0}`);
  checkViolations(v, bindSpec, `M6${f.tag}-4`);
}

// --- M7: 連結 ID の生成側を別名に変える（罠(5) の再発防止） --------------------
//   中3: 「アルファベット順で最初の 1 件」ではなく**該当する全接頭辞**を回す。
//   MIN_SELECTOR_PREFIX はライブラリから import する（ハードコードすると、
//   下限を引き上げる改変が素通りする）。実在の最短接頭辞は 'wb_'（3 文字）。
function listConcatPrefixes(src, cls) {
  const prefixes = new Set();
  for (const m of src.matchAll(/getElementById\(\s*'([^']*)'\s*\+/g)) prefixes.add(m[1]);
  for (const m of src.matchAll(/getElementById\(\s*"([^"]*)"\s*\+/g)) prefixes.add(m[1]);
  const out = [];
  for (const p of [...prefixes].sort()) {
    if (p.length < MIN_SELECTOR_PREFIX) continue;
    const gen = 'id="' + p;
    const genCount = src.split(gen).length - 1;
    if (genCount < 1) continue;
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let produced = 0;
    for (const m of src.matchAll(re)) {
      const q = m.index;
      if (cls[q] === CHAR_CLASS.X) continue;                                    // コメント / CSS
      if (/getElementById\(\s*['"]$/.test(src.slice(Math.max(0, q - 24), q))) continue; // セレクタ引数
      produced++;
    }
    // 生成が id="接頭辞… の形だけ＝すべて改名すれば produced が 0 になる接頭辞
    if (produced === genCount) out.push({ prefix: p, gen, genCount });
  }
  return out;
}
const concats = listConcatPrefixes(RAW, A._internal.cls);
ok(concats.length >= 5, `M7-0 変異対象の連結 ID 接頭辞を列挙できた: ${concats.length} 件`);
const shortest = concats.reduce((a, c) => Math.min(a, c.prefix.length), 99);
ok(shortest <= 3, `M7-0b 短い接頭辞まで対象に入っている（最短 ${shortest} 文字 / MIN_SELECTOR_PREFIX=${MIN_SELECTOR_PREFIX}）`);
for (const c of concats) {
  // 接頭辞そのものが残らないよう、末尾 1 文字の手前へ差し込む
  //   'helpBtnFirstRound_' → 'helpBtnFirstRoundPhase1ReachMutated_'
  const renamed = c.prefix.slice(0, -1) + 'Phase1ReachMutated' + c.prefix.slice(-1);
  const src = RAW.split(c.gen).join('id="' + renamed);
  const sel = '#' + c.prefix + '*';
  ok(src !== RAW && renamed.indexOf(c.prefix) < 0,
    `M7[${c.prefix}]-1 変異が適用された（生成側 id="${c.prefix}…" ${c.genCount} 箇所を改名）`);
  const m = analyze(src);
  const v = evaluate(m, ALLOW);
  ok(m.deadBindings.some((d) => d.selector === sel), `M7[${c.prefix}]-2 ${sel} が死んだ結線として検出される`);
  ok(v.some((x) => x.rule === 'R3' && x.subject === sel), `M7[${c.prefix}]-3 allowlist に無い違反として報告される`);
  ok(A.deadBindings.every((d) => d.selector !== sel), `M7[${c.prefix}]-4 変異前は ${sel} が死んでいない＝この変異だけが原因`);
}

// --- M8: 死んだ関数の名前をコメントの中に置く（#798 の罠1 の再発防止） -------
//   中2: 行コメントだけでなく、ブロックコメント・HTML コメントの 3 形すべてを pin する。
const M8_FORMS = [
  { tag: 'a', label: '行コメント', mutate: (s) => s.replace(BIND, '  // bindTabEvents(); ← 変異検証で外した\n') },
  { tag: 'b', label: 'ブロックコメント', mutate: (s) => s.replace(BIND, '  /* bindTabEvents(); ← 変異検証で外した */\n') },
  {
    tag: 'c',
    label: 'HTML コメント',
    // 最後の </body> の直前へ入れる。最初の </body> は JS 文字列の中（得点表
    // ポップアップの組み立て）にあり、そこへ入れると HTML コメントにならない。
    mutate: (s) => {
      const t = s.replace(BIND, '  /* 変異検証 */\n');
      const k = t.lastIndexOf('</body>');
      return t.slice(0, k) + '<!-- 変異検証: bindTabEvents() はここで言及されるだけ -->\n' + t.slice(k);
    },
  },
];
for (const f of M8_FORMS) {
  const src = f.mutate(RAW);
  ok(src !== RAW, `M8${f.tag}-0 変異が適用された（bind を外し、名前は${f.label}の中だけに残した）`);
  const m = analyze(src);
  const v = evaluate(m, ALLOW);
  const info = m.unreachableStatic.find((x) => x.name === 'bindTabEvents');
  ok(!!info, `M8${f.tag}-1 bindTabEvents が到達不能として検出される（${f.label}を呼出辺に数えない）`);
  ok(!!info && info.commentRefs > 0,
    `M8${f.tag}-2 その名前は確かに${f.label}の中に存在する: cmt=${info ? info.commentRefs : 0}`);
  checkViolations(v, bindSpec, `M8${f.tag}-3`);
}

// --- M10: 死んだ関数の名前を HTML 属性値に置く（罠(6) / 高1 の再発防止） -------
//   `<span data-x="startTournament-legacy">` を 1 つ足すだけで死にコードが検出から
//   消える、というのが差し戻しの最重要指摘だった（cowork 実測: 静的到達不能 30 → 26）。
//   id / class / data-* の 3 形すべてを pin する。
const M10_ANCHOR = '<div style="display:flex;gap:8px;align-items:center">';
const M10_FORMS = [
  { tag: 'a', label: 'data-*', attr: 'data-x="startTournament-legacy"' },
  { tag: 'b', label: 'class', attr: 'class="startTournament-pill collectStartCandidates-x"' },
  { tag: 'c', label: 'id', attr: 'id="startTournament-legacy-marker"' },
];
ok(RAW.indexOf(M10_ANCHOR) > 0, 'M10-0 変異のアンカー（HTML 要素）が実在する');
for (const f of M10_FORMS) {
  const src = RAW.replace(M10_ANCHOR, `<span ${f.attr}>x</span>` + M10_ANCHOR);
  ok(src !== RAW, `M10${f.tag}-0 変異が適用された（死んだ関数名を HTML の ${f.label} 属性値に置いた）`);
  const m = analyze(src);
  const v = evaluate(m, ALLOW);
  ok(refCount(m, 'markupRefs', 'startTournament') > refCount(A, 'markupRefs', 'startTournament'),
    `M10${f.tag}-1 その名前は確かに HTML マークアップの中に増えている`);
  ok(m.rootNames.indexOf('startTournament') < 0, `M10${f.tag}-2 HTML の ${f.label} 属性値は root にならない`);
  ok(m.unreachableStatic.some((x) => x.name === 'startTournament'),
    `M10${f.tag}-3 startTournament は到達不能のまま（数えていたら検出が消えてしまう）`);
  ok(m.unreachableStatic.length === A.unreachableStatic.length,
    `M10${f.tag}-4 静的到達不能の件数が変わらない: ${A.unreachableStatic.length} → ${m.unreachableStatic.length}`);
  checkViolations(v, {}, `M10${f.tag}-5`);
}

// --- M11: 起動経路を復活させる（罠(8) / 高2 の pin） --------------------------
//   #loadFile に <label for> を足すと利用者が押せるようになる＝結線は死んでいない。
//   このとき allowlist の #loadFile / loadData が掃除漏れ（R5）として報告されること。
//   「起動経路の有無を本当に見ているか」を、逆方向から確かめる。
const m11Src = RAW.replace('<input type="file" id="loadFile"', '<label for="loadFile">読み込み</label><input type="file" id="loadFile"');
ok(m11Src !== RAW, 'M11-0 変異が適用された（#loadFile に <label for> を足して押せるようにした）');
const m11 = analyze(m11Src);
const m11v = evaluate(m11, ALLOW);
ok(!m11.deadBindings.some((d) => d.selector === '#loadFile'), 'M11-1 #loadFile が死んだ結線ではなくなる');
ok(!m11.unreachableRuntimeOnly.some((x) => x.name === 'loadData'), 'M11-2 loadData が実行時到達可能に戻る');
checkViolations(m11v, { R5: { must: ['#loadFile', 'loadData'], allowed: ['#loadFile', 'loadData'] } }, 'M11-3');

// =============================================================================
// 5. 偽陽性の検証 — 「生きているものを死んだと言わない」
//    参照の数え方を絞った以上、こちらを同じ密度で pin しないと片肺になる。
// =============================================================================
console.log('=== 偽陽性の検証（等価な書き換えで落ちないこと） ===');

// --- FP-1: インライン onclick で結線した生きた関数を 1 本足す ----------------
const FP_NAME = '__reachProbeAliveFn';
const FP_ANCHOR_HTML = '<button type="button" class="btn-primary" onclick="printPairings()">';
const FP_ANCHOR_JS = '\nfunction startTournament(){';
const fpSrc = RAW
  .replace(FP_ANCHOR_HTML, `<button type="button" onclick="${FP_NAME}()">probe</button>` + FP_ANCHOR_HTML)
  .replace(FP_ANCHOR_JS, `\nfunction ${FP_NAME}(){ return 1; }` + FP_ANCHOR_JS);
ok(fpSrc !== RAW && fpSrc.indexOf(FP_NAME) > 0, 'FP-1-0 変異が適用された（onclick 結線つきの生きた関数を 1 本追加）');
const fp = analyze(fpSrc);
ok(fp.topLevelFunctionCount === A.topLevelFunctionCount + 1,
  `FP-1-1 追加した関数がトップレベル関数として検出される: ${A.topLevelFunctionCount} → ${fp.topLevelFunctionCount}`);
ok(fp.rootNames.indexOf(FP_NAME) >= 0, 'FP-1-2 インライン onclick からルートとして拾われる');
ok(!fp.unreachableStatic.some((x) => x.name === FP_NAME), 'FP-1-3 到達不能とは判定されない');
checkViolations(evaluate(fp, ALLOW), {}, 'FP-1-4');

// --- FP-2: 文字列で組み立てた HTML の onclick 結線（高3） ---------------------
//   insertAdjacentHTML / テンプレートリテラル / document.write の 3 形。
//   罠(4) で文字列を丸ごと参照から外したのが行き過ぎだった箇所。
//   これを落とすと「動的リストにボタンを足す最も一般的な書き方」で FAIL する。
const FP2_FORMS = [
  {
    tag: 'a',
    label: 'insertAdjacentHTML（二重引用符）',
    name: '__reachProbeIahDq',
    wire: (n) => `document.body.insertAdjacentHTML('beforeend','<button onclick="${n}()">go</button>');`,
  },
  {
    tag: 'b',
    label: 'insertAdjacentHTML（単引用符）',
    name: '__reachProbeIahSq',
    wire: (n) => `document.body.insertAdjacentHTML("beforeend","<button onclick='${n}()'>go</button>");`,
  },
  {
    tag: 'c',
    label: 'テンプレートリテラル',
    name: '__reachProbeTmpl',
    wire: (n) => 'document.body.innerHTML += `<button onclick="' + n + '()">go</button>`;',
  },
  {
    tag: 'd',
    label: 'onchange 属性',
    name: '__reachProbeOnChange',
    wire: (n) => `document.body.insertAdjacentHTML('beforeend','<select onchange="${n}()"></select>');`,
  },
];
for (const f of FP2_FORMS) {
  // 生きたルート（インライン onclick）から呼ばれる関数の中で結線する
  const src = RAW
    .replace(FP_ANCHOR_JS, `\nfunction ${f.name}(){ return 1; }\nfunction ${f.name}Wire(){ ${f.wire(f.name)} }` + FP_ANCHOR_JS)
    .replace('onclick="printResults()"', `onclick="printResults();${f.name}Wire()"`);
  ok(src !== RAW, `FP-2${f.tag}-0 変異が適用された（${f.label}で onclick 結線した生きた関数を追加）`);
  const m = analyze(src);
  ok(!m.unreachableStatic.some((x) => x.name === f.name),
    `FP-2${f.tag}-1 ${f.label}で結線した関数を到達不能と言わない`);
  ok(!m.unreachableStatic.some((x) => x.name === f.name + 'Wire'),
    `FP-2${f.tag}-2 その結線を行う関数も到達可能`);
  checkViolations(evaluate(m, ALLOW), {}, `FP-2${f.tag}-3`);
}

// --- FP-3: document.getElementById → 受け手つき querySelector の等価置換（高4）
const FP3_FROM = "var bulkPushBtn=document.getElementById('masterBulkPushBtn');";
const FP3_TO = "var bulkPushBtn=(document.body||document).querySelector('#masterBulkPushBtn');";
ok(RAW.indexOf(FP3_FROM) > 0, 'FP-3-0 置換対象が実在する');
const fp3 = analyze(RAW.replace(FP3_FROM, FP3_TO));
ok(fp3.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
  `FP-3-1 実行時到達不能の件数が変わらない: ${A.unreachableRuntimeOnly.length} → ${fp3.unreachableRuntimeOnly.length}（初版は死んだ領域が次の結線ブロックを飲み込み pushAllMembersToCloud が転落した）`);
ok(fp3.deadBindings.length === A.deadBindings.length,
  `FP-3-2 死んだ結線の件数も変わらない: ${A.deadBindings.length} → ${fp3.deadBindings.length}`);
checkViolations(evaluate(fp3, ALLOW), {}, 'FP-3-3');

// --- FP-4: セレクタ・ヘルパ $id() への抽出（高4・罠(10)） ---------------------
function extractSelectorHelper(src) {
  const s = src.indexOf('function bindMasterTabEvents(){');
  if (s < 0) return null;
  let depth = 0;
  let e = -1;
  for (let p = src.indexOf('{', s); p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') { depth--; if (depth === 0) { e = p; break; } }
  }
  if (e < 0) return null;
  const body = src.slice(s, e);
  const n = (body.match(/document\.getElementById\(/g) || []).length;
  if (!n) return null;
  const helper = 'function $id(id){return document.getElementById(id);}\n';
  return { src: src.slice(0, s) + helper + body.replace(/document\.getElementById\(/g, '$id(') + src.slice(e), n };
}
const fp4 = extractSelectorHelper(RAW);
ok(!!fp4 && fp4.n >= 5, `FP-4-0 bindMasterTabEvents の document.getElementById() を $id() へ抽出した: ${fp4 ? fp4.n : 0} 箇所`);
if (fp4) {
  const m = analyze(fp4.src);
  ok((m.selectorAliases || []).indexOf('$id') >= 0, 'FP-4-1 $id がセレクタの別名として認識される');
  ok(m.deadBindings.length === A.deadBindings.length,
    `FP-4-2 死んだ結線の検出が消えない: ${A.deadBindings.length} → ${m.deadBindings.length}（別名を知らないと R5 の掃除漏れで落ちる）`);
  ok(m.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
    `FP-4-3 実行時到達不能の件数も変わらない: ${A.unreachableRuntimeOnly.length} → ${m.unreachableRuntimeOnly.length}（別名を知らないと死んだ結線の検出そのものが消え、掃除漏れ扱いになる）`);
  checkViolations(evaluate(m, ALLOW), {}, 'FP-4-4');
}

// --- FP-5: DOMContentLoaded 内の防御的ルックアップ（高5） --------------------
//   存在しない id への if(el) ガードを 1 つ足すと、初版は死んだ領域がファイル末尾まで
//   伸びて 77 件（うち R0 は allowlist にも逃がせない）に爆発した。
//   正しい挙動＝「その id の結線が 1 件死んだ」だけ。
const fp5Src = RAW.replace('  bindHeaderEvents();\n',
  '  var __ff=document.getElementById(\'__reachFeatureFlagPanel\');\n  if(__ff){__ff.style.display=\'none\';}\n  bindHeaderEvents();\n');
ok(fp5Src !== RAW, 'FP-5-0 変異が適用された（DOMContentLoaded 内に存在しない id への防御的ルックアップを 1 つ追加）');
const fp5 = analyze(fp5Src);
const fp5v = evaluate(fp5, ALLOW);
ok(fp5.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
  `FP-5-1 実行時到達不能が増えない: ${A.unreachableRuntimeOnly.length} → ${fp5.unreachableRuntimeOnly.length}（初版は死んだ領域がファイル末尾まで伸び、起動シーケンスごと死亡扱いになった）`);
ok(fp5.unreachableStatic.length === A.unreachableStatic.length,
  `FP-5-2 静的到達不能も増えない: ${A.unreachableStatic.length} → ${fp5.unreachableStatic.length}`);
checkViolations(fp5v, {
  R3: { must: ['#__reachFeatureFlagPanel'], allowed: ['#__reachFeatureFlagPanel'] },
}, 'FP-5-3');
ok(fp5v.length === 1, `FP-5-4 違反は「存在しない id への結線」1 件だけ: 実測 ${fp5v.length} 件（${show(fp5v)}）`);

// --- FP-6: 意図的な温存を 1 件足したとき、allowlist 追記だけで緑にできる（高5・⑤）
const fp6Allow = clone(ALLOW);
for (const name of m1v.filter((v) => v.rule === 'R1').map((v) => v.subject)) {
  fp6Allow.static.push({
    name,
    category: 'temporarily-preserved',
    reason: 'FP-6 の検証用エントリ。意図的な温存が 1 件増えたときに allowlist への追記だけで緑にできることを確かめる（上限に余裕があること）。',
  });
}
const fp6v = evaluate(m1, fp6Allow);
ok(fp6v.length === 0, `FP-6-1 allowlist への追記だけで緑にできる: 残り違反 ${fp6v.length} 件（${show(fp6v)}）`);
ok(allowCount(fp6Allow) <= LIMITS.allowlist_max,
  `FP-6-2 追記後も上限内: ${allowCount(fp6Allow)} 件 / 上限 ${LIMITS.allowlist_max}（baseline を書き換えずに済む）`);

// --- 変異が本体を汚していないこと ---------------------------------------------
ok(RAW === before, 'M9 変異検証は全てメモリ上のコピーに対して行われ、読み込んだ原文は不変');
ok(fs.readFileSync(target, 'utf8') === before, `M9b ${target} はディスク上でも 1 バイトも変わっていない`);

console.log('PHASE1-REACH-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
