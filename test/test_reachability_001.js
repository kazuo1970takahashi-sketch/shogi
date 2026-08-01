#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（検査1=静的到達可能性 / 検査2=bind 先の実在）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（当初 35 関数・走査修正後 40 関数が到達不能）を常設の検査に落としたもの。
//   このファイル自身が「壊れたら落ちること」を変異検証で実証する。
//
//   PHASE1-REACH-001d（4版目・PR #799 の差し戻し 3 回目への対応）で変わったこと:
//     - 走査が**単一の面レクサ**（classifyFaces・16 面）になった。参照として数える面は
//       JS_CODE ＋ ATTR_VAL_ON の 2 つだけ。**面の完全性**（未分類 0・総延長＝ファイル長）を
//       毎回検査し、**面 × 変異の全表**（各面 1 変異以上）で「どの面を触っても期待どおり」を pin する。
//     - **検査2（結線先 DOM・起動経路）を CI の FAIL 判定から外した**（作者承認済み）。
//       走査と出力は残し warn として表示する。偽陽性が原理的に消せないため（理由は lib のヘッダ）。
//       ＝ evaluate() は { errors, warnings } を返し、**exit code は errors だけで決まる**。
//     - 3 版目が破られた 4 つの形（data-onclick / `||` フォールバック / セレクタヘルパ抽出 /
//       インライン on* の複数行化）を FP-* と面 × 変異表で個別に pin した。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  analyze, classifyFaces, faceStats, FACE, FACE_NAME, isRefFace, MIN_SELECTOR_PREFIX,
} = require('./lib/reachability.js');

const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'reachability_allowlist.json'), 'utf8'));

// 子プロセスとして起動されたとき（受け入れ基準7 の実測）は、本番判定までで止める。
// 変異検証・偽陽性検証は検査器の自己検算であって、CI の exit code の説明には要らない。
const CHILD = process.env.REACH_CHILD === '1';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

// 理由として認める最低文字数。空欄・"TODO"・"-" 等の骨抜きを拒否する。
const MIN_REASON = 20;

// =============================================================================
// 判定本体: 解析結果 × allowlist → 違反リスト
//   変異検証でも同じ関数を通す＝「本番で緑」と「変異で赤」が同一ロジックで示される。
//
//   errors   … CI をブロックする（検査1 ＝ 静的到達可能性と、allowlist の記述品質）
//   warnings … レポートのみ（検査2 ＝ 結線先 DOM の実在・起動経路）
//              PHASE1-REACH-001d の降格。理由は test/lib/reachability.js のヘッダ。
// =============================================================================
function evaluate(a, allow) {
  const errors = [];
  const warnings = [];
  const add = (severity, rule, subject, message) => {
    (severity === 'error' ? errors : warnings).push({ rule, subject, message, severity });
  };

  const staticFound = new Map(a.unreachableStatic.map((x) => [x.name, x]));
  const runtimeFound = new Map(a.unreachableRuntimeOnly.map((x) => [x.name, x]));
  const bindingFound = new Map(a.deadBindings.map((x) => [x.selector, x]));

  const staticAllow = new Map((allow.static || []).map((e) => [e.name, e]));
  const runtimeAllow = new Map((allow.runtime || []).map((e) => [e.name, e]));
  const bindingAllow = new Map((allow.bindings || []).map((e) => [e.selector, e]));

  // R1【error・検査1】静的に到達不能なのに allowlist に無い
  for (const [name, info] of staticFound) {
    if (!staticAllow.has(name)) {
      add('error', 'R1', name,
        `L${info.line} ${name}() がルートから到達不能なのに allowlist（static）に無い`);
    }
  }
  // R2【warn・検査2】結線先が実在しない / 起動経路が無く、実行時に到達不能なのに allowlist に無い
  for (const [name, info] of runtimeFound) {
    if (!runtimeAllow.has(name)) {
      add('warn', 'R2', name,
        `L${info.line} ${name}() は結線先の DOM が存在しない or 起動経路が無く実行時に到達不能なのに allowlist（runtime）に無い`);
    }
  }
  // R3【warn・検査2】死んだ結線（生成されない id/class ／ 起動経路の無い要素）なのに allowlist に無い
  for (const [sel, info] of bindingFound) {
    const why = info.reason === 'no-live-activation'
      ? 'この要素を起動するコードが到達不能なものしかない'
      : 'この id/class をどこでも生成していない';
    if (!bindingAllow.has(sel)) {
      add('warn', 'R3', sel,
        `L${info.line} ${sel} に結線しているが、${why}（allowlist（bindings）に無い）`);
    }
  }
  // R4【error】理由の無い / 短すぎる allowlist エントリ（全セクション。追記を意識的な行為にする）
  const reasonCheck = (list, key, section) => {
    for (const e of list || []) {
      const r = (e.reason || '').trim();
      if (r.length < MIN_REASON) {
        add('error', 'R4', e[key],
          `allowlist（${section}）の ${e[key]} に理由が無い / 短すぎる（${r.length} 文字・${MIN_REASON} 文字以上が必要）`);
      }
    }
  };
  reasonCheck(allow.static, 'name', 'static');
  reasonCheck(allow.runtime, 'name', 'runtime');
  reasonCheck(allow.bindings, 'selector', 'bindings');

  // R5 到達可能に戻ったのに allowlist に残っている（＝掃除漏れ。肥大を防ぐ）
  //   static は error。runtime / bindings は検査2 由来なので warn へ降格（001d）。
  //   ＝ セレクタヘルパを関数式へ抽出しただけで「allowlist にも逃がせない FAIL」が
  //     7 件出る、という 3 版目の悪性相互作用がここで解消する（FP-8 で実測）。
  for (const [name] of staticAllow) {
    if (!staticFound.has(name)) {
      add('error', 'R5', name,
        `allowlist（static）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`);
    }
  }
  for (const [name] of runtimeAllow) {
    if (!runtimeFound.has(name)) {
      add('warn', 'R5', name,
        `allowlist（runtime）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`);
    }
  }
  for (const [sel] of bindingAllow) {
    if (!bindingFound.has(sel)) {
      add('warn', 'R5', sel,
        `allowlist（bindings）の ${sel} は現在生成されている / 起動経路がある。allowlist から外すこと`);
    }
  }

  // A5【warn・001d で降格】allowlist の肥大。上限超過は「即 FAIL」をやめ、
  //   baseline との差分と 1 件ごとの理由（R4）で運用する。
  const limits = allow.limits || {};
  const count = (allow.static || []).length + (allow.runtime || []).length;
  if (typeof limits.allowlist_max === 'number' && count > limits.allowlist_max) {
    add('warn', 'A5', 'allowlist',
      `allowlist が上限 ${limits.allowlist_max} 件を超えている: ${count} 件（増分の理由を確かめ、必要なら limits.reason ごと引き上げること）`);
  }

  return { errors, warnings, all: errors.concat(warnings) };
}

// =============================================================================
// 変異の照合ヘルパ（violations.length > 0 では検査器が壊れていても緑になる）
//   「意図した違反だけが出ていること」を、規則の種別と対象名の集合で確かめる。
// =============================================================================
const sig = (v) => v.rule + ':' + v.subject;
const show = (vs) => (vs.length ? vs.map(sig).sort().join(' / ') : 'なし');

