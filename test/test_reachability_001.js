#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（検査1=静的到達可能性 / 検査2=bind 先の実在）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（当初 35 関数・走査修正後 40 関数が到達不能）を常設の検査に落としたもの。
//   このファイル自身が「壊れたら落ちること」を変異検証で実証する。
//
//   PHASE1-REACH-001e（差し戻し 4 回目への対応）でハーネスの設計を変えた:
//     - **照合は「絶対集合」から「対象ファイルの現状評価との差分」へ**。変異で増えた／減った
//       違反だけを照合する。warn が 1 件出ただけで無関係な変異テストが落ちる構造をやめた
//       （＝「warn は CI を落とさない」が evaluate() の中にしか無い状態の解消）。
//     - **anchor は行テキストの完全一致をやめ、解析結果（関数の位置・面・ルート）から引く**。
//       面 × 変異の全表は、対象ファイルの実在の死にコードではなく**注入した合成の死んだ関数**を
//       使う＝ #798 の死にコードを掃除しても表が壊れない。
//     - S1（script 数）・S16（on* 属性数）等の実態 pin は**情報表示（census）へ降格**。
//     - 「新規ボタン追加 / 新規 script 追加 / 証明済みリファクタの実施 / 死にコード削除＋
//       allowlist 掃除」の 4 操作を**実際に施したファイルに対して本スイート全体を子プロセスで
//       走らせ、exit=0** を実測する（001d はこの 4 操作すべてで赤くなった）。
//     - 最終行に **WARN2=n**（レポート層の警告件数）を出す＝ run_tests.sh の tail -1 で CI ログに載る。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const {
  analyze, classifyFaces, faceStats, FACE, FACE_NAME, isRefFace,
  MIN_SELECTOR_PREFIX, CONCAT_SKIP_LIMIT, ON_EVENT_ATTRS,
} = require('./lib/reachability.js');

const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
const ALLOW_PATH = process.env.REACH_ALLOWLIST || path.join(__dirname, 'reachability_allowlist.json');
const ALLOW = JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'));

// 子プロセスとして起動されたとき（受け入れ基準1・7 の実測）は、さらに子を生まない。
const CHILD = process.env.REACH_CHILD === '1';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };
const skip = (msg) => console.log(`  － skip: ${msg}`);

// allowlist の理由に求めるもの
const MIN_REASON = 20;
const ALLOW_CATEGORIES = new Set([
  'temporarily-preserved', 'test-only-hook', 'leftover-helper', 'functional-loss-pending',
]);
// 根拠参照（Issue 番号 / 行番号 / 日付）のいずれかを必ず含むこと。
const EVIDENCE_RE = /#\d+|L\d{2,}|\d{4}-\d{2}-\d{2}/;

// =============================================================================
// 判定本体: 解析結果 × allowlist → 違反リスト
//   errors   … CI をブロックする（検査1 ＝ 静的到達可能性と、allowlist の記述品質）
//   warnings … レポートのみ（検査2 ＝ 結線先 DOM の実在・起動経路、および派生パスの申し送り）
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
  // R2【warn・検査2】実行時に到達不能なのに allowlist に無い
  for (const [name, info] of runtimeFound) {
    if (!runtimeAllow.has(name)) {
      add('warn', 'R2', name,
        `L${info.line} ${name}() は結線先の DOM が存在しない or 起動経路が無く実行時に到達不能なのに allowlist（runtime）に無い`);
    }
  }
  // R3【warn・検査2】死んだ結線なのに allowlist に無い
  for (const [sel, info] of bindingFound) {
    const why = info.reason === 'no-live-activation'
      ? 'この要素を起動するコードが到達不能なものしかない'
      : 'この id/class をどこでも生成していない';
    if (!bindingAllow.has(sel)) {
      add('warn', 'R3', sel,
        `L${info.line} ${sel} に結線しているが、${why}（allowlist（bindings）に無い）`);
    }
  }
  // R4【error】allowlist エントリの記述品質。**文字数だけでは骨抜きにできる**
  //   （"x"×20 で任意の死んだ関数を恒久緑化できることを実測した）ので形式照合にする:
  //     (a) category が既知の区分キーワード
  //     (b) reason が MIN_REASON 文字以上
  //     (c) reason に根拠参照（#Issue番号 / L行番号 / YYYY-MM-DD）が含まれる
  const reasonCheck = (list, key, section) => {
    for (const e of list || []) {
      const r = (e.reason || '').trim();
      const why = [];
      if (!ALLOW_CATEGORIES.has(e.category)) why.push(`category が既知の区分でない（${e.category}）`);
      if (r.length < MIN_REASON) why.push(`理由が短すぎる（${r.length} 文字 / ${MIN_REASON} 文字以上）`);
      if (!EVIDENCE_RE.test(r)) why.push('理由に根拠参照（#Issue番号 / L行番号 / YYYY-MM-DD）が無い');
      if (why.length) {
        add('error', 'R4', e[key], `allowlist（${section}）の ${e[key]}: ${why.join(' / ')}`);
      }
    }
  };
  reasonCheck(allow.static, 'name', 'static');
  reasonCheck(allow.runtime, 'name', 'runtime');
  reasonCheck(allow.bindings, 'selector', 'bindings');

  // R5 掃除漏れ。static は error、runtime / bindings は検査2 由来なので warn。
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

  // R6【warn】JS 文字列の中の on*= だけで生きている関数。
  //   その HTML が実際に DOM へ挿入されるかは静的に判定できない（一度も挿入されない
  //   死んだテンプレートかもしれない）。**隠さずに見せる**。
  for (const name of a.derivedOnlyReachable || []) {
    add('warn', 'R6', name,
      `${name}() は JS 文字列の中の on*= だけで到達可能。その HTML が実際に挿入されるかは静的には判定できない`);
  }
  // R7【warn】派生パスが上限で打ち切った箇所。拾えたはずの結線を落としているかもしれない。
  for (const t of a.concatTruncations || []) {
    add('warn', 'R7', 'L' + t.line,
      `L${t.line} 文字列連結が ${CONCAT_SKIP_LIMIT} 文字の上限で打ち切られた。ここに on*= 結線があると見落とす`);
  }
  // R8【warn】on* に見えるがイベント名リストに無い属性。リスト漏れなら見落としになる。
  for (const u of a.unknownOnAttrs || []) {
    add('warn', 'R8', u.name,
      `L${u.line} ${u.name}= は on* の形だが既知のイベント名ではない（実イベントならリストに足すこと）`);
  }

  // A5【warn】allowlist の肥大。上限超過は「即 FAIL」をやめ、差分と R4 で運用する。
  const limits = allow.limits || {};
  const count = (allow.static || []).length + (allow.runtime || []).length;
  if (typeof limits.allowlist_max === 'number' && count > limits.allowlist_max) {
    add('warn', 'A5', 'allowlist',
      `allowlist が上限 ${limits.allowlist_max} 件を超えている: ${count} 件（増分の理由を確かめ、必要なら limits.reason ごと引き上げること）`);
  }

  return { errors, warnings, all: errors.concat(warnings) };
}

// =============================================================================
// 差分照合
//   001d は「変異後の違反集合そのもの」を期待と突き合わせていた（絶対集合）。
//   それだと、対象ファイルが正当に warn を 1 件増やしただけで無関係な変異テストが
//   stray FAIL になる。001e は**基準（対象ファイルの現状評価）との差分**だけを見る。
// =============================================================================
const sig = (v) => v.rule + ':' + v.subject;
const show = (vs) => (vs.length ? vs.map(sig).sort().join(' / ') : 'なし');

function deltaOf(baseList, mutList) {
  const b = new Set(baseList.map(sig));
  const m = new Set(mutList.map(sig));
  return {
    added: [...m].filter((x) => !b.has(x)).sort(),
    removed: [...b].filter((x) => !m.has(x)).sort(),
  };
}