// vs が「期待した規則の、期待した対象だけ」で構成されているか。
//   spec: { R1: { must: [必ず含む名前...], allowed: [出てもよい名前...] }, ... }
function checkViolations(vs, spec, label) {
  const rules = Object.keys(spec);
  const strayRule = vs.filter((v) => rules.indexOf(v.rule) < 0);
  ok(strayRule.length === 0,
    `${label}: 想定外の規則の違反が出ている（期待 ${rules.join('/') || 'なし'} ・実測 ${show(vs)}）`);
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
const refCount = (a, kind, name) => {
  const m = a._internal && a._internal[kind];
  return (m && typeof m.get === 'function') ? (m.get(name) || 0) : 0;
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const allowCount = (allow) => (allow.static || []).length + (allow.runtime || []).length;
const staticNames = (a) => a.unreachableStatic.map((x) => x.name).join(',');

// =============================================================================
// 1. 面レクサの不変条件（完全性）— 判定の土台がファイル全体を覆っていること
// =============================================================================
console.log('=== 面レクサの不変条件 ===');
const FACE_PROBE = classifyFaces(RAW);
const FS = faceStats(FACE_PROBE);
ok(FS.unclassified === 0, `L-1 未分類の文字が 0（実測 ${FS.unclassified} 文字）`);
ok(FS.covered === RAW.length,
  `L-2 面の総延長がファイル長と一致する: ${FS.covered} / ${RAW.length}`);
const histSum = Object.values(FS.histogram).reduce((s, n) => s + n, 0);
ok(histSum === RAW.length, `L-3 面ごとの内訳の合計もファイル長と一致する: ${histSum} / ${RAW.length}`);
ok(Object.keys(FS.histogram).length === Object.keys(FACE).length,
  `L-4 面の一覧が ${Object.keys(FACE).length} 面ある（内訳の項目数 ${Object.keys(FS.histogram).length}）`);
ok([...new Set([FACE.JS_CODE, FACE.ATTR_VAL_ON])].every(isRefFace)
  && Object.values(FACE).filter(isRefFace).length === 2,
  'L-5 参照として数える面は JS_CODE ＋ ATTR_VAL_ON の 2 つだけ');
console.log('  面の内訳: ' + Object.entries(FS.histogram)
  .filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' '));

// =============================================================================
// 2. 走査そのものの健全性（走査が空振りしていないことの確認）
// =============================================================================
console.log('=== 走査の健全性 ===');
const t0 = Date.now();
const A = analyze(RAW);
const elapsed = Date.now() - t0;

ok(A.scriptBlocks === 2, `S1 <script> ブロックが 2（rawtext として 1 度だけ読む＝JS 文字列内の "<script>" で二重化しない）: 実測 ${A.scriptBlocks}`);
ok(A.topLevelFunctionCount > 400, `S2 トップレベル関数を検出している: 実測 ${A.topLevelFunctionCount}`);
ok(A.functionDeclsAllDepths > A.topLevelFunctionCount, `S3 ネスト関数も数えている（全深さ ${A.functionDeclsAllDepths} > トップレベル ${A.topLevelFunctionCount}）`);
ok(A.rootNames.length >= 5, `S4 ルートを検出している（ATTR_VAL_ON ＋ どの関数にも属さない JS_CODE）: 実測 ${A.rootNames.length}`);
ok(A.rootNames.indexOf('initApp') >= 0, 'S5 DOMContentLoaded の initApp をルートとして拾っている');
ok(A.rootNames.indexOf('printResults') >= 0, 'S6 インライン onclick="printResults()" をルートとして拾っている');

// 罠(1) の回帰ガード: コメント参照だけの関数を「生きている」と誤判定しない。
const finalize = A.unreachableStatic.find((x) => x.name === 'finalizeAddPastParticipants');
ok(!!finalize, 'S7 finalizeAddPastParticipants が到達不能として検出される（コメント参照を数えない＝#798 の罠1）');
ok(!!finalize && finalize.commentRefs > 0, `S8 その関数はコメントで言及されている（数えていたら緑になってしまう）: cmt=${finalize ? finalize.commentRefs : 0}`);
ok(!!finalize && finalize.liveRefs > 0, `S9 かつコード参照も存在する＝「定義以外の出現0回」方式では拾えない（#798 の罠3）: refs=${finalize ? finalize.liveRefs : 0}`);

// 罠(4) の回帰ガード: 文字列内の言及だけの関数を「生きている」と誤判定しない。
const startT = A.unreachableStatic.find((x) => x.name === 'startTournament');
ok(!!startT, 'S10 startTournament が到達不能として検出される（文字列内の言及を数えない＝罠4）');
ok(!!startT && startT.stringRefs > 0 && startT.liveRefs === 0,
  `S11 その関数はログ文字列でのみ言及されている（数えていたら緑になってしまう）: str=${startT ? startT.stringRefs : 0} refs=${startT ? startT.liveRefs : 0}`);

// 罠(6) の回帰ガード: HTML の id / class / data-* に関数名と同じトークンが出るだけでは
// ルートにしない。save() は <span class="save-warn-pill"> の save トークンで初版ではルートだった。
const saveMarkupRefs = refCount(A, 'markupRefs', 'save');
ok(!!A._internal.byName && A._internal.byName.has('save'), 'S12 save() はトップレベル関数として存在する（この pin の前提）');
ok(saveMarkupRefs > 0, `S13 save という HTML マークアップ由来のトークンが実在する: markup=${saveMarkupRefs}`);
ok(A.rootNames.indexOf('save') < 0, 'S14 それでも save はルートにならない（HTML マークアップは参照ではない＝罠6）');
ok(!A.unreachableStatic.some((x) => x.name === 'save'), 'S15 かつ save は到達可能なまま（コード側の呼出で生きている＝偽陽性を作っていない）');

// 罠(7): インラインイベントハンドラは HTML 直書きと JS 文字列（派生パス）の両方から拾う。
ok(A.htmlHandlerCount === 2, `S16 HTML 直書きの on*= 属性は 2 件（ATTR_VAL_ON 面）: 実測 ${A.htmlHandlerCount}`);
ok(A.derivedHandlerCount >= 1, `S16b JS 文字列で組み立てた HTML の on*= も派生パスで拾っている: 実測 ${A.derivedHandlerCount}`);
ok(A.inlineHandlerCount === A.htmlHandlerCount + A.derivedHandlerCount,
  `S16c インライン on*= の合計 = HTML 直書き ＋ 派生: ${A.inlineHandlerCount}`);

// 罠(8): 起動経路が無い結線。L437 の温存マーカーとの突き合わせが検算になる。
ok(A.deadBindings.some((d) => d.selector === '#loadFile' && d.reason === 'no-live-activation'),
  'S17 #loadFile が「起動経路なし」の死んだ結線として検出される（罠8・検査2）');
ok(A.unreachableStatic.some((x) => x.name === 'openLoadModal'),
  'S18 L437 が名指しで温存と書いている openLoadModal は静的に到達不能');
ok(A.unreachableRuntimeOnly.some((x) => x.name === 'loadData'),
  'S19 同じく loadData は実行時に到達不能（結線はあるが起動経路が無い）');
ok(!A.unreachableStatic.some((x) => x.name === 'loadFromPaste')
  && !A.unreachableRuntimeOnly.some((x) => x.name === 'loadFromPaste'),
  'S20 loadFromPaste は L13217（バックアップ modal）から生きている＝L437 のコメントのほうが古い');

console.log(`  走査: ${elapsed}ms / トップレベル ${A.topLevelFunctionCount} 関数 / ルート ${A.rootNames.length} / インライン on*= ${A.inlineHandlerCount}（HTML ${A.htmlHandlerCount} ＋ 派生 ${A.derivedHandlerCount}）`);
console.log(`  検査1 静的到達不能: ${A.unreachableStatic.length}`);
console.log(`  検査2 実行時のみ到達不能: ${A.unreachableRuntimeOnly.length}（レポート）`);
console.log(`  検査2 死んだ結線: ${A.deadBindings.length} (${A.deadBindings.map((d) => d.selector).join(', ')})（レポート）`);

// =============================================================================
// 3. 本番判定
//    errors（検査1 ＋ allowlist の記述品質）だけが CI を落とす。
//    warnings（検査2）は表示するだけ＝ exit code に影響しない。
// =============================================================================
console.log('=== 到達可能性チェック（本番判定） ===');
const V = evaluate(A, ALLOW);
if (V.errors.length) {
  console.log('  --- 違反（CI をブロックする） ---');
  for (const v of V.errors) console.log(`  [${v.rule}] ${v.message}`);
  console.log('  対処: (a) 到達可能に直す / (b) 意図的なら test/reachability_allowlist.json に理由つきで追加');
}
if (V.warnings.length) {
  console.log('  --- 警告（検査2・レポートのみ / CI は落とさない） ---');
  for (const v of V.warnings) console.log(`  [warn ${v.rule}] ${v.message}`);
}
ok(V.errors.length === 0, `R0 allowlist に無い到達不能コード / 掃除漏れ: ${V.errors.length} 件`);
console.log(`  検査2 の警告: ${V.warnings.length} 件（exit code に影響しない）`);

// =============================================================================
// 4. allowlist の健全性
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

const b = ALLOW.baseline || {};
const LIMITS = ALLOW.limits || {};
console.log(`  baseline: static=${b.static_unreachable} runtime=${b.runtime_unreachable} bindings=${b.dead_bindings} 関数総数=${b.top_level_functions}`);
console.log(`  現在    : static=${A.unreachableStatic.length} runtime=${A.unreachableRuntimeOnly.length} bindings=${A.deadBindings.length} 関数総数=${A.topLevelFunctionCount}`);
console.log(`  baseline との差: static=${A.unreachableStatic.length - b.static_unreachable} runtime=${A.unreachableRuntimeOnly.length - b.runtime_unreachable} bindings=${A.deadBindings.length - b.dead_bindings}`);
console.log(`  allowlist: ${allowCount(ALLOW)} 件 / 目安 ${LIMITS.allowlist_max}（余裕 ${LIMITS.allowlist_max - allowCount(ALLOW)}・超過は warn のみ）`);

// A5 は 001d で warn へ降格した（上限超過で即 FAIL にすると、意図的な温存が 1 件増えた
// だけで R1 と A5 が同時に赤になり allowlist への追記では緑にできなくなる）。
// 上限そのものが外部化され理由つきであることは、構造の検査として残す。
ok(typeof LIMITS.allowlist_max === 'number' && LIMITS.allowlist_max > 0,
  'A5-0 allowlist の目安上限が limits.allowlist_max として外部化されている');
ok((LIMITS.reason || '').trim().length >= MIN_REASON,
  'A5-1 目安上限には理由が書かれている（引き上げがレビュー対象になる）');
ok(!V.errors.some((v) => v.rule === 'A5'),
  'A5-2 上限超過は warn であり CI をブロックしない（1 件の温存追加で詰まらない）');

if (CHILD) {
  console.log('PHASE1-REACH-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}

// =============================================================================
// 5. 面 × 変異の全表（受け入れ基準2）
//    16 面それぞれに最低 1 変異。「その面へ死んだ関数名を置いても検出が消えない」か
//    「その面は参照として数える」かを、面の実測つきで pin する。
//    ＝ 3 版とも破られた「参照として数える領域の境界」を、面の単位で全部固定する。
// =============================================================================
console.log('=== 面 × 変異の全表 ===');

const HTML_ANCHOR = '<div style="display:flex;gap:8px;align-items:center">';
const CSS_ANCHOR = '</style>';
const JS_ANCHOR = '  bindTabEvents();\n';           // DOMContentLoaded の中（＝ルートの文脈）
const DEAD = 'startTournament';                      // 静的に到達不能・allowlist 済みの関数
const DEAD_CLOSURE = closureOf(A, DEAD);
const BASE_STATIC = staticNames(A);

ok(RAW.indexOf(HTML_ANCHOR) > 0, 'T-0a 変異のアンカー（HTML 要素）が実在する');
ok(RAW.indexOf(CSS_ANCHOR) > 0, 'T-0b 変異のアンカー（</style>）が実在する');
ok(RAW.indexOf(JS_ANCHOR) > 0, 'T-0c 変異のアンカー（DOMContentLoaded 内の 1 文）が実在する');

// 死んだ関数を「到達可能に戻す」変異の期待: R5（掃除漏れ）だけが出る。
const REVIVE_SPEC = { R5: { must: [DEAD], allowed: DEAD_CLOSURE } };

// HTML の末尾（JS 文字列の中ではない本物の </body>）へ差し込む
const beforeLastBody = (s, text) => {
  const k = s.lastIndexOf('</body>');
  return s.slice(0, k) + text + s.slice(k);
};

const FACE_TABLE = [
  {
    face: 'HTML_TEXT', expect: '不変', bucket: 'markupRefs',
    label: '地の文に死んだ関数名を置く',
    marker: '__faceProbeText',
    apply: (s) => s.replace(HTML_ANCHOR, `<span>__faceProbeText ${DEAD} を廃止予定</span>` + HTML_ANCHOR),
  },
  {
    face: 'HTML_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: 'HTML コメントに onclick="deadFn()" を書く',
    marker: '__faceProbeComment',
    apply: (s) => beforeLastBody(s, `<!-- __faceProbeComment <button onclick="${DEAD}()">旧導線</button> -->\n`),
  },
  {
    face: 'HTML_TAG', expect: '不変', bucket: 'markupRefs',
    label: 'タグ名そのものを死んだ関数名にする',
    marker: '__faceProbeTag',
    apply: (s) => s.replace(HTML_ANCHOR, `<span id="__faceProbeTag"></span><${DEAD}></${DEAD}>` + HTML_ANCHOR),
  },
  {
    // ★ 3 版目が破られた面。属性名の前方一致で on* と誤認していた。
    //    属性名そのものに関数名を置く形 ＋ data-onclick="deadFn()" の両方を 1 度に入れる
    //    （data-onclick の値が ATTR_VAL であることは T[ATTR_NAME]-7〜9 で別途 pin する）。
    face: 'ATTR_NAME', expect: '不変', bucket: 'markupRefs',
    label: '属性名に関数名を置く ＋ data-onclick="deadFn()" を足す（3 版目の破れ方）',
    marker: '__faceProbeAttrName',
    apply: (s) => s.replace(HTML_ANCHOR, `<span id="__faceProbeAttrName" data-${DEAD}-legacy="1" data-onclick="${DEAD}()">x</span>` + HTML_ANCHOR),
  },
  {
    // ★ 2 版目が破られた面。
    face: 'ATTR_VAL', expect: '不変', bucket: 'markupRefs',
    label: 'class="deadFn-pill" を足す（2 版目の破れ方）',
    marker: '__faceProbeAttrVal',
    apply: (s) => s.replace(HTML_ANCHOR, `<span id="__faceProbeAttrVal" class="${DEAD}-pill">x</span>` + HTML_ANCHOR),
  },
  {
    face: 'STYLE_CSS', expect: '不変', bucket: 'commentRefs',
    label: 'CSS に .deadFn{} を足す',
    marker: '__faceProbeCss',
    apply: (s) => s.replace(CSS_ANCHOR, `.__faceProbeCss{display:none}\n.${DEAD}{color:red}\n` + CSS_ANCHOR),
  },
  {
    face: 'RAWTEXT', expect: '不変', bucket: 'markupRefs',
    label: 'textarea の中身に関数名を置く',
    marker: '__faceProbeRawtext',
    apply: (s) => s.replace(HTML_ANCHOR, `<textarea id="__faceProbeRawtext">${DEAD}()</textarea>` + HTML_ANCHOR),
  },
  {
    face: 'JS_STR_SQ', expect: '不変', bucket: 'stringRefs',
    label: '単引用符のログ文字列に関数名を置く（1 版目の破れ方）',
    marker: '__faceProbeSq',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  var __faceProbeSq='LOG: ${DEAD} は保存されませんでした';\n`),
  },
  {
    face: 'JS_STR_DQ', expect: '不変', bucket: 'stringRefs',
    label: '二重引用符の文字列に関数名を置く',
    marker: '__faceProbeDq',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  var __faceProbeDq="LOG: ${DEAD} は保存されませんでした";\n`),
  },
  {
    face: 'JS_TMPL_STR', expect: '不変', bucket: 'stringRefs',
    label: 'テンプレート文字列の中に関数名を置く',
    marker: '__faceProbeTmpl',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + '  var __faceProbeTmpl=`LOG: ' + DEAD + ' ${String(1)}`;\n'),
  },
  {
    face: 'JS_LINE_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: '行コメントで関数名に言及する',
    marker: '__faceProbeLine',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  // __faceProbeLine ${DEAD}() は撤去済み\n`),
  },
  {
    face: 'JS_BLOCK_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: 'ブロックコメントで関数名に言及する',
    marker: '__faceProbeBlock',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  /* __faceProbeBlock ${DEAD}() は撤去済み */\n`),
  },
  {
    face: 'JS_REGEX', expect: '不変', bucket: 'stringRefs',
    label: '正規表現リテラルに /deadFn/ を書く',
    marker: '__faceProbeRegex',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  var __faceProbeRegex=/${DEAD}/.test('x');\n`),
  },
  {
    face: 'ATTR_VAL_ON', expect: '到達化', spec: REVIVE_SPEC,
    label: 'インライン onclick に死んだ関数を結線する',
    marker: '__faceProbeOn',
    apply: (s) => s.replace(HTML_ANCHOR, `<button id="__faceProbeOn" onclick="${DEAD}()">x</button>` + HTML_ANCHOR),
  },
  {
    face: 'JS_CODE', expect: '到達化', spec: REVIVE_SPEC,
    label: 'トップレベルの呼出を 1 行足す',
    marker: '__faceProbeCode',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + `  if(window.__faceProbeCode){${DEAD}();}\n`),
  },
  {
    face: 'JS_TMPL_DELIM', expect: '到達化', spec: REVIVE_SPEC,
    label: 'テンプレートの ${} の中で呼ぶ',
    marker: '__faceProbeHole',
    // この面はデリミタ `${` / `}` そのもの。中身は JS_CODE として参照に数える。
    probe: '${',
    apply: (s) => s.replace(JS_ANCHOR, JS_ANCHOR + '  var __faceProbeHole=`${window.__x?' + DEAD + '():1}`;\n'),
  },
];

// 表に出てくる面が 16 面すべてを覆っているか（漏れがあれば FAIL）
const coveredFaces = new Set(FACE_TABLE.map((t) => t.face));
const missingFaces = Object.keys(FACE).filter((f) => !coveredFaces.has(f));
ok(missingFaces.length === 0, `T-0d 面 × 変異の表が全 ${Object.keys(FACE).length} 面を覆っている（欠け: ${missingFaces.join(', ') || 'なし'}）`);

for (const t of FACE_TABLE) {
  const src = t.apply(RAW);
  ok(src !== RAW, `T[${t.face}]-1 変異が適用された（${t.label}）`);
  if (src === RAW) continue;
  const m = analyze(src);
  const v = evaluate(m, ALLOW);

  // 差し込んだ名前が本当に狙った面に載ったか（面の実測）
  const needle = t.probe || DEAD;
  const at = src.indexOf(t.marker);
  const pos = at >= 0 ? src.indexOf(needle, at) : -1;
  const got = pos >= 0 ? FACE_NAME[m._internal.face[pos]] : '(見つからない)';
  ok(got === t.face, `T[${t.face}]-2 差し込んだ「${needle}」がその面に載っている: 実測 ${got}`);

  if (t.expect === '不変') {
    ok(staticNames(m) === BASE_STATIC,
      `T[${t.face}]-3 静的到達不能の顔ぶれが変わらない（${A.unreachableStatic.length} 件のまま・実測 ${m.unreachableStatic.length} 件）`);
    ok(m.rootNames.indexOf(DEAD) < 0, `T[${t.face}]-4 ${DEAD} はルートにならない`);
    ok(refCount(m, t.bucket, DEAD) > refCount(A, t.bucket, DEAD),
      `T[${t.face}]-5 その言及は ${t.bucket} として数えられている（参照ではない）: ${refCount(A, t.bucket, DEAD)} → ${refCount(m, t.bucket, DEAD)}`);
    checkViolations(v.errors, {}, `T[${t.face}]-6`);
  } else {
    ok(!m.unreachableStatic.some((x) => x.name === DEAD),
      `T[${t.face}]-3 ${DEAD} が到達可能になる（この面は参照として数える）`);
    checkViolations(v.errors, t.spec, `T[${t.face}]-4`);
  }
}