// spec: { errors, errorsRemoved, warnings, warningsRemoved } の各値は {must, allowed}。
//   省略したキーは「増減なし」を要求する。allowed 省略時は must と同じ（＝完全一致）。
function checkDelta(baseV, mutV, spec, label) {
  const de = deltaOf(baseV.errors, mutV.errors);
  const dw = deltaOf(baseV.warnings, mutV.warnings);
  const one = (got, want, what) => {
    const must = (want && want.must) || [];
    const allowed = (want && want.allowed) || must;
    for (const m of must) {
      ok(got.indexOf(m) >= 0, `${label}: ${what} に ${m} が無い（実測 [${got.join(', ')}]）`);
    }
    const stray = got.filter((s) => allowed.indexOf(s) < 0);
    ok(stray.length === 0, `${label}: ${what} に想定外が混ざっている [${stray.join(', ')}]`);
  };
  one(de.added, spec.errors, 'error 増分');
  one(de.removed, spec.errorsRemoved, 'error 減分');
  one(dw.added, spec.warnings, 'warn 増分');
  one(dw.removed, spec.warningsRemoved, 'warn 減分');
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

const refCount = (a, kind, name) => {
  const m = a._internal && a._internal[kind];
  return (m && typeof m.get === 'function') ? (m.get(name) || 0) : 0;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const allowCount = (allow) => (allow.static || []).length + (allow.runtime || []).length;
const staticNames = (a) => a.unreachableStatic.map((x) => x.name).join(',');

// =============================================================================
// 構造から引く anchor（行テキストの完全一致はしない）
// =============================================================================

// スクリプト直下（＝どの関数にも属さない位置）へコードを差し込む。
function insertTopLevelJs(src, a, code) {
  const at = a._internal.topFunctions.reduce((mx, f) => Math.max(mx, f.bodyEnd), -1) + 1;
  return src.slice(0, at) + '\n' + code + '\n' + src.slice(at);
}
// HTML の末尾（本物の </body> の直前）へ差し込む。
function insertHtml(src, frag) {
  const k = src.lastIndexOf('</body>');
  return k < 0 ? src + frag : src.slice(0, k) + frag + src.slice(k);
}
// 最後の <style> の中身の末尾へ CSS を差し込む（位置は面から引く）。
function insertCss(src, a, css) {
  const face = a._internal.baseFace;
  let end = -1;
  for (let i = face.length - 1; i >= 0; i--) {
    if (face[i] === FACE.STYLE_CSS) { end = i + 1; break; }
  }
  return end < 0 ? null : src.slice(0, end) + '\n' + css + '\n' + src.slice(end);
}
// 面から「実在するインライン on*= 属性値」のスパンを引く。
function onAttrSpans(a) {
  const face = a._internal.baseFace;
  const out = [];
  for (let i = 0; i < face.length; i++) {
    if (face[i] !== FACE.ATTR_VAL_ON) continue;
    let e = i;
    while (e < face.length && face[e] === FACE.ATTR_VAL_ON) e++;
    out.push({ start: i, end: e });
    i = e;
  }
  return out;
}
// 面で門番した `document.getElementById('id')` の呼出位置を列挙する。
function selectorSites(src, a) {
  const face = a._internal.face;
  const out = [];
  for (const m of src.matchAll(/document\.getElementById\(\s*'([^']+)'\s*\)/g)) {
    if (face[m.index] !== FACE.JS_CODE) continue;
    out.push({ pos: m.index, end: m.index + m[0].length, id: m[1] });
  }
  return out;
}
// トップレベル関数のスパン（`function` キーワードから本体末尾まで）。
function functionSpan(src, a, name) {
  const f = (a._internal.byName.get(name) || [])[0];
  if (!f) return null;
  return { start: src.lastIndexOf('function', f.namePos), bodyEnd: f.bodyEnd };
}
const pinIf = (subject, label, fn) => { if (subject) fn(subject); else skip(label); };

// 差分照合は「変異で新しく現れた違反」を見るので、注入する名前が対象ファイルに
// **既に存在していない**ことが前提になる（子プロセスは変異済みファイルを読む）。
// 衝突したら連番を足して必ず未使用の名前にする。
function uniq(base) {
  if (RAW.indexOf(base) < 0) return base;
  for (let i = 2; ; i++) if (RAW.indexOf(base + i) < 0) return base + i;
}

// =============================================================================
// 1. 面レクサの不変条件（完全性）
// =============================================================================
console.log('=== 面レクサの不変条件 ===');
const FS = faceStats(classifyFaces(RAW));
ok(FS.unclassified === 0, `L-1 未分類の文字が 0（実測 ${FS.unclassified} 文字）`);
ok(FS.covered === RAW.length, `L-2 面の総延長がファイル長と一致する: ${FS.covered} / ${RAW.length}`);
const histSum = Object.values(FS.histogram).reduce((s, n) => s + n, 0);
ok(histSum === RAW.length, `L-3 面ごとの内訳の合計もファイル長と一致する: ${histSum} / ${RAW.length}`);
ok(Object.keys(FS.histogram).length === Object.keys(FACE).length,
  `L-4 面の一覧が ${Object.keys(FACE).length} 面ある`);
ok(Object.values(FACE).filter(isRefFace).length === 2
  && isRefFace(FACE.JS_CODE) && isRefFace(FACE.ATTR_VAL_ON),
'L-5 参照として数える面は JS_CODE ＋ ATTR_VAL_ON の 2 つだけ');
console.log('  面の内訳: ' + Object.entries(FS.histogram)
  .filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' '));

// =============================================================================
// 2. 走査の健全性（実態の数は census＝情報表示。pin にしない）
// =============================================================================
console.log('=== 走査の健全性 ===');
const t0 = Date.now();
const A = analyze(RAW);
const elapsed = Date.now() - t0;
const BASE_STATIC = staticNames(A);

// 構造として必ず成り立つことだけを assert する。
ok(A.scriptBlocks >= 1, `S1 <script> ブロックを検出している: 実測 ${A.scriptBlocks}`);
ok(A.topLevelFunctionCount > 0, `S2 トップレベル関数を検出している: 実測 ${A.topLevelFunctionCount}`);
ok(A.functionDeclsAllDepths >= A.topLevelFunctionCount,
  `S3 全深さの関数宣言数がトップレベル以上（${A.functionDeclsAllDepths} >= ${A.topLevelFunctionCount}）`);
ok(A.rootNames.length >= 1, `S4 ルートを検出している: 実測 ${A.rootNames.length}`);
ok(A.inlineHandlerCount === A.htmlHandlerCount + A.derivedHandlerCount,
  'S5 インライン on*= の合計 = HTML 直書き ＋ 派生パス');
// census（数の実態。増減しても FAIL にしない＝新規ボタン / 新規 script で赤くならない）
console.log(`  census: script=${A.scriptBlocks} 関数=${A.topLevelFunctionCount}(全深さ ${A.functionDeclsAllDepths})`
  + ` root=${A.rootNames.length} on*=${A.inlineHandlerCount}(HTML ${A.htmlHandlerCount}+派生 ${A.derivedHandlerCount})`
  + ` alias=${A.selectorAliases.length} 走査=${elapsed}ms`);

// --- 参照の数え方の性質（対象ファイルに実例があるときだけ照合する）--------------
pinIf(A.unreachableStatic.find((x) => x.commentRefs > 0 && x.liveRefs > 0),
  'S7-S9 コメント参照つきの到達不能関数が現存しない', (f) => {
    ok(f.commentRefs > 0, `S7 コメント参照つきで到達不能な関数を検出できている: ${f.name}(L${f.line}) cmt=${f.commentRefs}`);
    ok(f.liveRefs > 0, `S8 ${f.name} はコード参照もある＝「定義以外の出現0回」方式では拾えない（#798 の罠3）`);
    ok(A.rootNames.indexOf(f.name) < 0, `S9 ${f.name} はコメント言及ではルートにならない（#798 の罠1）`);
  });
pinIf(A.unreachableStatic.find((x) => x.stringRefs > 0 && x.liveRefs === 0),
  'S10-S11 文字列参照だけの到達不能関数が現存しない', (f) => {
    ok(f.stringRefs > 0, `S10 文字列でだけ言及される到達不能関数を検出できている: ${f.name}(L${f.line}) str=${f.stringRefs}`);
    ok(A.rootNames.indexOf(f.name) < 0, `S11 ${f.name} は文字列の言及ではルートにならない（罠4）`);
  });
{
  const markupOnly = [...A._internal.byName.keys()]
    .map((n) => A._internal.describe(n)).filter((d) => d.markupRefs > 0);
  pinIf(markupOnly[0], 'S13-S14 マークアップに名前が出る関数が現存しない', (f) => {
    ok(f.markupRefs > 0, `S13 HTML マークアップ由来のトークンが実在する: ${f.name} markup=${f.markupRefs}`);
    const badRoot = markupOnly.some((d) => (A._internal.roots.get(d.name) || [])
      .some((r) => r.face !== 'JS_CODE' && r.face !== 'ATTR_VAL_ON'));
    ok(!badRoot, 'S14 マークアップ由来のトークンでルートになっている関数は 1 つも無い（罠6）');
  });
  console.log(`  マークアップにトークンが出る関数: ${markupOnly.length} 本`);
}
pinIf(A.deadBindings.find((d) => d.reason === 'no-live-activation'),
  'S17-S19 起動経路なしの結線が現存しない', (d) => {
    ok(true, `S17 ${d.selector} が「起動経路なし」の死んだ結線として検出される（罠8・検査2）`);
    ok(A.unreachableRuntimeOnly.length > 0,
      `S19 その結果、実行時のみ到達不能な関数が報告される: ${A.unreachableRuntimeOnly.length} 本`);
  });

console.log(`  検査1 静的到達不能: ${A.unreachableStatic.length}`);
console.log(`  検査2 実行時のみ到達不能: ${A.unreachableRuntimeOnly.length}（レポート）`);
console.log(`  検査2 死んだ結線: ${A.deadBindings.length} (${A.deadBindings.map((d) => d.selector).join(', ') || 'なし'})（レポート）`);
console.log(`  派生パスのみで到達可能: ${A.derivedOnlyReachable.length} / 連結打ち切り: ${A.concatTruncations.length} / 未知 on*: ${A.unknownOnAttrs.length}`);

// =============================================================================
// 3. 本番判定（errors だけが CI を落とす）
// =============================================================================
console.log('=== 到達可能性チェック（本番判定） ===');
const V = evaluate(A, ALLOW);
if (V.errors.length) {
  console.log('  --- 違反（CI をブロックする） ---');
  for (const v of V.errors) console.log(`  [${v.rule}] ${v.message}`);
  console.log('  対処: (a) 到達可能に直す / (b) 意図的なら test/reachability_allowlist.json に理由つきで追加');
}
if (V.warnings.length) {
  console.log('  --- 警告（レポートのみ / CI は落とさない） ---');
  for (const v of V.warnings) console.log(`  [warn ${v.rule}] ${v.message}`);
}
ok(V.errors.length === 0, `R0 allowlist に無い到達不能コード / 掃除漏れ: ${V.errors.length} 件`);
console.log(`  レポート層の警告: ${V.warnings.length} 件（exit code に影響しない。最終行の WARN2 に出る）`);

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
ok(allEntries.every(([, , e]) => ALLOW_CATEGORIES.has(e.category)), 'A3 全エントリの category が既知の区分キーワード');
ok(allEntries.every(([, , e]) => EVIDENCE_RE.test(e.reason || '')), 'A3b 全エントリの理由に根拠参照（#Issue / L行 / 日付）がある');
const dupKey = new Set();
let dup = 0;
for (const [sec, k] of allEntries) { const kk = sec + ':' + k; if (dupKey.has(kk)) dup++; dupKey.add(kk); }
ok(dup === 0, `A4 allowlist に重複エントリが無い: ${dup} 件`);

const b = ALLOW.baseline || {};
const LIMITS = ALLOW.limits || {};
console.log(`  baseline: static=${b.static_unreachable} runtime=${b.runtime_unreachable} bindings=${b.dead_bindings} 関数総数=${b.top_level_functions}`);
console.log(`  現在    : static=${A.unreachableStatic.length} runtime=${A.unreachableRuntimeOnly.length} bindings=${A.deadBindings.length} 関数総数=${A.topLevelFunctionCount}`);
console.log(`  baseline との差: static=${A.unreachableStatic.length - b.static_unreachable} runtime=${A.unreachableRuntimeOnly.length - b.runtime_unreachable} bindings=${A.deadBindings.length - b.dead_bindings}`);
console.log(`  allowlist: ${allowCount(ALLOW)} 件 / 目安 ${LIMITS.allowlist_max}（超過は warn のみ）`);

ok(typeof LIMITS.allowlist_max === 'number' && LIMITS.allowlist_max > 0,
  'A5-0 allowlist の目安上限が limits.allowlist_max として外部化されている');
ok((LIMITS.reason || '').trim().length >= MIN_REASON,
  'A5-1 目安上限には理由が書かれている（引き上げがレビュー対象になる）');
ok(!V.errors.some((v) => v.rule === 'A5'), 'A5-2 上限超過は warn であり CI をブロックしない');

// =============================================================================
// 5. 面 × 変異の全表（受け入れ基準2）
//    対象ファイルの実在の死にコードに依存しないよう、**合成の死んだ関数を注入した
//    fixture** に対して行う（#798 の掃除が進んでも表は壊れない）。
// =============================================================================
console.log('=== 面 × 変異の全表 ===');

const DEAD = uniq('__reachFixtureDeadFn');
const FX = insertTopLevelJs(RAW, A, `function ${DEAD}(){ return 1; }`);
const FXA = analyze(FX);
const FX_ALLOW = clone(ALLOW);
FX_ALLOW.static.push({
  name: DEAD,
  category: 'temporarily-preserved',
  reason: '面 × 変異の全表が使う合成の死んだ関数（fixture・#799 PHASE1-REACH-001e / 2026-08-01）。対象ファイルの実在の死にコードに表が依存しないようにするためのもの。',
});
const FXV = evaluate(FXA, FX_ALLOW);

ok(FXA.unreachableStatic.some((x) => x.name === DEAD),
  `T-0a fixture の死んだ関数 ${DEAD} が注入され、到達不能として検出される`);
ok(FXV.errors.length === 0, `T-0b fixture の基準状態はエラー 0（実測 ${FXV.errors.length}: ${show(FXV.errors)}）`);
ok(insertCss(FX, FXA, '.__probe{}') !== null, 'T-0c <style> の位置を面から引けた');
const ON_SPANS = onAttrSpans(FXA);
ok(ON_SPANS.length >= 1, `T-0d 実在のインライン on*= 属性値を面から引けた: ${ON_SPANS.length} 件`);

// 死んだ関数が到達可能に戻る変異の期待: R5（掃除漏れ）が 1 件増えるだけ。
const REVIVE = { errors: { must: ['R5:' + DEAD], allowed: ['R5:' + DEAD] } };

const FACE_TABLE = [
  {
    face: 'HTML_TEXT', expect: '不変', bucket: 'markupRefs',
    label: '地の文に死んだ関数名を置く', marker: '__faceProbeText',
    apply: (s) => insertHtml(s, `<span>__faceProbeText ${DEAD} を廃止予定</span>`),
  },
  {
    face: 'HTML_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: 'HTML コメントに onclick="deadFn()" を書く', marker: '__faceProbeComment',
    apply: (s) => insertHtml(s, `<!-- __faceProbeComment <button onclick="${DEAD}()">旧導線</button> -->`),
  },
  {
    face: 'HTML_TAG', expect: '不変', bucket: 'markupRefs',
    // タグ名は英字始まりでないと HTML のタグにならないので `x-` を前置する。
    label: 'タグ名そのものに死んだ関数名を含める', marker: '__faceProbeTag',
    apply: (s) => insertHtml(s, `<span id="__faceProbeTag"></span><x-${DEAD}></x-${DEAD}>`),
  },
  {
    // ★ 3 版目が破られた面。属性名の前方一致で on* と誤認していた。
    face: 'ATTR_NAME', expect: '不変', bucket: 'markupRefs',
    label: '属性名に関数名を置く ＋ data-onclick="deadFn()"（3 版目の破れ方）',
    marker: '__faceProbeAttrName',
    apply: (s) => insertHtml(s, `<span id="__faceProbeAttrName" data-${DEAD}-legacy="1" data-onclick="${DEAD}()">x</span>`),
  },
  {
    // ★ 2 版目が破られた面。
    face: 'ATTR_VAL', expect: '不変', bucket: 'markupRefs',
    label: 'class="deadFn-pill"（2 版目の破れ方）', marker: '__faceProbeAttrVal',
    apply: (s) => insertHtml(s, `<span id="__faceProbeAttrVal" class="${DEAD}-pill">x</span>`),
  },
  {
    face: 'STYLE_CSS', expect: '不変', bucket: 'commentRefs',
    label: 'CSS に .deadFn{} を足す', marker: '__faceProbeCss',
    apply: (s) => insertCss(s, FXA, `.__faceProbeCss{display:none}\n.${DEAD}{color:red}`),
  },
  {
    face: 'RAWTEXT', expect: '不変', bucket: 'markupRefs',
    label: 'textarea の中身に関数名を置く', marker: '__faceProbeRawtext',
    apply: (s) => insertHtml(s, `<textarea id="__faceProbeRawtext">${DEAD}()</textarea>`),
  },
  {
    face: 'JS_STR_SQ', expect: '不変', bucket: 'stringRefs',
    label: '単引用符のログ文字列に関数名を置く（1 版目の破れ方）', marker: '__faceProbeSq',
    apply: (s) => insertTopLevelJs(s, FXA, `var __faceProbeSq='LOG: ${DEAD} は保存されませんでした';`),
  },
  {
    face: 'JS_STR_DQ', expect: '不変', bucket: 'stringRefs',
    label: '二重引用符の文字列に関数名を置く', marker: '__faceProbeDq',
    apply: (s) => insertTopLevelJs(s, FXA, `var __faceProbeDq="LOG: ${DEAD} は保存されませんでした";`),
  },
  {
    face: 'JS_TMPL_STR', expect: '不変', bucket: 'stringRefs',
    label: 'テンプレート文字列の中に関数名を置く', marker: '__faceProbeTmpl',
    apply: (s) => insertTopLevelJs(s, FXA, 'var __faceProbeTmpl=`LOG: ' + DEAD + ' ${String(1)}`;'),
  },
  {
    face: 'JS_LINE_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: '行コメントで関数名に言及する', marker: '__faceProbeLine',
    apply: (s) => insertTopLevelJs(s, FXA, `var __faceProbeLine=1; // ${DEAD}() は撤去済み`),
  },
  {
    face: 'JS_BLOCK_COMMENT', expect: '不変', bucket: 'commentRefs',
    label: 'ブロックコメントで関数名に言及する', marker: '__faceProbeBlock',
    apply: (s) => insertTopLevelJs(s, FXA, `var __faceProbeBlock=1; /* ${DEAD}() は撤去済み */`),
  },
  {
    face: 'JS_REGEX', expect: '不変', bucket: 'stringRefs',
    label: '正規表現リテラルに /deadFn/ を書く', marker: '__faceProbeRegex',
    apply: (s) => insertTopLevelJs(s, FXA, `var __faceProbeRegex=/${DEAD}/.test('x');`),
  },
  {
    face: 'ATTR_VAL_ON', expect: '到達化', spec: REVIVE,
    label: 'インライン onclick に死んだ関数を結線する', marker: '__faceProbeOn',
    apply: (s) => insertHtml(s, `<button id="__faceProbeOn" onclick="${DEAD}()">x</button>`),
  },
  {
    face: 'JS_CODE', expect: '到達化', spec: REVIVE,
    label: 'トップレベルの呼出を 1 行足す', marker: '__faceProbeCode',
    apply: (s) => insertTopLevelJs(s, FXA, `if(window.__faceProbeCode){${DEAD}();}`),
  },
  {
    face: 'JS_TMPL_DELIM', expect: '到達化', spec: REVIVE,
    label: 'テンプレートの ${} の中で呼ぶ', marker: '__faceProbeHole', probe: '${',
    apply: (s) => insertTopLevelJs(s, FXA, 'var __faceProbeHole=`${window.__faceProbeHoleX?' + DEAD + '():1}`;'),
  },
];

const coveredFaces = new Set(FACE_TABLE.map((t) => t.face));
const missingFaces = Object.keys(FACE).filter((f) => !coveredFaces.has(f));
ok(missingFaces.length === 0,
  `T-0e 面 × 変異の表が全 ${Object.keys(FACE).length} 面を覆っている（欠け: ${missingFaces.join(', ') || 'なし'}）`);

for (const t of FACE_TABLE) {
  const src = t.apply(FX);
  ok(src && src !== FX, `T[${t.face}]-1 変異が適用された（${t.label}）`);
  if (!src || src === FX) continue;
  const m = analyze(src);
  const v = evaluate(m, FX_ALLOW);

  const needle = t.probe || DEAD;
  const at = src.indexOf(t.marker);
  const pos = at >= 0 ? src.indexOf(needle, at) : -1;
  const got = pos >= 0 ? FACE_NAME[m._internal.face[pos]] : '(見つからない)';
  ok(got === t.face, `T[${t.face}]-2 差し込んだ「${needle}」がその面に載っている: 実測 ${got}`);

  if (t.expect === '不変') {
    ok(m.unreachableStatic.some((x) => x.name === DEAD),
      `T[${t.face}]-3 ${DEAD} は到達不能のまま（この面は参照として数えない）`);
    ok(m.rootNames.indexOf(DEAD) < 0, `T[${t.face}]-4 ${DEAD} はルートにならない`);
    ok(refCount(m, t.bucket, DEAD) > refCount(FXA, t.bucket, DEAD),
      `T[${t.face}]-5 その言及は ${t.bucket} として数えられている: ${refCount(FXA, t.bucket, DEAD)} → ${refCount(m, t.bucket, DEAD)}`);
    checkDelta(FXV, v, {}, `T[${t.face}]-6`);
  } else {
    ok(!m.unreachableStatic.some((x) => x.name === DEAD),
      `T[${t.face}]-3 ${DEAD} が到達可能になる（この面は参照として数える）`);
    checkDelta(FXV, v, t.spec, `T[${t.face}]-4`);
  }
}

// --- ATTR_NAME の値まで pin（data-onclick の値が ATTR_VAL_ON になったら 3 版目に戻る）---
{
  const src = insertHtml(FX, `<span id="__probeAttrName2" data-onclick="${DEAD}()">x</span>`);
  const m = analyze(src);
  const namePos = src.indexOf('data-onclick', src.indexOf('__probeAttrName2'));
  const valPos = src.indexOf(DEAD, namePos);
  ok(FACE_NAME[m._internal.face[namePos]] === 'ATTR_NAME',
    `T[ATTR_NAME]-7 data-onclick は属性名の面（実測 ${FACE_NAME[m._internal.face[namePos]]}）`);
  ok(FACE_NAME[m._internal.face[valPos]] === 'ATTR_VAL',
    `T[ATTR_NAME]-8 その値は ATTR_VAL であって ATTR_VAL_ON ではない（実測 ${FACE_NAME[m._internal.face[valPos]]}）`);
  ok(m.inlineHandlerCount === FXA.inlineHandlerCount,
    `T[ATTR_NAME]-9 インライン on*= の件数が増えない: ${FXA.inlineHandlerCount} → ${m.inlineHandlerCount}`);
}

// --- on* に見えるがイベント名ではない属性は root 化しない（001e・中）------------
{
  const src = insertHtml(FX, `<span id="__probeBogusOn" onbogus="${DEAD}()">x</span>`);
  const m = analyze(src);
  const p = src.indexOf(DEAD, src.indexOf('__probeBogusOn'));
  ok(FACE_NAME[m._internal.face[p]] === 'ATTR_VAL',
    `T[ATTR_VAL]-10 onbogus= の値は ATTR_VAL（実測 ${FACE_NAME[m._internal.face[p]]}・001d は on* 扱いで root 化した）`);
  ok(m.unreachableStatic.some((x) => x.name === DEAD), 'T[ATTR_VAL]-11 死んだ関数は到達不能のまま');
  checkDelta(FXV, evaluate(m, FX_ALLOW),
    { warnings: { must: ['R8:onbogus'], allowed: ['R8:onbogus'] } }, 'T[ATTR_VAL]-12');
}

// --- 実在の on* を複数行にしてもルートを失わない（3 版目はここで落ちた）---------
{
  const span = ON_SPANS[0];
  const src = FX.slice(0, span.start) + '\n      ' + FX.slice(span.start, span.end) + '\n    ' + FX.slice(span.end);
  const m = analyze(src);
  ok(m.htmlHandlerCount === FXA.htmlHandlerCount,
    `T[ATTR_VAL_ON]-13 複数行にしても on*= 属性の数は変わらない: ${FXA.htmlHandlerCount} → ${m.htmlHandlerCount}`);
  ok(m.rootNames.join(',') === FXA.rootNames.join(','),
    'T[ATTR_VAL_ON]-14 ルートの顔ぶれも変わらない（3 版目は属性値の改行で走査を打ち切っていた）');
  checkDelta(FXV, evaluate(m, FX_ALLOW), {}, 'T[ATTR_VAL_ON]-15');
}

// --- 派生パス: JS 文字列の中の on*= は参照として数える（罠(7)）------------------
{
  const NAME = uniq('__probeStrHandler');
  const src = insertTopLevelJs(FX, FXA,
    `function ${NAME}(){ return 1; }\n`
    + `function ${NAME}Wire(){ document.body.insertAdjacentHTML('beforeend','<button onclick="${NAME}()">go</button>'); }\n`
    + `${NAME}Wire();`);
  const m = analyze(src);
  const pos = src.indexOf(NAME, src.indexOf('beforeend'));
  ok(FACE_NAME[m._internal.face[pos]] === 'ATTR_VAL_ON',
    `T[JS_STR_SQ]-7 JS 文字列の中の on*= は派生パスで ATTR_VAL_ON へ昇格する（実測 ${FACE_NAME[m._internal.face[pos]]}）`);
  ok(!m.unreachableStatic.some((x) => x.name === NAME), 'T[JS_STR_SQ]-8 そこで結線した関数を到達不能と言わない');
  ok(m.derivedHandlerCount === FXA.derivedHandlerCount + 1,
    `T[JS_STR_SQ]-9 派生パスで拾った on*= が 1 件増える: ${FXA.derivedHandlerCount} → ${m.derivedHandlerCount}`);
}

// --- 派生パス: 一度も挿入されない「死んだテンプレート」は隠さず見せる（001e・高3a）--
{
  const src = insertTopLevelJs(FX, FXA, `var __probeDeadTemplate='<button onclick="${DEAD}()">go</button>';`);
  const m = analyze(src);
  ok(m.derivedOnlyReachable.indexOf(DEAD) >= 0,
    `T[JS_STR_SQ]-10 死んだテンプレート内の on*= で到達可能になった関数が derivedOnlyReachable に出る（実測 [${m.derivedOnlyReachable.join(', ')}]）`);
  checkDelta(FXV, evaluate(m, FX_ALLOW), {
    errors: { must: ['R5:' + DEAD], allowed: ['R5:' + DEAD] },
    warnings: { must: ['R6:' + DEAD], allowed: ['R6:' + DEAD] },
  }, 'T[JS_STR_SQ]-11');
}

// --- 派生パス: ASI 越境（セミコロン無しの独立2文）で連結しない（001e・高3b）------
{
  const src = insertTopLevelJs(FX, FXA,
    'function __probeAsiWire(){\n'
    + "  var a = '<button onclick=\"'\n"
    + `  var bb = '${DEAD}()">go</button>'\n`
    + '  document.body.innerHTML = a + bb\n'
    + '}\n__probeAsiWire();');
  const m = analyze(src);
  const pos = src.indexOf(DEAD, src.indexOf('__probeAsiWire'));
  ok(FACE_NAME[m._internal.face[pos]] === 'JS_STR_SQ',
    `T[JS_STR_SQ]-12 独立した 2 文をまたいで連結しない（実測 ${FACE_NAME[m._internal.face[pos]]}・001d は ATTR_VAL_ON へ昇格していた）`);
  ok(m.unreachableStatic.some((x) => x.name === DEAD), 'T[JS_STR_SQ]-13 死んだ関数は到達不能のまま');
  checkDelta(FXV, evaluate(m, FX_ALLOW), {}, 'T[JS_STR_SQ]-14');
}

// --- 派生パス: 連結上限の境界（文書と実測を一致させる）--------------------------
{
  // オペランドは `String('xxx…')` ＝ gap + 10 文字。上限の内側 / 外側を両方測る。
  const wire = (gap) => insertTopLevelJs(FX, FXA,
    `function ${DEAD}Wire(){ document.body.insertAdjacentHTML('beforeend','<button onclick="'+String('${'x'.repeat(gap)}')+'${DEAD}()">go</button>'); }\n`
    + `${DEAD}Wire();`);
  const inGap = CONCAT_SKIP_LIMIT - 10 - 4;
  const overGap = CONCAT_SKIP_LIMIT - 10 + 4;
  const mIn = analyze(wire(inGap));
  const mOver = analyze(wire(overGap));
  ok(!mIn.unreachableStatic.some((x) => x.name === DEAD),
    `CONCAT-BOUNDARY-1 オペランド ${inGap + 10} 文字（上限 ${CONCAT_SKIP_LIMIT} の内側）なら結線を拾う`);
  ok(mOver.unreachableStatic.some((x) => x.name === DEAD),
    `CONCAT-BOUNDARY-2 オペランド ${overGap + 10} 文字（上限の外側）では拾わない`);
  ok(mOver.concatTruncations.length > FXA.concatTruncations.length,
    `CONCAT-BOUNDARY-3 打ち切りは黙って起きず concatTruncations に記録される: ${FXA.concatTruncations.length} → ${mOver.concatTruncations.length}`);
  const vOver = evaluate(mOver, FX_ALLOW);
  ok(vOver.warnings.some((x) => x.rule === 'R7'), 'CONCAT-BOUNDARY-4 打ち切りは warn（R7）として見える');
  checkDelta(FXV, vOver, {
    warnings: { must: [], allowed: vOver.warnings.filter((x) => x.rule === 'R7').map(sig) },
  }, 'CONCAT-BOUNDARY-5 打ち切りで error は増えない（生きた関数を R1 にしない）');
}

// --- 派生パス: \xNN / \uXXXX で書かれた結線も復号して拾う（001e・中）------------
{
  const NAME = uniq('__probeEscHandler');
  const src = insertTopLevelJs(FX, FXA,
    `function ${NAME}(){ return 1; }\n`
    + `function ${NAME}Wire(){ document.body.insertAdjacentHTML('beforeend','\\x3cbutton onclick=\\u0022${NAME}()\\u0022\\x3ego\\x3c/button\\x3e'); }\n`
    + `${NAME}Wire();`);
  ok(!analyze(src).unreachableStatic.some((x) => x.name === NAME),
    'ESCAPE-1 \\xNN / \\uXXXX で書かれた on*= 結線も復号して拾う（001d は落としていた）');
}

// =============================================================================
// 6. 変異検証 — 「壊れたら本当に落ちるか」
// =============================================================================
console.log('=== 変異検証（検査自体の検算） ===');

const before = RAW;
// 変異で波及しうる warn の上限（差分照合の allowed 集合）
const ALL_NAMES = [...A._internal.byName.keys()];
const WARN_UNIVERSE = ALL_NAMES.flatMap((n) => ['R2:' + n, 'R5:' + n, 'R6:' + n])
  .concat(A.deadBindings.map((d) => 'R5:' + d.selector));
const WARN_REMOVABLE = A.deadBindings.map((d) => 'R3:' + d.selector)
  .concat(A.unreachableRuntimeOnly.map((x) => 'R2:' + x.name));

// 生きているルートのうち「参照が 1 箇所だけ」のものを 1 つ選ぶ（＝そこを潰せば必ず死ぬ）。
const soleRoot = (() => {
  for (const name of A.rootNames) {
    const sites = A._internal.refSites.get(name) || [];
    if (sites.length === 1 && sites[0].owner === null && sites[0].face === 'JS_CODE') {
      return { name, pos: sites[0].pos };
    }
  }
  return null;
})();
ok(!!soleRoot, 'M1-0 参照が 1 箇所だけの生きたルートを構造から選べた');
let m1 = null;
if (soleRoot) {
  const m1Src = RAW.slice(0, soleRoot.pos) + '__reachRemovedCall' + RAW.slice(soleRoot.pos + soleRoot.name.length);
  m1 = analyze(m1Src);
  const m1v = evaluate(m1, ALLOW);
  ok(m1.rootNames.indexOf(soleRoot.name) < 0, `M1-1 ${soleRoot.name} がルートから消える`);
  ok(m1.unreachableStatic.some((x) => x.name === soleRoot.name),
    `M1-2 ${soleRoot.name} が到達不能として検出される`);
  checkDelta(V, m1v, {
    errors: { must: ['R1:' + soleRoot.name], allowed: closureOf(A, soleRoot.name).map((n) => 'R1:' + n) },
    warnings: { must: [], allowed: WARN_UNIVERSE },
    warningsRemoved: { must: [], allowed: WARN_REMOVABLE },
  }, 'M1-3');
}

// --- M2: 実在のインライン onclick を取り除く ---------------------------------
{
  const span = onAttrSpans(A)[0];
  ok(!!span, 'M2-0 実在のインライン on*= 属性値を面から引けた');
  if (span) {
    const called = RAW.slice(span.start, span.end).match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
    const victim = called.find((n) => A._internal.byName.has(n));
    ok(!!victim, `M2-1 その属性値が呼んでいるトップレベル関数を特定できた: ${victim}`);
    if (victim) {
      const m2 = analyze(RAW.slice(0, span.start) + RAW.slice(span.end));
      ok(m2.unreachableStatic.some((x) => x.name === victim), `M2-2 ${victim} が到達不能として検出される`);
      checkDelta(V, evaluate(m2, ALLOW), {
        errors: { must: ['R1:' + victim], allowed: closureOf(A, victim).map((n) => 'R1:' + n) },
        warnings: { must: [], allowed: WARN_UNIVERSE },
        warningsRemoved: { must: [], allowed: WARN_REMOVABLE },
      }, 'M2-3');
    }
  }
}

// --- M3: 生きている結線先の id を描画しなくする（検査2＝warn の変異）-----------
const cand = (() => {
  const dead = new Set(A.deadBindings.map((d) => d.selector));
  for (const s of selectorSites(RAW, A)) {
    if (dead.has('#' + s.id)) continue;
    const tag = 'id="' + s.id + '"';
    if (RAW.split(tag).length - 1 !== 1) continue;
    const esc = s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const total = (RAW.match(new RegExp('(?<![A-Za-z0-9_$-])' + esc + '(?![A-Za-z0-9_$-])', 'g')) || []).length;
    const selCount = (RAW.match(new RegExp("getElementById\\(\\s*'" + esc + "'\\s*\\)", 'g')) || []).length;
    if (total === selCount + 1) return { id: s.id, tag };
  }
  return null;
})();
ok(!!cand, 'M3-0 変異対象の live な id を 1 つ選べた');
if (cand) {
  const m3 = analyze(RAW.replace(cand.tag, 'id="' + cand.id + '-phase1reach-mutated"'));
  const m3v = evaluate(m3, ALLOW);
  ok(m3.deadBindings.some((d) => d.selector === '#' + cand.id), `M3-1 #${cand.id} が死んだ結線として検出される`);
  // 降格後: 報告は warn 側にだけ出て、CI をブロックする errors は増えない。
  checkDelta(V, m3v, {
    warnings: { must: ['R3:#' + cand.id], allowed: ['R3:#' + cand.id].concat(WARN_UNIVERSE) },
  }, 'M3-2');
}

// --- M4: allowlist から 1 件外す ---------------------------------------------
{
  const m4Allow = clone(ALLOW);
  const dropped = m4Allow.static.shift();
  ok(!!dropped, 'M4-0 allowlist（static）から 1 件外した');
  checkDelta(V, evaluate(A, m4Allow), {
    errors: { must: ['R1:' + dropped.name], allowed: ['R1:' + dropped.name] },
  }, 'M4-1');
}

// --- M5: allowlist の理由を骨抜きにする（形式照合の検算）-----------------------
for (const f of [
  { tag: 'a', label: '空欄', mutate: (e) => { e.reason = ''; } },
  { tag: 'b', label: `${MIN_REASON} 文字ダミー`, mutate: (e) => { e.reason = 'x'.repeat(MIN_REASON); } },
  { tag: 'c', label: '根拠参照なし（長文）', mutate: (e) => { e.reason = '暫定的に温存する。あとで判断する。理由はとくに書かない。'; } },
  { tag: 'd', label: '未知の category', mutate: (e) => { e.category = 'whatever'; } },
]) {
  const a5 = clone(ALLOW);
  f.mutate(a5.static[0]);
  checkDelta(V, evaluate(A, a5), {
    errors: { must: ['R4:' + a5.static[0].name], allowed: ['R4:' + a5.static[0].name] },
  }, `M5${f.tag}-1（${f.label}）`);
}

// --- M6 / M8: 死んだ関数の名前を文字列 / コメントに置く（3 形ずつ）-------------
const FX_DEAD = FXA._internal.describe(DEAD);
for (const f of [
  { tag: 'a', label: '単引用符', code: (n) => `var __m6a='REACH-M6-${n}-'+String(1);` },
  { tag: 'b', label: '二重引用符', code: (n) => `var __m6b="REACH-M6-${n}-"+String(1);` },
  { tag: 'c', label: 'テンプレートリテラル', code: (n) => 'var __m6c=`REACH-M6-' + n + '-${String(1)}`;' },
]) {
  const m = analyze(insertTopLevelJs(FX, FXA, f.code(DEAD)));
  const info = m.unreachableStatic.find((x) => x.name === DEAD);
  ok(!!info, `M6${f.tag}-1 ${f.label}の文字列に名前を置いても到達不能のまま`);
  ok(!!info && info.stringRefs > FX_DEAD.stringRefs, `M6${f.tag}-2 その名前は確かに${f.label}の文字列の中にある`);
  checkDelta(FXV, evaluate(m, FX_ALLOW), {}, `M6${f.tag}-3`);
}
for (const f of [
  { tag: 'a', label: '行コメント', apply: (n) => insertTopLevelJs(FX, FXA, `var __m8a=1; // ${n}() は撤去済み`) },
  { tag: 'b', label: 'ブロックコメント', apply: (n) => insertTopLevelJs(FX, FXA, `var __m8b=1; /* ${n}() は撤去済み */`) },
  { tag: 'c', label: 'HTML コメント', apply: (n) => insertHtml(FX, `<!-- ${n}() はここで言及されるだけ -->`) },
]) {
  const m = analyze(f.apply(DEAD));
  const info = m.unreachableStatic.find((x) => x.name === DEAD);
  ok(!!info, `M8${f.tag}-1 ${f.label}に名前を置いても到達不能のまま`);
  ok(!!info && info.commentRefs > FX_DEAD.commentRefs, `M8${f.tag}-2 その名前は確かに${f.label}の中にある`);
  checkDelta(FXV, evaluate(m, FX_ALLOW), {}, `M8${f.tag}-3`);
}

// --- M7: 連結 ID の生成側を別名に変える（罠(5)・検査2＝warn）------------------
function listConcatPrefixes(src, a) {
  const face = a._internal.face;
  const prefixes = new Set();
  for (const m of src.matchAll(/getElementById\(\s*'([^']*)'\s*\+/g)) if (face[m.index] === FACE.JS_CODE) prefixes.add(m[1]);
  for (const m of src.matchAll(/getElementById\(\s*"([^"]*)"\s*\+/g)) if (face[m.index] === FACE.JS_CODE) prefixes.add(m[1]);
  const out = [];
  for (const p of [...prefixes].sort()) {
    if (p.length < MIN_SELECTOR_PREFIX) continue;
    const gen = 'id="' + p;
    const genCount = src.split(gen).length - 1;
    if (genCount < 1) continue;
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let produced = 0;
    for (const m of src.matchAll(re)) {
      const nm = FACE_NAME[face[m.index]];
      if (nm === 'HTML_COMMENT' || nm === 'JS_LINE_COMMENT' || nm === 'JS_BLOCK_COMMENT' || nm === 'STYLE_CSS') continue;
      if (/getElementById\(\s*['"]$/.test(src.slice(Math.max(0, m.index - 24), m.index))) continue;
      produced++;
    }
    if (produced === genCount) out.push({ prefix: p, gen, genCount });
  }
  return out;
}
const concats = listConcatPrefixes(RAW, A);
console.log(`  連結 ID 接頭辞（変異対象）: ${concats.length} 件 / MIN_SELECTOR_PREFIX=${MIN_SELECTOR_PREFIX}`);
for (const c of concats) {
  const renamed = c.prefix.slice(0, -1) + 'Phase1ReachMutated' + c.prefix.slice(-1);
  const m = analyze(RAW.split(c.gen).join('id="' + renamed));
  const v = evaluate(m, ALLOW);
  const sel = '#' + c.prefix + '*';
  ok(m.deadBindings.some((d) => d.selector === sel), `M7[${c.prefix}]-1 ${sel} が死んだ結線として検出される`);
  ok(v.warnings.some((x) => x.rule === 'R3' && x.subject === sel), `M7[${c.prefix}]-2 warn として報告される（検査2）`);
  ok(A.deadBindings.every((d) => d.selector !== sel), `M7[${c.prefix}]-3 変異前は ${sel} が死んでいない＝この変異だけが原因`);
}

// --- M10: 死んだ関数の名前を HTML 属性値に置く（罠(6)・2 版目の破れ方）---------
for (const f of [
  { tag: 'a', label: 'data-*', attr: (n) => `data-x="${n}-legacy"` },
  { tag: 'b', label: 'class', attr: (n) => `class="${n}-pill"` },
  { tag: 'c', label: 'id', attr: (n) => `id="${n}-legacy-marker"` },
]) {
  const m = analyze(insertHtml(FX, `<span ${f.attr(DEAD)}>x</span>`));
  ok(refCount(m, 'markupRefs', DEAD) > refCount(FXA, 'markupRefs', DEAD),
    `M10${f.tag}-1 名前が HTML マークアップの中に増えている（${f.label}）`);
  ok(m.unreachableStatic.some((x) => x.name === DEAD), `M10${f.tag}-2 それでも到達不能のまま`);
  checkDelta(FXV, evaluate(m, FX_ALLOW), {}, `M10${f.tag}-3`);
}

// --- M11: 起動経路を復活させる（罠(8)・検査2＝warn）----------------------------
pinIf(A.deadBindings.find((d) => d.reason === 'no-live-activation'),
  'M11 起動経路なしの結線が現存しない', (d) => {
    const id = d.selector.slice(1);
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mt = new RegExp('<input\\b[^>]*\\bid\\s*=\\s*["\']' + esc + '["\'][^>]*>').exec(RAW);
    ok(!!mt, `M11-0 ${d.selector} の要素を構造から引けた`);
    if (mt) {
      const m11 = analyze(RAW.slice(0, mt.index) + `<label for="${id}">読み込み</label>` + RAW.slice(mt.index));
      ok(!m11.deadBindings.some((x) => x.selector === d.selector),
        `M11-1 <label for> を足すと ${d.selector} が死んだ結線ではなくなる`);
      // 掃除漏れは warn 側にだけ出る（errors は増えない）
      checkDelta(V, evaluate(m11, ALLOW), {
        warnings: { must: ['R5:' + d.selector], allowed: ['R5:' + d.selector].concat(WARN_UNIVERSE) },
        warningsRemoved: { must: [], allowed: WARN_REMOVABLE },
      }, 'M11-2');
    }
  });

// --- A5 の経路そのものを検算する（上限超過 → warn で、error にはならない）------
{
  const a5 = clone(ALLOW);
  a5.limits = Object.assign({}, a5.limits, { allowlist_max: 1 });
  checkDelta(V, evaluate(A, a5), {
    warnings: { must: ['A5:allowlist'], allowed: ['A5:allowlist'] },
  }, 'A5-3 上限超過は warn 1 件だけ（error は増えない）');
}

// =============================================================================
// 7. 偽陽性の検証 — 「生きているものを死んだと言わない」
// =============================================================================
console.log('=== 偽陽性の検証（等価な書き換えで落ちないこと） ===');

// --- FP-1: インライン onclick で結線した生きた関数を 1 本足す ----------------
{
  const NAME = uniq('__reachProbeAliveFn');
  const m = analyze(insertHtml(insertTopLevelJs(RAW, A, `function ${NAME}(){ return 1; }`),
    `<button type="button" onclick="${NAME}()">probe</button>`));
  ok(m.topLevelFunctionCount === A.topLevelFunctionCount + 1,
    `FP-1-1 追加した関数がトップレベル関数として検出される: ${A.topLevelFunctionCount} → ${m.topLevelFunctionCount}`);
  ok(m.rootNames.indexOf(NAME) >= 0, 'FP-1-2 インライン onclick からルートとして拾われる');
  checkDelta(V, evaluate(m, ALLOW), {}, 'FP-1-3');
}

// --- FP-2: 文字列で組み立てた HTML の onclick 結線（罠(7)・派生パス）--------
for (const f of [
  { tag: 'a', label: 'insertAdjacentHTML（二重引用符）', wire: (n) => `document.body.insertAdjacentHTML('beforeend','<button onclick="${n}()">go</button>');` },
  { tag: 'b', label: 'insertAdjacentHTML（単引用符）', wire: (n) => `document.body.insertAdjacentHTML("beforeend","<button onclick='${n}()'>go</button>");` },
  { tag: 'c', label: 'テンプレートリテラル', wire: (n) => 'document.body.innerHTML += `<button onclick="' + n + '()">go</button>`;' },
  { tag: 'd', label: 'onchange 属性', wire: (n) => `document.body.insertAdjacentHTML('beforeend','<select onchange="${n}()"></select>');` },
  { tag: 'e', label: '文字列連結で式を挟む', wire: (n) => `document.body.insertAdjacentHTML('beforeend','<button data-k="'+String(1)+'" onclick="${n}()">go</button>');` },
  { tag: 'f', label: 'エスケープした引用符', wire: (n) => `document.body.insertAdjacentHTML("beforeend","<button onclick=\\"${n}()\\">go</button>");` },
]) {
  const NAME = uniq('__reachProbe2' + f.tag);
  const m = analyze(insertTopLevelJs(RAW, A,
    `function ${NAME}(){ return 1; }\nfunction ${NAME}Wire(){ ${f.wire(NAME)} }\n${NAME}Wire();`));
  ok(!m.unreachableStatic.some((x) => x.name === NAME),
    `FP-2${f.tag}-1 ${f.label}で結線した関数を到達不能と言わない`);
  ok(!m.unreachableStatic.some((x) => x.name === NAME + 'Wire'),
    `FP-2${f.tag}-2 その結線を行う関数も到達可能`);
  checkDelta(V, evaluate(m, ALLOW), {
    warnings: { must: [], allowed: ['R6:' + NAME, 'R6:' + NAME + 'Wire'] },
  }, `FP-2${f.tag}-3`);
}

// --- セレクタ関連の anchor を構造から引く ------------------------------------
const liveSite = (() => {
  const dead = new Set(A.deadBindings.map((d) => d.selector));
  return selectorSites(RAW, A).find((s) => !dead.has('#' + s.id) && A._internal.ownerOf(s.pos) !== null);
})();
// FP-4 / FP-8 は「セレクタ・ヘルパへの抽出で検出が消えるか」を見るので、
// **死んだ結線を実際に含むトップレベル関数**を対象にする（構造から引く）。
const heavyFn = (() => {
  const owners = new Map();
  for (const d of A.deadBindings) {
    const o = A._internal.ownerOf(d.pos);
    if (o) owners.set(o, (owners.get(o) || 0) + 1);
  }
  let best = null;
  for (const [n] of owners) {
    const c = selectorSites(RAW, A).filter((s) => A._internal.ownerOf(s.pos) === n).length;
    if (c >= 1 && (!best || c > best.c)) best = { n, c };
  }
  return best;
})();

// --- FP-3: getElementById → 受け手つき querySelector の等価置換 --------------
ok(!!liveSite, 'FP-3-0 生きたセレクタ呼出を構造から引けた');
if (liveSite) {
  const m = analyze(RAW.slice(0, liveSite.pos)
    + `(document.body||document).querySelector('#${liveSite.id}')` + RAW.slice(liveSite.end));
  ok(m.deadBindings.length === A.deadBindings.length,
    `FP-3-1 死んだ結線の件数が変わらない: ${A.deadBindings.length} → ${m.deadBindings.length}`);
  checkDelta(V, evaluate(m, ALLOW), {}, 'FP-3-2');
}

// --- FP-4 / FP-8: セレクタ・ヘルパへの抽出（関数宣言 / 関数式）----------------
function extractHelper(src, a, fnName, helperName, decl) {
  const span = functionSpan(src, a, fnName);
  if (!span || span.start < 0) return null;
  const body = src.slice(span.start, span.bodyEnd + 1);
  const n = (body.match(/document\.getElementById\(/g) || []).length;
  if (!n) return null;
  return {
    n,
    src: src.slice(0, span.start) + decl
      + body.replace(/document\.getElementById\(/g, helperName + '(')
      + src.slice(span.bodyEnd + 1),
  };
}
ok(!!heavyFn && heavyFn.c >= 3,
  `FP-4-0 セレクタ呼出を多く含む関数を構造から引けた: ${heavyFn ? heavyFn.n + '（' + heavyFn.c + ' 箇所）' : 'なし'}`);
if (heavyFn) {
  const fp4 = extractHelper(RAW, A, heavyFn.n, '$id', 'function $id(id){return document.getElementById(id);}\n');
  ok(!!fp4, 'FP-4-1 トップレベル関数のヘルパ $id() へ抽出した');
  if (fp4) {
    const m = analyze(fp4.src);
    ok((m.selectorAliases || []).indexOf('$id') >= 0, 'FP-4-2 $id がセレクタの別名として認識される');
    ok(m.deadBindings.length === A.deadBindings.length,
      `FP-4-3 死んだ結線の検出が消えない: ${A.deadBindings.length} → ${m.deadBindings.length}`);
    checkDelta(V, evaluate(m, ALLOW), {}, 'FP-4-4');
  }
  // FP-8: 関数式のヘルパ。別名として認識できず検査2 の検出が消える＝ 3 版目の「詰み」。
  const fp8 = extractHelper(RAW, A, heavyFn.n, '__byId', 'var __byId=function(id){return document.getElementById(id);};\n');
  ok(!!fp8, 'FP-8-0 同じ抽出を関数式（var __byId=function…）で行った');
  if (fp8) {
    const m = analyze(fp8.src);
    const v = evaluate(m, ALLOW);
    ok((m.selectorAliases || []).indexOf('__byId') < 0,
      'FP-8-1 関数式のヘルパは別名として認識されない（静的走査の限界。ここは直せない）');
    ok(m.deadBindings.length < A.deadBindings.length,
      `FP-8-2 その結果、検査2 の検出が消える: ${A.deadBindings.length} → ${m.deadBindings.length}`);
    ok(v.warnings.filter((x) => x.rule === 'R5').length >= 1,
      `FP-8-3 掃除漏れ（R5）が warn として出る: ${v.warnings.filter((x) => x.rule === 'R5').length} 件 ＝ 3 版目ではこれが全部 FAIL で allowlist に足しても消せなかった`);
    ok(staticNames(m) === BASE_STATIC, 'FP-8-4 検査1（静的到達可能性）は影響を受けない');
    checkDelta(V, v, {
      warnings: { must: [], allowed: WARN_UNIVERSE },
      warningsRemoved: { must: [], allowed: WARN_REMOVABLE },
    }, 'FP-8-5');
  }
}

// --- FP-5: 存在しない id への防御的ルックアップ -------------------------------
const FP5_ID = uniq('__reachFeatureFlagPanel');
const fp5Src = insertTopLevelJs(RAW, A,
  `var __ff=document.getElementById('${FP5_ID}');\nif(__ff){__ff.style.display='none';}`);
const fp5 = analyze(fp5Src);
ok(fp5.unreachableRuntimeOnly.length === A.unreachableRuntimeOnly.length,
  `FP-5-1 実行時到達不能が増えない: ${A.unreachableRuntimeOnly.length} → ${fp5.unreachableRuntimeOnly.length}（初版は死んだ領域がファイル末尾まで伸びて爆発した）`);
ok(staticNames(fp5) === BASE_STATIC, 'FP-5-2 静的到達不能も増えない');
checkDelta(V, evaluate(fp5, ALLOW), {
  warnings: { must: ['R3:#' + FP5_ID], allowed: ['R3:#' + FP5_ID].concat(WARN_UNIVERSE) },
}, 'FP-5-3');

// --- FP-6: 意図的な温存を 1 件足したとき、allowlist 追記だけで緑にできる ------
if (m1) {
  const fp6Allow = clone(ALLOW);
  for (const v of evaluate(m1, ALLOW).errors.filter((x) => x.rule === 'R1')) {
    fp6Allow.static.push({
      name: v.subject,
      category: 'temporarily-preserved',
      reason: 'FP-6 の検証用エントリ（#799 / 2026-08-01）。意図的な温存が 1 件増えたときに allowlist への追記だけで緑にできることを確かめる。',
    });
  }
  const fp6v = evaluate(m1, fp6Allow);
  ok(fp6v.errors.length === 0,
    `FP-6-1 allowlist への追記だけで緑にできる: 残りエラー ${fp6v.errors.length} 件（${show(fp6v.errors)}）`);
}

// --- FP-7: `||` フォールバックを 1 行足す（差し戻し 3 回目の基準②）-----------
if (liveSite) {
  const FB_ID = uniq('__reachFallbackAbsent');
  const m = analyze(RAW.slice(0, liveSite.end)
    + `||document.getElementById('${FB_ID}')` + RAW.slice(liveSite.end));
  const v = evaluate(m, ALLOW);
  ok(m.deadBindings.length === A.deadBindings.length + 1,
    `FP-7-1 検査2 はフォールバック側を死んだ結線として報告する（原理的な偽陽性）: ${A.deadBindings.length} → ${m.deadBindings.length}`);
  ok(staticNames(m) === BASE_STATIC, 'FP-7-2 検査1 は影響を受けない');
  ok(v.warnings.some((x) => x.rule === 'R3' && x.subject === '#' + FB_ID),
    'FP-7-3 その偽陽性は warn として見える（消すのではなく降格した）');
  checkDelta(V, v, {
    warnings: {
      must: ['R3:#' + FB_ID],
      allowed: ['R3:#' + FB_ID].concat(WARN_UNIVERSE),
    },
  }, 'FP-7-4');
}

// =============================================================================
// 8. 既知の限界を固定する（lib ヘッダの KL-*）
// =============================================================================
console.log('=== 既知の限界の固定 ===');
const faceOf = (code, needle) => {
  const s = '<script>' + code + '</script>';
  return FACE_NAME[classifyFaces(s)[s.indexOf(needle)]];
};
ok(faceOf('function __kl1(){ if(1){} /re/.test("x"); }', '/re/') === 'JS_CODE',
  'KL-1 `}` 直後の文頭正規表現は除算扱い（正規表現としては読まない）');
ok(faceOf('var a=1; <!-- x\nvar b=2;', '<!--') === 'JS_CODE',
  'KL-2 <script> 内の <!-- は JS コードとして読み続ける（escaped script data 未対応）');
{
  const s = '<button onclick="fn&#40;&#41;">x</button>';
  ok(FACE_NAME[classifyFaces(s)[s.indexOf('&#40;')]] === 'ATTR_VAL_ON',
    'KL-3 on* 属性値の中の HTML エンティティは復号しない（実体参照で書かれた呼出は読めない）');
}
{
  const NAME = uniq('__reachProbeNested');
  const wire = `document.body.insertAdjacentHTML('beforeend','<div><scr'+'ipt>document.write("<b onclick=\\'${NAME}()\\'>x</b>")</scr'+'ipt></div>');`;
  const src = insertTopLevelJs(RAW, A,
    `function ${NAME}(){ return 1; }\nfunction ${NAME}Wire(){ ${wire} }\n${NAME}Wire();`);
  ok(analyze(src).unreachableStatic.some((x) => x.name === NAME),
    'KL-4 JS 文字列の中の <script> の中の文字列に書いた on*= は拾わない（再帰は 1 段）');
}
// 001e で直した点（限界ではなくなったことを固定する）
ok(faceOf("function __p(){ if(x) /['\"]/.test(s); var live=1; }", "/['") === 'JS_REGEX',
  'KL-5 制御構文の `)` 直後は正規表現として読む（001d は除算扱いだった）');
ok(faceOf("function __p(){ if(x) /['\"]/.test(s); var live=1; }", 'var live') === 'JS_CODE',
  'KL-5b その結果、後続の生きたコードが文字列面に飲まれない');
ok(faceOf('function __p(){ var z=f(a) /2/ g; }', '/2/') === 'JS_CODE',
  'KL-6 関数呼出の `)` 直後は除算のまま');
ok(faceOf('function __p(){ var i=0; i++ /2/ g; }', '/2/') === 'JS_CODE',
  'KL-7 `++` 直後は除算（001d は正規表現として読んでいた）');
ok(ON_EVENT_ATTRS.has('onclick') && ON_EVENT_ATTRS.has('onpointerdown') && !ON_EVENT_ATTRS.has('onbogus'),
  `KL-8 on* は実イベント名の有限リスト（${ON_EVENT_ATTRS.size} 件）。未知の on* は R8 で報告する`);

// --- label-for も面で門番する（001e・自己申告2 の解消）------------------------
pinIf(A.deadBindings.find((d) => d.reason === 'no-live-activation'),
  'GATE-1 起動経路なしの結線が現存しない', (d) => {
    const id = d.selector.slice(1);
    const m = analyze(insertHtml(RAW, `<!-- <label for="${id}">x</label> -->`));
    ok(m.deadBindings.some((x) => x.selector === d.selector),
      `GATE-1 コメントの中の <label for> では検出が消えない（001d は消えた）: ${d.selector}`);
  });

// =============================================================================
// 9. 変異が本体を汚していないこと
// =============================================================================
ok(RAW === before, 'M9 変異検証は全てメモリ上のコピーに対して行われ、読み込んだ原文は不変');
ok(fs.readFileSync(target, 'utf8') === before, `M9b ${target} はディスク上でも 1 バイトも変わっていない`);

function finish() {
  console.log(`PHASE1-REACH-001: PASS=${pass} FAIL=${fail} WARN2=${V.warnings.length}`);
  process.exit(fail === 0 ? 0 : 1);
}

// =============================================================================
// 10. 「実際にコミットしても緑」の実測（受け入れ基準1・7）
//     4 つの正当な編集 ＋ 検査2 だけが違反する状態に対して、**本スイート全体**を
//     子プロセスで走らせ、exit=0 を確かめる。ハーネス自身の anchor が壊れないことは
//     ここでしか証明できない（001d はこの 4 操作すべてで赤くなった）。
// =============================================================================
if (CHILD) finish();

console.log('=== 実際の編集に対する耐性（本スイートを子プロセスで再実行） ===');

// 削除しても他へ波及しない死にコードを 1 件選ぶ（allowlist 掃除とセット）。
function pickRemovableDeadFn() {
  const allowNames = new Set((ALLOW.static || []).map((e) => e.name));
  for (const d of A.unreachableStatic) {
    if (!allowNames.has(d.name)) continue;
    const span = functionSpan(RAW, A, d.name);
    if (!span || span.start < 0) continue;
    const src = RAW.slice(0, span.start) + RAW.slice(span.bodyEnd + 1);
    const expect = A.unreachableStatic.filter((x) => x.name !== d.name).map((x) => x.name).join(',');
    if (staticNames(analyze(src)) === expect) return { name: d.name, src };
  }
  return null;
}

const OPS = [];
{
  const NAME = uniq('__opNewButtonHandler');
  OPS.push({
    label: '①新規ボタンをインライン onclick で 1 個追加',
    src: insertHtml(insertTopLevelJs(RAW, A, `function ${NAME}(){ return 1; }`),
      `<button type="button" onclick="${NAME}()">new</button>`),
  });
}
OPS.push({
  label: '②新規 script ブロックを追加',
  src: insertHtml(RAW, '<script>\nfunction __opExtraFn(){ return 1; }\n__opExtraFn();\n<\/script>\n'),
});
if (heavyFn) {
  const fp4 = extractHelper(RAW, A, heavyFn.n, '$id', 'function $id(id){return document.getElementById(id);}\n');
  if (fp4) {
    // FP-4（$id 抽出）と FP-7（|| フォールバック）が「安全」と証明したリファクタを実施する。
    const a2 = analyze(fp4.src);
    const dead2 = new Set(a2.deadBindings.map((d) => d.selector));
    const site2 = selectorSites(fp4.src, a2).find((s) => !dead2.has('#' + s.id));
    if (site2) {
      OPS.push({
        label: '③FP-4/FP-7 が安全と証明したリファクタを実際に施す',
        src: fp4.src.slice(0, site2.end)
          + `||document.querySelector('#${site2.id}')` + fp4.src.slice(site2.end),
      });
    }
  }
}
{
  const dead = pickRemovableDeadFn();
  ok(!!dead, 'E2E-0 削除できる死にコードを 1 件選べた');
  if (dead) {
    const allow2 = clone(ALLOW);
    allow2.static = allow2.static.filter((e) => e.name !== dead.name);
    OPS.push({ label: `④死にコード ${dead.name} を削除し allowlist も掃除`, src: dead.src, allow: allow2 });
  }
}
OPS.push({
  label: '⑤検査2 だけが違反する状態（exit code に効かないことの実測）',
  src: fp5Src,
  expectWarn: '#' + FP5_ID,
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach001e-'));
const jobs = OPS.map((op, i) => {
  const html = path.join(dir, `op${i}.html`);
  fs.writeFileSync(html, op.src, 'utf8');
  const env = Object.assign({}, process.env, { REACH_CHILD: '1' });
  if (op.allow) {
    const ap = path.join(dir, `op${i}.allow.json`);
    fs.writeFileSync(ap, JSON.stringify(op.allow, null, 2), 'utf8');
    env.REACH_ALLOWLIST = ap;
  }
  return new Promise((resolve) => {
    execFile(process.execPath, [__filename, html],
      { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        op,
        code: err ? (err.code === undefined ? -1 : err.code) : 0,
        out: (stdout || '') + (stderr || ''),
      }));
  });
});

Promise.all(jobs).then((results) => {
  for (const r of results) {
    const tail = (r.out.match(/PASS=\d+ FAIL=\d+ WARN2=\d+/) || ['(最終行なし)'])[0];
    ok(r.code === 0, `E2E[${r.op.label}] exit=0（実測 ${r.code} / ${tail}）`);
    if (r.code !== 0) {
      for (const line of r.out.split('\n').filter((l) => l.indexOf('FAIL:') >= 0).slice(0, 6)) {
        console.log('      ' + line.trim());
      }
    } else {
      console.log(`  ✓ ${r.op.label}: ${tail}`);
    }
    if (r.op.expectWarn) {
      ok(r.out.indexOf(r.op.expectWarn) >= 0,
        `E2E[${r.op.label}] 検査2 の内容はレポートに出ている（黙って消していない）`);
      ok(/WARN2=[1-9]/.test(tail),
        `E2E[${r.op.label}] 最終行に WARN2 が出る＝ run_tests.sh の tail -1 で CI ログに載る（${tail}）`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
});