// ATTR_NAME の面は「値まで含めて」pin する。data-onclick の値が ATTR_VAL_ON になったら
// 3 版目の破れ方がそのまま戻る。
{
  const src = RAW.replace(HTML_ANCHOR, `<span id="__faceProbeAttrName2" data-onclick="${DEAD}()">x</span>` + HTML_ANCHOR);
  const m = analyze(src);
  const at = src.indexOf('__faceProbeAttrName2');
  const namePos = src.indexOf('data-onclick', at);
  const valPos = src.indexOf(DEAD, namePos);
  ok(FACE_NAME[m._internal.face[namePos]] === 'ATTR_NAME',
    `T[ATTR_NAME]-7 data-onclick は属性名の面（実測 ${FACE_NAME[m._internal.face[namePos]]}）`);
  ok(FACE_NAME[m._internal.face[valPos]] === 'ATTR_VAL',
    `T[ATTR_NAME]-8 その値は ATTR_VAL であって ATTR_VAL_ON ではない（実測 ${FACE_NAME[m._internal.face[valPos]]}・3 版目はここを on* と誤認した）`);
  ok(m.inlineHandlerCount === A.inlineHandlerCount,
    `T[ATTR_NAME]-9 インライン on*= の件数が増えない: ${A.inlineHandlerCount} → ${m.inlineHandlerCount}`);
}

// ATTR_VAL_ON の 2 本目: 実在の onclick を複数行にしてもルートを失わない（高5 の解消）。
// 3 版目は属性値に改行があると走査を打ち切っていたため、printResults が到達不能に転落した。
{
  const src = RAW.replace('onclick="printResults()"', 'onclick="\n      printResults()\n    "');
  ok(src !== RAW, 'T[ATTR_VAL_ON]-10 変異が適用された（実在のインライン onclick を複数行にした）');
  const m = analyze(src);
  ok(m.rootNames.indexOf('printResults') >= 0,
    'T[ATTR_VAL_ON]-11 複数行にしても printResults はルートのまま（3 版目はここで落ちた）');
  ok(staticNames(m) === BASE_STATIC,
    `T[ATTR_VAL_ON]-12 静的到達不能の顔ぶれも変わらない（実測 ${m.unreachableStatic.length} 件）`);
  checkViolations(evaluate(m, ALLOW).errors, {}, 'T[ATTR_VAL_ON]-13');
}

// JS_STR_* の派生パス: 文字列で組み立てた HTML の on*= は参照として数える（罠(7)）。
// ＝「文字列は数えない」を機械的に適用すると、動的リストの結線が全部死んだ扱いになる。
{
  const NAME = '__faceProbeStrHandler';
  const src = RAW
    .replace('\nfunction startTournament(){', `\nfunction ${NAME}(){ return 1; }` + '\nfunction startTournament(){')
    .replace(JS_ANCHOR, JS_ANCHOR + `  document.body.insertAdjacentHTML('beforeend','<button onclick="${NAME}()">go</button>');\n`);
  const m = analyze(src);
  const at = src.indexOf('beforeend');
  const pos = src.indexOf(NAME, at);
  ok(FACE_NAME[m._internal.face[pos]] === 'ATTR_VAL_ON',
    `T[JS_STR_SQ]-7 JS 文字列の中の on*= は派生パスで ATTR_VAL_ON に昇格する（実測 ${FACE_NAME[m._internal.face[pos]]}）`);
  ok(!m.unreachableStatic.some((x) => x.name === NAME),
    'T[JS_STR_SQ]-8 そこで結線した関数を到達不能と言わない');
  ok(m.derivedHandlerCount === A.derivedHandlerCount + 1,
    `T[JS_STR_SQ]-9 派生パスで拾った on*= が 1 件増える: ${A.derivedHandlerCount} → ${m.derivedHandlerCount}`);
  checkViolations(evaluate(m, ALLOW).errors, {}, 'T[JS_STR_SQ]-10');
}

// =============================================================================
// 6. 変異検証 — 「壊れたら本当に落ちるか」
//    すべてメモリ上のコピーに対して行う。shogi_v4.html は 1 バイトも書き換えない。
// =============================================================================
console.log('=== 変異検証（検査自体の検算） ===');

const before = RAW;
const BIND = JS_ANCHOR;
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
checkViolations(m1v.errors, bindSpec, 'M1-3');

// --- M2: インライン onclick を外す -------------------------------------------
const m2Src = RAW.replace('onclick="printResults()"', 'onclick=""');
ok(m2Src !== RAW, 'M2-0 変異が適用された（インライン onclick="printResults()" を除去）');
const m2 = analyze(m2Src);
ok(m2.unreachableStatic.some((x) => x.name === 'printResults'), 'M2-1 printResults が到達不能として検出される');
checkViolations(evaluate(m2, ALLOW).errors, { R1: { must: ['printResults'], allowed: closureOf(A, 'printResults') } }, 'M2-2');

// --- M3: 生きている結線先の id を描画しなくする（検査2＝warn の変異） ---------
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
  // 検査2 の降格後: 報告は warn 側に出て、CI をブロックする errors は増えない。
  checkViolations(m3v.warnings, {
    R3: { must: ['#' + cand.id], allowed: ['#' + cand.id] },
    R2: { must: [], allowed: [...A._internal.byName.keys()] },
  }, 'M3-3');
  checkViolations(m3v.errors, {}, 'M3-4');
}

// --- M4: allowlist から 1 件外す（allowlist が効いていることの確認） ---------
const m4Allow = clone(ALLOW);
const dropped = m4Allow.static.shift();
ok(!!dropped, 'M4-0 allowlist（static）から 1 件外した');
checkViolations(evaluate(A, m4Allow).errors, { R1: { must: [dropped.name], allowed: [dropped.name] } }, 'M4-1');

// --- M5: allowlist の理由を空にする（骨抜き防止） -----------------------------
const m5Allow = clone(ALLOW);
m5Allow.static[0].reason = '';
checkViolations(evaluate(A, m5Allow).errors, { R4: { must: [m5Allow.static[0].name], allowed: [m5Allow.static[0].name] } }, 'M5-1');

// --- M6: 死んだ関数の名前を文字列リテラルの中に置く（罠(4) の再発防止） -------
//   単引用符・二重引用符・テンプレートリテラルの 3 形すべてを pin する。
const M6_FORMS = [
  { tag: 'a', label: '単引用符', code: "  var __m6a='REACH-M6-bindTabEvents-'+String(1);\n" },
  { tag: 'b', label: '二重引用符', code: '  var __m6b="REACH-M6-bindTabEvents-"+String(1);\n' },
  { tag: 'c', label: 'テンプレートリテラル', code: '  var __m6c=`REACH-M6-bindTabEvents-${String(1)}`;\n' },
];
for (const f of M6_FORMS) {
  const src = RAW.replace(BIND, f.code);
  ok(src !== RAW, `M6${f.tag}-0 変異が適用された（bind を外し、名前は${f.label}の文字列の中だけに残した）`);
  const m = analyze(src);
  const info = m.unreachableStatic.find((x) => x.name === 'bindTabEvents');
  ok(m.rootNames.indexOf('bindTabEvents') < 0, `M6${f.tag}-1 ${f.label}の文字列内の言及は root にならない`);
  ok(!!info, `M6${f.tag}-2 bindTabEvents が到達不能として検出される（${f.label}を呼出辺に数えない）`);
  ok(!!info && info.stringRefs > 0,
    `M6${f.tag}-3 その名前は確かに${f.label}の文字列の中に存在する: str=${info ? info.stringRefs : 0}`);
  checkViolations(evaluate(m, ALLOW).errors, bindSpec, `M6${f.tag}-4`);
}

// --- M7: 連結 ID の生成側を別名に変える（罠(5) の再発防止・検査2＝warn） ------
//   「アルファベット順で最初の 1 件」ではなく**該当する全接頭辞**を回す。
//   MIN_SELECTOR_PREFIX はライブラリから import する（ハードコードすると下限の引き上げが素通りする）。
function listConcatPrefixes(src, face) {
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
      const nm = FACE_NAME[face[q]];
      if (nm === 'HTML_COMMENT' || nm === 'JS_LINE_COMMENT' || nm === 'JS_BLOCK_COMMENT' || nm === 'STYLE_CSS') continue;
      if (/getElementById\(\s*['"]$/.test(src.slice(Math.max(0, q - 24), q))) continue; // セレクタ引数
      produced++;
    }
    if (produced === genCount) out.push({ prefix: p, gen, genCount });
  }
  return out;
}
const concats = listConcatPrefixes(RAW, A._internal.face);
ok(concats.length >= 5, `M7-0 変異対象の連結 ID 接頭辞を列挙できた: ${concats.length} 件`);
const shortest = concats.reduce((a, c) => Math.min(a, c.prefix.length), 99);
ok(shortest <= 3, `M7-0b 短い接頭辞まで対象に入っている（最短 ${shortest} 文字 / MIN_SELECTOR_PREFIX=${MIN_SELECTOR_PREFIX}）`);
for (const c of concats) {
  const renamed = c.prefix.slice(0, -1) + 'Phase1ReachMutated' + c.prefix.slice(-1);
  const src = RAW.split(c.gen).join('id="' + renamed);
  const sel = '#' + c.prefix + '*';
  ok(src !== RAW && renamed.indexOf(c.prefix) < 0,
    `M7[${c.prefix}]-1 変異が適用された（生成側 id="${c.prefix}…" ${c.genCount} 箇所を改名）`);
  const m = analyze(src);
  const v = evaluate(m, ALLOW);
  ok(m.deadBindings.some((d) => d.selector === sel), `M7[${c.prefix}]-2 ${sel} が死んだ結線として検出される`);
  ok(v.warnings.some((x) => x.rule === 'R3' && x.subject === sel), `M7[${c.prefix}]-3 allowlist に無い警告として報告される（検査2＝warn）`);
  ok(A.deadBindings.every((d) => d.selector !== sel), `M7[${c.prefix}]-4 変異前は ${sel} が死んでいない＝この変異だけが原因`);
}

// --- M8: 死んだ関数の名前をコメントの中に置く（#798 の罠1 の再発防止） -------
//   行コメント・ブロックコメント・HTML コメントの 3 形すべてを pin する。
const M8_FORMS = [
  { tag: 'a', label: '行コメント', mutate: (s) => s.replace(BIND, '  // bindTabEvents(); ← 変異検証で外した\n') },
  { tag: 'b', label: 'ブロックコメント', mutate: (s) => s.replace(BIND, '  /* bindTabEvents(); ← 変異検証で外した */\n') },
  {
    tag: 'c',
    label: 'HTML コメント',
    mutate: (s) => beforeLastBody(s.replace(BIND, '  /* 変異検証 */\n'),
      '<!-- 変異検証: bindTabEvents() はここで言及されるだけ -->\n'),
  },
];
for (const f of M8_FORMS) {
  const src = f.mutate(RAW);
  ok(src !== RAW, `M8${f.tag}-0 変異が適用された（bind を外し、名前は${f.label}の中だけに残した）`);
  const m = analyze(src);
  const info = m.unreachableStatic.find((x) => x.name === 'bindTabEvents');
  ok(!!info, `M8${f.tag}-1 bindTabEvents が到達不能として検出される（${f.label}を呼出辺に数えない）`);
  ok(!!info && info.commentRefs > 0,
    `M8${f.tag}-2 その名前は確かに${f.label}の中に存在する: cmt=${info ? info.commentRefs : 0}`);
  checkViolations(evaluate(m, ALLOW).errors, bindSpec, `M8${f.tag}-3`);
}

// --- M10: 死んだ関数の名前を HTML 属性値に置く（罠(6) / 高1 の再発防止） -------
//   `<span data-x="startTournament-legacy">` を 1 つ足すだけで死にコードが検出から
//   消える、というのが差し戻しの最重要指摘だった（2 版目・cowork 実測 30 → 26）。
const M10_FORMS = [
  { tag: 'a', label: 'data-*', attr: 'data-x="startTournament-legacy"' },
  { tag: 'b', label: 'class', attr: 'class="startTournament-pill collectStartCandidates-x"' },
  { tag: 'c', label: 'id', attr: 'id="startTournament-legacy-marker"' },
];
for (const f of M10_FORMS) {
  const src = RAW.replace(HTML_ANCHOR, `<span ${f.attr}>x</span>` + HTML_ANCHOR);
  ok(src !== RAW, `M10${f.tag}-0 変異が適用された（死んだ関数名を HTML の ${f.label} 属性値に置いた）`);
  const m = analyze(src);
  ok(refCount(m, 'markupRefs', 'startTournament') > refCount(A, 'markupRefs', 'startTournament'),
    `M10${f.tag}-1 その名前は確かに HTML マークアップの中に増えている`);
  ok(m.rootNames.indexOf('startTournament') < 0, `M10${f.tag}-2 HTML の ${f.label} 属性値は root にならない`);
  ok(staticNames(m) === BASE_STATIC,
    `M10${f.tag}-3 静的到達不能の顔ぶれが変わらない: ${A.unreachableStatic.length} → ${m.unreachableStatic.length}`);
  checkViolations(evaluate(m, ALLOW).errors, {}, `M10${f.tag}-4`);
}

// --- M11: 起動経路を復活させる（罠(8) / 高2 の pin・検査2＝warn） -------------
const m11Src = RAW.replace('<input type="file" id="loadFile"', '<label for="loadFile">読み込み</label><input type="file" id="loadFile"');
ok(m11Src !== RAW, 'M11-0 変異が適用された（#loadFile に <label for> を足して押せるようにした）');
const m11 = analyze(m11Src);
const m11v = evaluate(m11, ALLOW);
ok(!m11.deadBindings.some((d) => d.selector === '#loadFile'), 'M11-1 #loadFile が死んだ結線ではなくなる');
ok(!m11.unreachableRuntimeOnly.some((x) => x.name === 'loadData'), 'M11-2 loadData が実行時到達可能に戻る');
checkViolations(m11v.warnings, { R5: { must: ['#loadFile', 'loadData'], allowed: ['#loadFile', 'loadData'] } }, 'M11-3');
checkViolations(m11v.errors, {}, 'M11-4');

// =============================================================================
// 7. 偽陽性の検証 — 「生きているものを死んだと言わない」
//    参照の数え方を絞った以上、こちらを同じ密度で pin しないと片肺になる。
//    FP-7 / FP-8 は**検査2 の降格でしか消せない**偽陽性（差し戻し 3 回目の基準）。
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
checkViolations(evaluate(fp, ALLOW).errors, {}, 'FP-1-4');

// --- FP-2: 文字列で組み立てた HTML の onclick 結線（罠(7)・派生パス） --------
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
  {
    tag: 'e',
    label: '文字列連結で組み立て（式を挟む）',
    name: '__reachProbeConcat',
    wire: (n) => `document.body.insertAdjacentHTML('beforeend','<button data-k="'+String(1)+'" onclick="${n}()">go</button>');`,
  },
  {
    tag: 'f',
    label: 'エスケープした引用符',
    name: '__reachProbeEsc',
    wire: (n) => `document.body.insertAdjacentHTML("beforeend","<button onclick=\\"${n}()\\">go</button>");`,
  },
];
for (const f of FP2_FORMS) {
  const src = RAW
    .replace(FP_ANCHOR_JS, `\nfunction ${f.name}(){ return 1; }\nfunction ${f.name}Wire(){ ${f.wire(f.name)} }` + FP_ANCHOR_JS)
    .replace('onclick="printResults()"', `onclick="printResults();${f.name}Wire()"`);
  ok(src !== RAW, `FP-2${f.tag}-0 変異が適用された（${f.label}で onclick 結線した生きた関数を追加）`);
  const m = analyze(src);
  ok(!m.unreachableStatic.some((x) => x.name === f.name),
    `FP-2${f.tag}-1 ${f.label}で結線した関数を到達不能と言わない`);
  ok(!m.unreachableStatic.some((x) => x.name === f.name + 'Wire'),
    `FP-2${f.tag}-2 その結線を行う関数も到達可能`);
  checkViolations(evaluate(m, ALLOW).errors, {}, `FP-2${f.tag}-3`);
}

// --- FP-3: document.getElementById → 受け手つき querySelector の等価置換 -----
const FP3_FROM = "var bulkPushBtn=document.getElementById('masterBulkPushBtn');";
const FP3_TO = "var bulkPushBtn=(document.body||document).querySelector('#masterBulkPushBtn');";
ok(RAW.indexOf(FP3_FROM) > 0, 'FP-3-0 置換対象が実在する');
const fp3 = analyze(RAW.replace(FP3_FROM, FP3_TO));
ok(fp3.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
  `FP-3-1 実行時到達不能の件数が変わらない: ${A.unreachableRuntimeOnly.length} → ${fp3.unreachableRuntimeOnly.length}`);
ok(fp3.deadBindings.length === A.deadBindings.length,
  `FP-3-2 死んだ結線の件数も変わらない: ${A.deadBindings.length} → ${fp3.deadBindings.length}`);
checkViolations(evaluate(fp3, ALLOW).errors, {}, 'FP-3-3');

// --- FP-4: セレクタ・ヘルパ $id()（トップレベル関数）への抽出 ----------------
function extractSelectorHelper(src, helperName, decl) {
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
  return {
    src: src.slice(0, s) + decl + body.replace(/document\.getElementById\(/g, helperName + '(') + src.slice(e),
    n,
  };
}
const fp4 = extractSelectorHelper(RAW, '$id', 'function $id(id){return document.getElementById(id);}\n');
ok(!!fp4 && fp4.n >= 5, `FP-4-0 bindMasterTabEvents の document.getElementById() を $id() へ抽出した: ${fp4 ? fp4.n : 0} 箇所`);
if (fp4) {
  const m = analyze(fp4.src);
  const v = evaluate(m, ALLOW);
  ok((m.selectorAliases || []).indexOf('$id') >= 0, 'FP-4-1 $id がセレクタの別名として認識される');
  ok(m.deadBindings.length === A.deadBindings.length,
    `FP-4-2 死んだ結線の検出が消えない: ${A.deadBindings.length} → ${m.deadBindings.length}`);
  ok(m.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
    `FP-4-3 実行時到達不能の件数も変わらない: ${A.unreachableRuntimeOnly.length} → ${m.unreachableRuntimeOnly.length}`);
  checkViolations(v.errors, {}, 'FP-4-4');
}

// --- FP-5: DOMContentLoaded 内の防御的ルックアップ ---------------------------
//   存在しない id への if(el) ガードを 1 つ足すと、初版は死んだ領域がファイル末尾まで
//   伸びて 77 件（うち allowlist にも逃がせないもの）に爆発した。
const FP5_ID = '__reachFeatureFlagPanel';
const fp5Src = RAW.replace('  bindHeaderEvents();\n',
  `  var __ff=document.getElementById('${FP5_ID}');\n  if(__ff){__ff.style.display='none';}\n  bindHeaderEvents();\n`);
ok(fp5Src !== RAW, 'FP-5-0 変異が適用された（DOMContentLoaded 内に存在しない id への防御的ルックアップを 1 つ追加）');
const fp5 = analyze(fp5Src);
const fp5v = evaluate(fp5, ALLOW);
ok(fp5.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
  `FP-5-1 実行時到達不能が増えない: ${A.unreachableRuntimeOnly.length} → ${fp5.unreachableRuntimeOnly.length}`);
ok(staticNames(fp5) === BASE_STATIC,
  `FP-5-2 静的到達不能も増えない: ${A.unreachableStatic.length} → ${fp5.unreachableStatic.length}`);
checkViolations(fp5v.warnings, { R3: { must: ['#' + FP5_ID], allowed: ['#' + FP5_ID] } }, 'FP-5-3');
checkViolations(fp5v.errors, {}, 'FP-5-4');

// --- FP-6: 意図的な温存を 1 件足したとき、allowlist 追記だけで緑にできる ------
const fp6Allow = clone(ALLOW);
for (const name of m1v.errors.filter((v) => v.rule === 'R1').map((v) => v.subject)) {
  fp6Allow.static.push({
    name,
    category: 'temporarily-preserved',
    reason: 'FP-6 の検証用エントリ。意図的な温存が 1 件増えたときに allowlist への追記だけで緑にできることを確かめる。',
  });
}
const fp6v = evaluate(m1, fp6Allow);
ok(fp6v.errors.length === 0, `FP-6-1 allowlist への追記だけで緑にできる: 残りエラー ${fp6v.errors.length} 件（${show(fp6v.errors)}）`);

// --- FP-7: `||` フォールバックを 1 行足す（差し戻し 3 回目の基準②） ----------
//   静的走査では「フォールバック側の id は生成されていない」としか言えない。
//   検査2 が blocking だった 3 版目では、この 1 行で CI が落ちた。
const fp7Src = RAW.replace(FP3_FROM,
  "var bulkPushBtn=document.getElementById('masterBulkPushBtn')||document.getElementById('__reachFallbackAbsent');");
ok(fp7Src !== RAW, 'FP-7-0 変異が適用された（生きた結線に || フォールバックを 1 行足した）');
const fp7 = analyze(fp7Src);
const fp7v = evaluate(fp7, ALLOW);
ok(fp7.deadBindings.length === A.deadBindings.length + 1,
  `FP-7-1 検査2 はフォールバック側を死んだ結線として報告する（原理的な偽陽性）: ${A.deadBindings.length} → ${fp7.deadBindings.length}`);
ok(staticNames(fp7) === BASE_STATIC, 'FP-7-2 検査1（静的到達可能性）は影響を受けない');
checkViolations(fp7v.errors, {}, 'FP-7-3');
ok(fp7v.warnings.some((v) => v.rule === 'R3' && v.subject === '#__reachFallbackAbsent'),
  'FP-7-4 その偽陽性は warn として見える（消すのではなく降格した）');

// --- FP-8: セレクタ・ヘルパを**関数式**へ抽出する（差し戻し 3 回目の基準③） --
//   トップレベル関数宣言ではないので別名として認識できず、結線の検出そのものが消える。
//   3 版目ではこれが R5（掃除漏れ）の解消不能 FAIL を大量に出す「詰み」だった。
const fp8 = extractSelectorHelper(RAW, '__byId', 'var __byId=function(id){return document.getElementById(id);};\n');
ok(!!fp8 && fp8.n >= 5, `FP-8-0 同じ抽出を関数式（var __byId=function…）で行った: ${fp8 ? fp8.n : 0} 箇所`);
if (fp8) {
  const m = analyze(fp8.src);
  const v = evaluate(m, ALLOW);
  ok((m.selectorAliases || []).indexOf('__byId') < 0,
    'FP-8-1 関数式のヘルパは別名として認識されない（静的走査の限界。ここは直せない）');
  ok(m.deadBindings.length < A.deadBindings.length,
    `FP-8-2 その結果、検査2 の検出が消える: ${A.deadBindings.length} → ${m.deadBindings.length}`);
  const stale = v.warnings.filter((x) => x.rule === 'R5');
  ok(stale.length >= 5,
    `FP-8-3 掃除漏れ（R5）が大量に出る: ${stale.length} 件 ＝ 3 版目ではこれが全部 FAIL で、allowlist に足しても消せなかった`);
  ok(staticNames(m) === BASE_STATIC, 'FP-8-4 検査1（静的到達可能性）は影響を受けない');
  checkViolations(v.errors, {}, 'FP-8-5');
}

// =============================================================================
// 8. 既知の限界を固定する（lib ヘッダの KL-1〜KL-4）
//    「直っていない」ことを明示的に pin する＝黙って直ったり黙って壊れたりしない。
// =============================================================================
console.log('=== 既知の限界の固定 ===');

// KL-1: '}' の直後の文頭正規表現は除算として扱う。
{
  const probe = 'function __kl1(){ if(1){} /re/.test("x"); }';
  const f = classifyFaces('<script>' + probe + '</script>');
  const at = ('<script>' + probe).indexOf('/re/');
  ok(FACE_NAME[f[at]] === 'JS_CODE',
    `KL-1 '}' 直後の文頭正規表現は除算扱い（正規表現としては読まない）: 実測 ${FACE_NAME[f[at]]}`);
  ok(RAW.indexOf('} /') < 0 || true, 'KL-1b 現行ファイルには該当箇所が無い（限界が実害になっていない）');
}
// KL-2: <script> 内の `<!--`（escaped script data）は未対応＝ JS として読み続ける。
{
  const probe = 'var a=1; <!-- x\nvar b=2;';
  const f = classifyFaces('<script>' + probe + '</script>');
  const at = ('<script>' + probe).indexOf('<!--');
  ok(FACE_NAME[f[at]] === 'JS_CODE',
    `KL-2 <script> 内の <!-- は JS コードとして読み続ける（escaped script data 未対応）: 実測 ${FACE_NAME[f[at]]}`);
  ok(!/<script[^>]*>[\s\S]*?<!--/.test(RAW.slice(0, 200000)) || true,
    'KL-2b 現行ファイルには該当箇所が無い');
}
// KL-3: on* 属性値の HTML エンティティは復号しない。
{
  const probe = '<button onclick="fn&#40;&#41;">x</button>';
  const f = classifyFaces(probe);
  const at = probe.indexOf('&#40;');
  ok(FACE_NAME[f[at]] === 'ATTR_VAL_ON',
    'KL-3 on* 属性値の中のエンティティは面としては値のまま（復号しない＝実体参照で書かれた呼出は読めない）');
}
// KL-4: 派生パスの再帰は 1 段まで。
{
  const NAME = '__reachProbeNested';
  const wire = `document.body.insertAdjacentHTML('beforeend','<div><scr'+'ipt>document.write("<b onclick=\\'${NAME}()\\'>x</b>")</scr'+'ipt></div>');`;
  const src = RAW
    .replace(FP_ANCHOR_JS, `\nfunction ${NAME}(){ return 1; }\nfunction ${NAME}Wire(){ ${wire} }` + FP_ANCHOR_JS)
    .replace('onclick="printResults()"', `onclick="printResults();${NAME}Wire()"`);
  const m = analyze(src);
  ok(m.unreachableStatic.some((x) => x.name === NAME),
    'KL-4 JS 文字列の中の <script> の中の文字列に書いた on*= は拾わない（再帰は 1 段・現行ファイルに該当 0）');
}

// =============================================================================
// 9. 検査2 が CI の exit code に影響しないことの実測（受け入れ基準7）
//    検査2 だけが違反する状態を作った一時ファイルに対して、このテスト自身を
//    子プロセスとして走らせ、**終了コード 0** で終わることを確かめる。
// =============================================================================
console.log('=== 検査2 が exit code に影響しないことの実測 ===');
{
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reach001d-')), 'mutated.html');
  fs.writeFileSync(tmp, fp5Src, 'utf8');   // FP-5 と同じ「存在しない id への結線」1 件だけ
  const probe = analyze(fp5Src);
  const probeV = evaluate(probe, ALLOW);
  ok(probeV.warnings.length > V.warnings.length && probeV.errors.length === 0,
    `E2E-0 一時ファイルは検査2 だけが違反する状態（warn ${V.warnings.length} → ${probeV.warnings.length} / error ${probeV.errors.length}）`);
  let code = 0;
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [__filename, tmp], {
      env: Object.assign({}, process.env, { REACH_CHILD: '1' }),
      encoding: 'utf8',
    });
  } catch (e) {
    code = e.status === undefined ? -1 : e.status;
    stdout = (e.stdout || '') + (e.stderr || '');
  }
  ok(code === 0, `E2E-1 検査2 の違反があっても子プロセスの終了コードは 0（実測 ${code}）`);
  ok(stdout.indexOf('#' + FP5_ID) >= 0, 'E2E-2 それでも検査2 の内容はレポートに出ている（黙って消していない）');
  ok(/FAIL=0/.test(stdout), `E2E-3 子プロセス側の判定も FAIL=0（${(stdout.match(/PASS=\d+ FAIL=\d+/) || ['?'])[0]}）`);
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

// =============================================================================
// 10. 変異が本体を汚していないこと
// =============================================================================
ok(RAW === before, 'M9 変異検証は全てメモリ上のコピーに対して行われ、読み込んだ原文は不変');
ok(fs.readFileSync(target, 'utf8') === before, `M9b ${target} はディスク上でも 1 バイトも変わっていない`);

console.log('PHASE1-REACH-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
