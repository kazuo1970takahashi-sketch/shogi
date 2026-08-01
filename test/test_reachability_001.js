#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（スライス1A＝製品側のみ）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（静的に到達不能な 30 関数 / 実行時のみ 10 関数 / 死んだ結線 5）を
//   常設の CI ゲートに落としたもの。
//
//   ── 001h で PR を分割した（作者判断 2026-08-02 / ref #816）────────────────────
//   7 巡の差し戻しで、**検査1（静的到達可能性の判定そのもの）が破られたことは一度も無い**。
//   破られ続けたのは「検査を検査する側」＝ハーネスの足場だった。そこで:
//     - スライス1A（このファイル）= 検査1 のブロッキング常設化 ＋ warn 可視化 ＋
//       allowlist 規律 ＋ 移行オラクル。
//     - スライス1B（Issue #816）= 変異バッテリ・枯れ検査・E2E 操作リスト・dq probe 等。
//       **`test/tools/reach_mutation_battery.js` へそのまま退避した（1 行も捨てていない）**。
//       `test/tools/` は run_tests.sh の自動発見に載らないので CI からは走らない。
//       これは意図的な一時措置で、置き場と blocking 方針は #816 が決め直す。
//
//   ── このファイルを貫く拘束（受け入れ基準の中心）────────────────────────────
//   > ブロッキングテストは、合成 fixture と「そのファイルの解析結果」にのみ依存してよい。
//   > 実在の1例が在ることに依存してはならない。
//
//   4 巡連続で同じ形に破られた（S1/S16 の実数 pin → M2 の「唯一ルート」→
//   T-0d/ON_SPANS[0] → M4/M5 の static[0]・S19 の「実例が在る ⇒ …」の推論）。
//   個別に塞ぐのをやめ、**残す assert を次の 4 種だけに機械的に限定する**:
//
//     C1  合成 fixture（`__reachFixture*` 注入）に対する判定
//     C2  「そのファイルを解析した結果」と allowlist / baseline の双方向照合（R0/R1/R4/R5/A5）
//     C3  構造不変条件（面の完全性＝未分類 0・総延長＝ファイル長）
//     C4  情報表示（census）— assert しない
//
//   実ファイル由来の配列への添字参照（`static[0]` / `ON_SPANS[0]` / `shift()` 等）と、
//   実例の存在を前提にした推論は**このファイルには 1 つも無い**（全部 battery 側へ送った）。
//   `pinIf`（実例が無ければ skip）も置いていない＝ skip 0 が常態で、
//   「在庫が尽きて黙って skip になった」状態そのものが起きない。
//
//   ── 子プロセスをやめた ────────────────────────────────────────────────
//   「実際にコミットしたら緑か」は 001e〜001g では本スイートを子プロセスで 9 本
//   丸ごと再実行して測っていた（2 コア環境でフル 2m34s〜5m34s）。001h は
//   **ゲート判定を 1 本の関数 gate() に括り出し、変異済みの解析結果に同じ gate() を
//   当てて判定する**（受け入れ基準2）。子プロセス方式は battery 側に温存してある。
'use strict';

const fs = require('fs');
const path = require('path');
const {
  analyze, classifyFaces, faceStats, FACE, FACE_NAME, isRefFace, ON_EVENT_ATTRS,
} = require('./lib/reachability.js');

const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
const ALLOW_PATH = process.env.REACH_ALLOWLIST || path.join(__dirname, 'reachability_allowlist.json');
const ALLOW = JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

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
  // R7【warn】連結ランに挟まっていた長い式オペランド。**参照は落としていない**（001f で
  //   打ち切りを廃止した）。「この辺りは目で見ておいた方がよい」という印。
  //   subject は行番号ではなく「所有関数名 #序数」＝無関係な編集で行がずれても変わらない。
  for (const t of a.concatLongOperands || []) {
    add('warn', 'R7', t.id,
      `L${t.line} ${t.owner} の文字列連結に ${t.length} 文字の式オペランドがある（連結は打ち切っていない）`);
  }
  // R8【warn】on* に見えるがイベント名リストに無い属性。リスト漏れなら見落としになる。
  for (const u of a.unknownOnAttrs || []) {
    add('warn', 'R8', u.name,
      `L${u.line} ${u.name}= は on* の形だが既知のイベント名ではない`
      + `${u.viaDerived ? '（JS 文字列の中／派生パス' + (u.owner ? ' ' + u.owner : '') + '）' : ''}`
      + '（実イベントならリストに足すこと）');
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
// 差分照合（fixture の基準状態との差だけを見る）
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
function checkDelta(emit, baseV, mutV, spec, label) {
  const de = deltaOf(baseV.errors, mutV.errors);
  const dw = deltaOf(baseV.warnings, mutV.warnings);
  const one = (got, want, what) => {
    const must = (want && want.must) || [];
    const allowed = (want && want.allowed) || must;
    for (const m of must) {
      emit(got.indexOf(m) >= 0, `${label}: ${what} に ${m} が無い（実測 [${got.join(', ')}]）`);
    }
    const stray = got.filter((s) => allowed.indexOf(s) < 0);
    emit(stray.length === 0, `${label}: ${what} に想定外が混ざっている [${stray.join(', ')}]`);
  };
  one(de.added, spec.errors, 'error 増分');
  one(de.removed, spec.errorsRemoved, 'error 減分');
  one(dw.added, spec.warnings, 'warn 増分');
  one(dw.removed, spec.warningsRemoved, 'warn 減分');
}

// =============================================================================
// 構造から引く anchor（行テキストの完全一致はしない）
// =============================================================================

// スクリプト直下（＝どの関数にも属さない位置）へコードを差し込む。
function insertTopLevelJs(src, a, code) {
  const at = a._internal.topFunctions.reduce((mx, f) => Math.max(mx, f.bodyEnd), -1) + 1;
  return src.slice(0, at) + '\n' + code + '\n' + src.slice(at);
}
// スクリプト直下の、**既存の全トップレベル関数より前**へ差し込む（位置は解析結果から引く）。
function insertTopLevelJsBefore(src, a, code) {
  const first = a._internal.topFunctions.reduce((mn, f) => Math.min(mn, f.namePos), Infinity);
  const at = src.lastIndexOf('function', first);
  return at < 0 ? null : src.slice(0, at) + code + '\n' + src.slice(at);
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
// 面から「HTML 直書きのインライン on*= 属性」を、**属性名から閉じ引用符まで**まるごと引く。
//   在庫ゼロ耐性②（インライン on* の全件 addEventListener 化）がこれを使う。
function onAttrFullSpans(src, a) {
  const face = a._internal.baseFace;
  const out = [];
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const isName = (c) => /[A-Za-z0-9_:.-]/.test(c);
  for (let i = 0; i < face.length; i++) {
    if (face[i] !== FACE.ATTR_VAL_ON) continue;
    let e = i;
    while (e < face.length && face[e] === FACE.ATTR_VAL_ON) e++;
    const value = src.slice(i, e);
    let p = i - 1;
    const quote = src[p];
    if ((quote === '"' || quote === "'") && src[e] === quote) {
      p--;
      while (p >= 0 && isSpace(src[p])) p--;
      if (src[p] === '=') {
        p--;
        while (p >= 0 && isSpace(src[p])) p--;
        const nameEnd = p + 1;
        while (p >= 0 && isName(src[p])) p--;
        const nameStart = p + 1;
        if (nameStart < nameEnd) {
          out.push({
            attrStart: nameStart,
            attrEnd: e + 1,
            attrName: src.slice(nameStart, nameEnd),
            value,
          });
        }
      }
    }
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
// name の出現のうち「派生パスで ATTR_VAL_ON へ昇格した」位置を面から引く。
function derivedOnPos(m, src, name) {
  const face = m._internal.face;
  const re = new RegExp('(?<![A-Za-z0-9_$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])', 'g');
  for (const mm of src.matchAll(re)) {
    if (face[mm.index] === FACE.ATTR_VAL_ON && m._internal.derivedPositions.has(mm.index)) return mm.index;
  }
  return -1;
}
// 失敗時に「どの面に載っていたか」を出す（FAIL メッセージを実測つきにするため）。
function derivedOnPosDetail(m, src, name) {
  const face = m._internal.face;
  const seen = new Set();
  const re = new RegExp('(?<![A-Za-z0-9_$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])', 'g');
  for (const mm of src.matchAll(re)) seen.add(FACE_NAME[face[mm.index]]);
  return [...seen].join('/') || '(出現なし)';
}
// トップレベル関数のスパン（`function` キーワードから本体末尾まで）。
function functionSpan(src, a, name) {
  const f = (a._internal.byName.get(name) || [])[0];
  if (!f) return null;
  return { start: src.lastIndexOf('function', f.namePos), bodyEnd: f.bodyEnd };
}

const refCount = (a, kind, name) => {
  const m = a._internal && a._internal[kind];
  return (m && typeof m.get === 'function') ? (m.get(name) || 0) : 0;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const allowCount = (allow) => (allow.static || []).length + (allow.runtime || []).length;
const staticNames = (a) => a.unreachableStatic.map((x) => x.name).join(',');

// 差分照合は「変異で新しく現れた違反」を見るので、注入する名前が**その src に既に
// 存在していない**ことが前提になる。衝突したら連番を足して必ず未使用の名前にする。
function uniqIn(src, base) {
  if (src.indexOf(base) < 0) return base;
  for (let i = 2; ; i++) if (src.indexOf(base + i) < 0) return base + i;
}

// =============================================================================
// ゲート本体
//   「この (src, allow) で CI が緑になるか」を判定する唯一の関数。
//   対象ファイルの常設判定も、正当編集耐性も、在庫ゼロ耐性も **全部ここを通る**。
//   ＝「実際にコミットしたら緑か」を、子プロセスではなく解析結果の差分で測る。
//
//   ここに置いてよい assert は C1（合成 fixture）/ C2（解析結果 × allowlist の
//   双方向照合）/ C3（構造不変条件）だけ。実在の1例に依存するものは 1 つも無い。
// =============================================================================
function gate(src, allow, emit, log) {
  // --- C3 面レクサの不変条件（完全性）----------------------------------------
  const fstat = faceStats(classifyFaces(src));
  emit(fstat.unclassified === 0, `L-1 未分類の文字が 0（実測 ${fstat.unclassified} 文字）`);
  emit(fstat.covered === src.length, `L-2 面の総延長がファイル長と一致する: ${fstat.covered} / ${src.length}`);
  const histSum = Object.values(fstat.histogram).reduce((s, n) => s + n, 0);
  emit(histSum === src.length, `L-3 面ごとの内訳の合計もファイル長と一致する: ${histSum} / ${src.length}`);
  emit(Object.keys(fstat.histogram).length === Object.keys(FACE).length,
    `L-4 面の一覧が ${Object.keys(FACE).length} 面ある`);
  emit(Object.values(FACE).filter(isRefFace).length === 2
    && isRefFace(FACE.JS_CODE) && isRefFace(FACE.ATTR_VAL_ON),
  'L-5 参照として数える面は JS_CODE ＋ ATTR_VAL_ON の 2 つだけ');
  log('  面の内訳: ' + Object.entries(fstat.histogram)
    .filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' '));

  // --- C3 走査の構造不変条件（実態の数は census。pin にしない）-----------------
  const t0 = Date.now();
  const a = analyze(src);
  const elapsed = Date.now() - t0;
  emit(a.functionDeclsAllDepths >= a.topLevelFunctionCount,
    `S3 全深さの関数宣言数がトップレベル以上（${a.functionDeclsAllDepths} >= ${a.topLevelFunctionCount}）`);
  emit(a.inlineHandlerCount === a.htmlHandlerCount + a.derivedHandlerCount,
    'S5 インライン on*= の合計 = HTML 直書き ＋ 派生パス');
  // C4 census（数の実態。増減しても FAIL にしない＝新規ボタン / 新規 script / 在庫ゼロで赤くならない）
  log(`  census: script=${a.scriptBlocks} 関数=${a.topLevelFunctionCount}(全深さ ${a.functionDeclsAllDepths})`
    + ` root=${a.rootNames.length} on*=${a.inlineHandlerCount}(HTML ${a.htmlHandlerCount}+派生 ${a.derivedHandlerCount})`
    + ` alias=${a.selectorAliases.length} 走査=${elapsed}ms`);
  log(`  検査1 静的到達不能: ${a.unreachableStatic.length}`);
  log(`  検査2 実行時のみ到達不能: ${a.unreachableRuntimeOnly.length}（レポート）`);
  log(`  検査2 死んだ結線: ${a.deadBindings.length} (${a.deadBindings.map((d) => d.selector).join(', ') || 'なし'})（レポート）`);
  log(`  派生パスのみで到達可能: ${a.derivedOnlyReachable.length} / 長い連結オペランド: ${a.concatLongOperands.length} / 未知 on*: ${a.unknownOnAttrs.length}`);

  // --- C2 本番判定（errors だけが CI を落とす）--------------------------------
  const v = evaluate(a, allow);
  if (v.errors.length) {
    log('  --- 違反（CI をブロックする） ---');
    for (const x of v.errors) log(`  [${x.rule}] ${x.message}`);
    log('  対処: (a) 到達可能に直す / (b) 意図的なら test/reachability_allowlist.json に理由つきで追加');
  }
  if (v.warnings.length) {
    log('  --- 警告（レポートのみ / CI は落とさない） ---');
    for (const x of v.warnings) log(`  [warn ${x.rule}] ${x.message}`);
  }
  emit(v.errors.length === 0, `R0 allowlist に無い到達不能コード / 掃除漏れ: ${v.errors.length} 件（${show(v.errors)}）`);
  log(`  レポート層の警告: ${v.warnings.length} 件（exit code に影響しない。最終行の WARN2 に出る）`);

  // --- C2 allowlist の健全性（allowlist / baseline との双方向照合）-------------
  const allEntries = [
    ...(allow.static || []).map((e) => ['static', e.name, e]),
    ...(allow.runtime || []).map((e) => ['runtime', e.name, e]),
    ...(allow.bindings || []).map((e) => ['bindings', e.selector, e]),
  ];
  emit(allEntries.every(([, k]) => typeof k === 'string' && k.length > 0), 'A1 全エントリに name / selector がある');
  emit(allEntries.every(([, , e]) => (e.reason || '').trim().length >= MIN_REASON), `A2 全エントリに ${MIN_REASON} 文字以上の理由がある`);
  emit(allEntries.every(([, , e]) => ALLOW_CATEGORIES.has(e.category)), 'A3 全エントリの category が既知の区分キーワード');
  emit(allEntries.every(([, , e]) => EVIDENCE_RE.test(e.reason || '')), 'A3b 全エントリの理由に根拠参照（#Issue / L行 / 日付）がある');
  const dupKey = new Set();
  let dup = 0;
  for (const [sec, k] of allEntries) { const kk = sec + ':' + k; if (dupKey.has(kk)) dup++; dupKey.add(kk); }
  emit(dup === 0, `A4 allowlist に重複エントリが無い: ${dup} 件`);

  const bl = allow.baseline || {};
  const limits = allow.limits || {};
  log(`  baseline: static=${bl.static_unreachable} runtime=${bl.runtime_unreachable} bindings=${bl.dead_bindings} 関数総数=${bl.top_level_functions}`);
  log(`  現在    : static=${a.unreachableStatic.length} runtime=${a.unreachableRuntimeOnly.length} bindings=${a.deadBindings.length} 関数総数=${a.topLevelFunctionCount}`);
  log(`  baseline との差: static=${a.unreachableStatic.length - bl.static_unreachable} runtime=${a.unreachableRuntimeOnly.length - bl.runtime_unreachable} bindings=${a.deadBindings.length - bl.dead_bindings}`);
  log(`  allowlist: ${allowCount(allow)} 件 / 目安 ${limits.allowlist_max}（超過は warn のみ）`);
  emit(typeof limits.allowlist_max === 'number' && limits.allowlist_max > 0,
    'A5-0 allowlist の目安上限が limits.allowlist_max として外部化されている');
  emit((limits.reason || '').trim().length >= MIN_REASON,
    'A5-1 目安上限には理由が書かれている（引き上げがレビュー対象になる）');
  emit(!v.errors.some((x) => x.rule === 'A5'), 'A5-2 上限超過は warn であり CI をブロックしない');
  // allowlist の記録と baseline の件数が食い違っていない（片方だけこっそり減らせない）。
  emit((allow.runtime || []).length === bl.runtime_unreachable,
    `WI-7 allowlist（runtime）の件数と baseline.runtime_unreachable が一致（${(allow.runtime || []).length} / ${bl.runtime_unreachable}）`);
  emit((allow.bindings || []).length === bl.dead_bindings,
    `WI-8 allowlist（bindings）の件数と baseline.dead_bindings が一致（${(allow.bindings || []).length} / ${bl.dead_bindings}）`);

  // --- C1 面 × 変異の全表（合成 fixture）--------------------------------------
  //   対象ファイルの実在の死にコードには一切依存しない。**注入した合成の死んだ関数**
  //   だけを使うので、#798 の掃除が全件終わっても（在庫ゼロでも）表は壊れない。
  const dead = uniqIn(src, '__reachFixtureDeadFn');
  const fx = insertTopLevelJs(src, a, `function ${dead}(){ return 1; }`);
  const fxa = analyze(fx);
  const fxAllow = clone(allow);
  fxAllow.static = (fxAllow.static || []).concat([{
    name: dead,
    category: 'temporarily-preserved',
    reason: '面 × 変異の全表が使う合成の死んだ関数（fixture・#799 PHASE1-REACH-001h / 2026-08-02）。対象ファイルの実在の死にコードに表が依存しないようにするためのもの。',
  }]);
  const fxv = evaluate(fxa, fxAllow);

  emit(fxa.unreachableStatic.some((x) => x.name === dead),
    `T-0a fixture の死んだ関数 ${dead} が注入され、到達不能として検出される`);
  emit(fxv.errors.length === 0, `T-0b fixture の基準状態はエラー 0（実測 ${fxv.errors.length}: ${show(fxv.errors)}）`);
  emit(insertCss(fx, fxa, '.__probe{}') !== null, 'T-0c <style> の位置を面から引けた');

  // 死んだ関数が到達可能に戻る変異の期待: R5（掃除漏れ）が 1 件増えるだけ。
  const REVIVE = { errors: { must: ['R5:' + dead], allowed: ['R5:' + dead] } };

  const faceTable = [
    {
      face: 'HTML_TEXT', expect: '不変', bucket: 'markupRefs',
      label: '地の文に死んだ関数名を置く', marker: '__faceProbeText',
      apply: (s) => insertHtml(s, `<span>__faceProbeText ${dead} を廃止予定</span>`),
    },
    {
      face: 'HTML_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'HTML コメントに onclick="deadFn()" を書く', marker: '__faceProbeComment',
      apply: (s) => insertHtml(s, `<!-- __faceProbeComment <button onclick="${dead}()">旧導線</button> -->`),
    },
    {
      face: 'HTML_TAG', expect: '不変', bucket: 'markupRefs',
      // タグ名は英字始まりでないと HTML のタグにならないので `x-` を前置する。
      label: 'タグ名そのものに死んだ関数名を含める', marker: '__faceProbeTag',
      apply: (s) => insertHtml(s, `<span id="__faceProbeTag"></span><x-${dead}></x-${dead}>`),
    },
    {
      // ★ 3 版目が破られた面。属性名の前方一致で on* と誤認していた。
      face: 'ATTR_NAME', expect: '不変', bucket: 'markupRefs',
      label: '属性名に関数名を置く ＋ data-onclick="deadFn()"（3 版目の破れ方）',
      marker: '__faceProbeAttrName',
      apply: (s) => insertHtml(s, `<span id="__faceProbeAttrName" data-${dead}-legacy="1" data-onclick="${dead}()">x</span>`),
    },
    {
      // ★ 2 版目が破られた面。
      face: 'ATTR_VAL', expect: '不変', bucket: 'markupRefs',
      label: 'class="deadFn-pill"（2 版目の破れ方）', marker: '__faceProbeAttrVal',
      apply: (s) => insertHtml(s, `<span id="__faceProbeAttrVal" class="${dead}-pill">x</span>`),
    },
    {
      face: 'STYLE_CSS', expect: '不変', bucket: 'commentRefs',
      label: 'CSS に .deadFn{} を足す', marker: '__faceProbeCss',
      apply: (s) => insertCss(s, fxa, `.__faceProbeCss{display:none}\n.${dead}{color:red}`),
    },
    {
      face: 'RAWTEXT', expect: '不変', bucket: 'markupRefs',
      label: 'textarea の中身に関数名を置く', marker: '__faceProbeRawtext',
      apply: (s) => insertHtml(s, `<textarea id="__faceProbeRawtext">${dead}()</textarea>`),
    },
    {
      face: 'JS_STR_SQ', expect: '不変', bucket: 'stringRefs',
      label: '単引用符のログ文字列に関数名を置く（1 版目の破れ方）', marker: '__faceProbeSq',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeSq='LOG: ${dead} は保存されませんでした';`),
    },
    {
      face: 'JS_STR_DQ', expect: '不変', bucket: 'stringRefs',
      label: '二重引用符の文字列に関数名を置く', marker: '__faceProbeDq',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeDq="LOG: ${dead} は保存されませんでした";`),
    },
    {
      face: 'JS_TMPL_STR', expect: '不変', bucket: 'stringRefs',
      label: 'テンプレート文字列の中に関数名を置く', marker: '__faceProbeTmpl',
      apply: (s) => insertTopLevelJs(s, fxa, 'var __faceProbeTmpl=`LOG: ' + dead + ' ${String(1)}`;'),
    },
    {
      face: 'JS_LINE_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: '行コメントで関数名に言及する', marker: '__faceProbeLine',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeLine=1; // ${dead}() は撤去済み`),
    },
    {
      face: 'JS_BLOCK_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'ブロックコメントで関数名に言及する', marker: '__faceProbeBlock',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeBlock=1; /* ${dead}() は撤去済み */`),
    },
    {
      face: 'JS_REGEX', expect: '不変', bucket: 'stringRefs',
      label: '正規表現リテラルに /deadFn/ を書く', marker: '__faceProbeRegex',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeRegex=/${dead}/.test('x');`),
    },
    {
      face: 'ATTR_VAL_ON', expect: '到達化', spec: REVIVE,
      label: 'インライン onclick に死んだ関数を結線する', marker: '__faceProbeOn',
      apply: (s) => insertHtml(s, `<button id="__faceProbeOn" onclick="${dead}()">x</button>`),
    },
    {
      face: 'JS_CODE', expect: '到達化', spec: REVIVE,
      label: 'トップレベルの呼出を 1 行足す', marker: '__faceProbeCode',
      apply: (s) => insertTopLevelJs(s, fxa, `if(window.__faceProbeCode){${dead}();}`),
    },
    {
      face: 'JS_TMPL_DELIM', expect: '到達化', spec: REVIVE,
      label: 'テンプレートの ${} の中で呼ぶ', marker: '__faceProbeHole', probe: '${',
      apply: (s) => insertTopLevelJs(s, fxa, 'var __faceProbeHole=`${window.__faceProbeHoleX?' + dead + '():1}`;'),
    },
  ];

  const coveredFaces = new Set(faceTable.map((t) => t.face));
  const missingFaces = Object.keys(FACE).filter((f) => !coveredFaces.has(f));
  emit(missingFaces.length === 0,
    `T-0e 面 × 変異の表が全 ${Object.keys(FACE).length} 面を覆っている（欠け: ${missingFaces.join(', ') || 'なし'}）`);

  for (const t of faceTable) {
    const s2 = t.apply(fx);
    emit(!!s2 && s2 !== fx, `T[${t.face}]-1 変異が適用された（${t.label}）`);
    if (!s2 || s2 === fx) continue;
    const m = analyze(s2);
    const mv = evaluate(m, fxAllow);

    const needle = t.probe || dead;
    const at = s2.indexOf(t.marker);
    const pos = at >= 0 ? s2.indexOf(needle, at) : -1;
    const got = pos >= 0 ? FACE_NAME[m._internal.face[pos]] : '(見つからない)';
    emit(got === t.face, `T[${t.face}]-2 差し込んだ「${needle}」がその面に載っている: 実測 ${got}`);

    if (t.expect === '不変') {
      emit(m.unreachableStatic.some((x) => x.name === dead),
        `T[${t.face}]-3 ${dead} は到達不能のまま（この面は参照として数えない）`);
      emit(m.rootNames.indexOf(dead) < 0, `T[${t.face}]-4 ${dead} はルートにならない`);
      emit(refCount(m, t.bucket, dead) > refCount(fxa, t.bucket, dead),
        `T[${t.face}]-5 その言及は ${t.bucket} として数えられている: ${refCount(fxa, t.bucket, dead)} → ${refCount(m, t.bucket, dead)}`);
      checkDelta(emit, fxv, mv, {}, `T[${t.face}]-6`);
    } else {
      emit(!m.unreachableStatic.some((x) => x.name === dead),
        `T[${t.face}]-3 ${dead} が到達可能になる（この面は参照として数える）`);
      checkDelta(emit, fxv, mv, t.spec, `T[${t.face}]-4`);
    }
  }

  // --- C1 ATTR_NAME の値まで pin（data-onclick の値が ATTR_VAL_ON になったら 3 版目に戻る）---
  {
    const s2 = insertHtml(fx, `<span id="__probeAttrName2" data-onclick="${dead}()">x</span>`);
    const m = analyze(s2);
    const namePos = s2.indexOf('data-onclick', s2.indexOf('__probeAttrName2'));
    const valPos = s2.indexOf(dead, namePos);
    emit(FACE_NAME[m._internal.face[namePos]] === 'ATTR_NAME',
      `T[ATTR_NAME]-7 data-onclick は属性名の面（実測 ${FACE_NAME[m._internal.face[namePos]]}）`);
    emit(FACE_NAME[m._internal.face[valPos]] === 'ATTR_VAL',
      `T[ATTR_NAME]-8 その値は ATTR_VAL であって ATTR_VAL_ON ではない（実測 ${FACE_NAME[m._internal.face[valPos]]}）`);
    emit(m.inlineHandlerCount === fxa.inlineHandlerCount,
      `T[ATTR_NAME]-9 インライン on*= の件数が増えない: ${fxa.inlineHandlerCount} → ${m.inlineHandlerCount}`);
  }

  // --- C1 on* に見えるがイベント名ではない属性は root 化しない -------------------
  {
    const s2 = insertHtml(fx, `<span id="__probeBogusOn" onbogus="${dead}()">x</span>`);
    const m = analyze(s2);
    const p = s2.indexOf(dead, s2.indexOf('__probeBogusOn'));
    emit(FACE_NAME[m._internal.face[p]] === 'ATTR_VAL',
      `T[ATTR_VAL]-10 onbogus= の値は ATTR_VAL（実測 ${FACE_NAME[m._internal.face[p]]}・001d は on* 扱いで root 化した）`);
    emit(m.unreachableStatic.some((x) => x.name === dead), 'T[ATTR_VAL]-11 死んだ関数は到達不能のまま');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:onbogus'], allowed: ['R8:onbogus'] } }, 'T[ATTR_VAL]-12');
  }

  // --- C1 派生パスの中の未知 on* も R8 に出る ----------------------------------
  {
    const wire = uniqIn(fx, '__probeDerivedUnknownWire');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${wire}(){ document.body.insertAdjacentHTML('beforeend','<button onbogusderived="${dead}()">x</button>'); }\n${wire}();`);
    const m = analyze(s2);
    emit(m.unknownOnAttrs.some((u) => u.name === 'onbogusderived' && u.viaDerived),
      `R8-DERIVED-1 JS 文字列の中の未知 on*= が報告される（実測 ${JSON.stringify(m.unknownOnAttrs.map((u) => u.name))}）`);
    emit(m.unreachableStatic.some((x) => x.name === dead),
      'R8-DERIVED-2 未知 on* なので死んだ関数はルート化しない');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:onbogusderived'], allowed: ['R8:onbogusderived'] } }, 'R8-DERIVED-3');
  }

  // --- C1 インライン on*= を複数行にしてもルートを失わない（3 版目の破れ方）------
  //   001g までは実ファイルの `ON_SPANS[0]`（＝実在の 1 例）を折り曲げていた。
  //   インライン on* を 1 件残らず addEventListener へ移すと配列が空になり、
  //   `ON_SPANS[0]` が undefined になって未捕捉の TypeError で落ちる（#816 H-1）。
  //   → **fixture に自分で結線を注入し、それを折り曲げる**。
  {
    const s2 = insertHtml(fx, `<button id="__probeMultiline" onclick="${dead}()">x</button>`);
    const m0 = analyze(s2);
    const spans = onAttrFullSpans(s2, m0).filter((sp) => sp.value.indexOf(dead) >= 0);
    emit(spans.length === 1, `T[ATTR_VAL_ON]-13a 注入した on*= 属性を面から 1 件引けた（実測 ${spans.length}）`);
    if (spans.length === 1) {
      const sp = spans[0];
      // 属性値の前後に改行を入れる＝ 3 版目はここで属性値の走査を打ち切っていた。
      const folded = s2.slice(0, sp.attrStart) + sp.attrName + '=\n      "\n' + sp.value + '\n"\n    '
        + s2.slice(sp.attrEnd);
      const m = analyze(folded);
      emit(m.htmlHandlerCount === m0.htmlHandlerCount,
        `T[ATTR_VAL_ON]-13 複数行にしても on*= 属性の数は変わらない: ${m0.htmlHandlerCount} → ${m.htmlHandlerCount}`);
      emit(m.rootNames.join(',') === m0.rootNames.join(','),
        'T[ATTR_VAL_ON]-14 ルートの顔ぶれも変わらない（3 版目は属性値の改行で走査を打ち切っていた）');
      emit(!m.unreachableStatic.some((x) => x.name === dead),
        `T[ATTR_VAL_ON]-14b 折り曲げても ${dead} は到達可能なまま`);
      checkDelta(emit, evaluate(m0, fxAllow), evaluate(m, fxAllow), {}, 'T[ATTR_VAL_ON]-15');
    }
  }

  // --- C1 派生パス: JS 文字列の中の on*= は参照として数える（罠(7)）-------------
  {
    const name = uniqIn(fx, '__probeStrHandler');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${name}(){ return 1; }\n`
      + `function ${name}Wire(){ document.body.insertAdjacentHTML('beforeend','<button onclick="${name}()">go</button>'); }\n`
      + `${name}Wire();`);
    const m = analyze(s2);
    // 001e はここを `src.indexOf('beforeend')` の生テキストで anchor していた。**面から引く**。
    emit(derivedOnPos(m, s2, name) >= 0,
      `T[JS_STR_SQ]-7 JS 文字列の中の on*= は派生パスで ATTR_VAL_ON へ昇格する（実測 ${derivedOnPosDetail(m, s2, name)}）`);
    emit(!m.unreachableStatic.some((x) => x.name === name), 'T[JS_STR_SQ]-8 そこで結線した関数を到達不能と言わない');
    emit(m.derivedHandlerCount === fxa.derivedHandlerCount + 1,
      `T[JS_STR_SQ]-9 派生パスで拾った on*= が 1 件増える: ${fxa.derivedHandlerCount} → ${m.derivedHandlerCount}`);
  }

  // --- C1 派生パス: 一度も挿入されない「死んだテンプレート」は隠さず見せる --------
  {
    const s2 = insertTopLevelJs(fx, fxa, `var __probeDeadTemplate='<button onclick="${dead}()">go</button>';`);
    const m = analyze(s2);
    emit(m.derivedOnlyReachable.indexOf(dead) >= 0,
      `T[JS_STR_SQ]-10 死んだテンプレート内の on*= で到達可能になった関数が derivedOnlyReachable に出る（実測 [${m.derivedOnlyReachable.join(', ')}]）`);
    checkDelta(emit, fxv, evaluate(m, fxAllow), {
      errors: { must: ['R5:' + dead], allowed: ['R5:' + dead] },
      warnings: { must: ['R6:' + dead], allowed: ['R6:' + dead] },
    }, 'T[JS_STR_SQ]-11');
  }

  // --- C1 派生パス: ASI 越境（セミコロン無しの独立2文）で連結しない --------------
  {
    const s2 = insertTopLevelJs(fx, fxa,
      'function __probeAsiWire(){\n'
      + "  var a = '<button onclick=\"'\n"
      + `  var bb = '${dead}()">go</button>'\n`
      + '  document.body.innerHTML = a + bb\n'
      + '}\n__probeAsiWire();');
    const m = analyze(s2);
    const pos = s2.indexOf(dead, s2.indexOf('__probeAsiWire'));
    emit(FACE_NAME[m._internal.face[pos]] === 'JS_STR_SQ',
      `T[JS_STR_SQ]-12 独立した 2 文をまたいで連結しない（実測 ${FACE_NAME[m._internal.face[pos]]}・001d は ATTR_VAL_ON へ昇格していた）`);
    emit(m.unreachableStatic.some((x) => x.name === dead), 'T[JS_STR_SQ]-13 死んだ関数は到達不能のまま');
    checkDelta(emit, fxv, evaluate(m, fxAllow), {}, 'T[JS_STR_SQ]-14');
  }

  return { a, v, fx, fxa, fxAllow, fxv, dead };
}

// 変異済みの (src, allow) に同じゲートを当て、**落ちた assert の一覧**を返す。
function gateProblems(src, allow) {
  const problems = [];
  try {
    gate(src, allow, (cond, msg) => { if (!cond) problems.push(msg); }, () => {});
  } catch (e) {
    problems.push(`ゲートが例外で落ちた: ${e && e.message}`);
  }
  return problems;
}

// =============================================================================
// 1〜4. 常設判定（対象ファイル）
// =============================================================================
console.log('=== 到達可能性ゲート（常設判定） ===');
const G = gate(RAW, ALLOW, ok, console.log);
const A = G.a;
const V = G.v;

// =============================================================================
// 5. 既知の限界を固定する（lib ヘッダの KL-*）
//    すべて合成の入力に対する判定＝ C1。実ファイルの中身には依存しない。
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

// --- KL-4 / KL-9 / KL-10: 「生きた関数を殺す」向きの限界 -----------------------
//   001h は lib を 1 バイトも変更しない（移行オラクルの「9176cc5 比較で差分ゼロ」を
//   維持するため）ので、パネルが見つけた実バグ 2 件は**直さずに KL として固定する**。
//   どちらも現ファイルには実例 0 件・万一書かれても allowlist（static）への
//   1 行追記で退避できる（＝ CI が詰まない）。本修正は Issue #816。
{
  const mk = (code) => analyze(insertTopLevelJs(RAW, A, code));
  const live = (m, n) => !m.unreachableStatic.some((x) => x.name === n);

  const n4 = uniqIn(RAW, '__klNestedScript');
  ok(!live(mk(`function ${n4}(){ return 1; }\nfunction ${n4}W(){ document.body.insertAdjacentHTML('beforeend','<div><scr'+'ipt>document.write("<b onclick=\\'${n4}()\\'>x</b>")</scr'+'ipt></div>'); }\n${n4}W();`), n4),
    'KL-4 JS 文字列の中の <script> の中の文字列に書いた on*= は拾わない（再帰は 1 段）');

  // KL-9: 連結オペランドの**中**で on*= が複数リテラルに分割されている形。
  //   `esc('<b onclick="' + 'live()' + '">x</b>')` — 001g の第2掃引は「どのランにも
  //   入らなかった文字列面」を単独ランとして拾い直すので、オペランド内が単一リテラルなら
  //   拾える（下の対照）。だが**オペランド内でさらに連結されている**と、分割された
  //   リテラルは互いに結合されないまま単独ランになり、on*= が壊れた形でしか見えない。
  //   結果、生きた関数が R1 error で死ぬ。連結の外なら同じ分割で生存する＝深さ 2 の非対称。
  const n9 = uniqIn(RAW, '__klSplitInOperand');
  const m9 = mk(`function ${n9}Esc(s){ return s; }\nfunction ${n9}(){ return 1; }\n`
    + `function ${n9}W(){ document.body.innerHTML='<div>'+${n9}Esc('<b onclick="'+'${n9}()'+'">x</b>')+'</div>'; }\n${n9}W();`);
  ok(!live(m9, n9),
    `KL-9 連結オペランドの中で on*= が複数リテラルに分割されていると参照を落とす（${n9} が R1 error 化する・lib 実バグ・#816 H-5 で修正）`);
  const c9a = uniqIn(RAW, '__klSplitCtrlInner');
  ok(live(mk(`function ${c9a}Esc(s){ return s; }\nfunction ${c9a}(){ return 1; }\n`
    + `function ${c9a}W(){ document.body.innerHTML='<div>'+${c9a}Esc('<b onclick="${c9a}()">x</b>')+'</div>'; }\n${c9a}W();`), c9a),
  'KL-9b 対照: オペランドの中が単一リテラルなら拾える（001g の第2掃引で直った形）');
  const c9b = uniqIn(RAW, '__klSplitCtrlOuter');
  ok(live(mk(`function ${c9b}(){ return 1; }\n`
    + `function ${c9b}W(){ document.body.innerHTML='<b onclick="'+'${c9b}()'+'">x</b>'; }\n${c9b}W();`), c9b),
  'KL-9c 対照: 同じ分割でも連結の外なら拾える（＝ KL-9 は深さ 2 の非対称）');

  // KL-10: 関数名そのものを変数にした動的ディスパッチ。静的走査の原理的な限界。
  const n10 = uniqIn(RAW, '__klDynamicDispatch');
  const m10 = mk(`function ${n10}(){ return 1; }\n`
    + `function ${n10}W(){ var n='${n10}'; document.body.innerHTML='<button onclick="'+n+'()">x</button>'; }\n${n10}W();`);
  ok(!live(m10, n10),
    `KL-10 'onclick="'+fnName+'()"（関数名の変数化＝動的ディスパッチ）は参照として拾えない（${n10} が R1 error 化する）`);

  // どちらも allowlist（static）への 1 行追記で退避できる＝ CI が詰まない。
  for (const [tag, m, n] of [['KL-9', m9, n9], ['KL-10', m10, n10]]) {
    const esc = clone(ALLOW);
    esc.static.push({
      name: n,
      category: 'functional-loss-pending',
      reason: `${tag} の退避可能性を実測するためのエントリ（#799 / #816 / 2026-08-02）。静的走査の限界で参照を拾えない形なので allowlist で退避する。`,
    });
    ok(evaluate(m, esc).errors.length === 0,
      `${tag}-esc allowlist（static）への 1 行追記だけで緑にできる（実測 ${show(evaluate(m, esc).errors)}）`);
  }
}

// --- イベント名リストの漏れは「生きた関数を殺す」向きに倒れる -------------------
//   001e のリストには実在イベントが 6 件漏れていて、`onmousewheel` で結線した
//   生きた関数が R1 error になった＝虚偽の allowlist 登録以外に緑化手段が無かった。
//   001g で同一仕様の**兄弟**を機械的に総なめして足した。
for (const ev of ['onmousewheel', 'onpointerrawupdate', 'onfullscreenchange',
  'onfullscreenerror', 'oncommand', 'onscrollsnapchange',
  'onscrollsnapchanging', 'onpagereveal', 'onpageswap',
  'ongamepadconnected', 'ongamepaddisconnected', 'oncontentvisibilityautostatechange',
  'onpointerlockchange', 'onpointerlockerror', 'ondeviceorientation',
  'ondeviceorientationabsolute', 'ondevicemotion', 'onorientationchange',
  'onwaitingforkey', 'onbeforexrselect', 'onwebkitfullscreenchange',
  'onwebkitfullscreenerror', 'onbeforeinstallprompt', 'onappinstalled']) {
  ok(ON_EVENT_ATTRS.has(ev), `EVENT[${ev}]-0 実イベント名としてリストに載っている`);
  // 小さな合成文書で走査そのものを確かめる（全 24 形を実ファイルで回すと遅いため）。
  const doc = `<html><body><div ${ev}="__probeEvFn()">x</div>`
    + '<script>function __probeEvFn(){ return 1; }<\/script></body></html>';
  const m = analyze(doc);
  ok(m.unreachableStatic.length === 0 && m.unknownOnAttrs.length === 0,
    `EVENT[${ev}]-1 ${ev}= で結線した生きた関数を到達不能と言わない（未知 on* 扱いにもしない）`);
}
// \xNN / \uXXXX で書かれた結線も復号して拾う
{
  const name = uniqIn(RAW, '__probeEscHandler');
  ok(!analyze(insertTopLevelJs(RAW, A,
    `function ${name}(){ return 1; }\n`
    + `function ${name}Wire(){ document.body.insertAdjacentHTML('beforeend','\\x3cbutton onclick=\\u0022${name}()\\u0022\\x3ego\\x3c/button\\x3e'); }\n`
    + `${name}Wire();`)).unreachableStatic.some((x) => x.name === name),
  'ESCAPE-1 \\xNN / \\uXXXX で書かれた on*= 結線も復号して拾う（001d は落としていた）');
}

// =============================================================================
// 6. 変異が本体を汚していないこと
// =============================================================================
ok(RAW === fs.readFileSync(target, 'utf8'), `M9 ${target} はディスク上でも 1 バイトも変わっていない`);

// =============================================================================
// 7. 「実際にコミットしても緑」の実測（受け入れ基準1・2）
//    ここが 001h の本命。正当な編集と**在庫ゼロ 2 種**に対して、上のゲートを
//    そのまま当て直し、落ちた assert が 0 であることを測る。
//    001g までは同じことを子プロセス 9 本でやっていた（#816 へ退避）。
// =============================================================================
console.log('=== 実際の編集に対するゲートの耐性（子プロセスを使わず解析結果で判定） ===');

// --- 在庫ゼロ①: 静的／実行時に到達不能な関数を**全件**削除する（不動点まで）----
function stripAllDeadFunctions(src) {
  let cur = src;
  let a = analyze(cur);
  let rounds = 0;
  let removed = 0;
  while (rounds < 12) {
    const names = a.unreachableStatic.map((x) => x.name)
      .concat(a.unreachableRuntimeOnly.map((x) => x.name));
    if (!names.length) break;
    const spans = names.map((n) => functionSpan(cur, a, n))
      .filter((s) => s && s.start >= 0)
      .sort((x, y) => y.start - x.start);
    let next = cur;
    let lastStart = Infinity;
    let n = 0;
    for (const s of spans) {
      if (s.bodyEnd >= lastStart) continue;      // 入れ子・重なりは次の周回で
      next = next.slice(0, s.start) + next.slice(s.bodyEnd + 1);
      lastStart = s.start;
      n++;
    }
    if (next === cur) break;
    cur = next;
    a = analyze(cur);
    rounds += 1;
    removed += n;
  }
  return { src: cur, a, rounds, removed };
}

// --- 在庫ゼロ②: HTML 直書きのインライン on* を**全件** addEventListener へ移す ---
function migrateInlineHandlers(src, a) {
  const spans = onAttrFullSpans(src, a);
  if (!spans.length) return { src, moved: 0 };
  let out = src;
  const wires = [];
  spans.forEach((sp, k) => {
    wires.push(`  var __mig${k}=document.querySelector('[data-reachmig="${k}"]');\n`
      + `  if(__mig${k}){ __mig${k}.addEventListener('${sp.attrName.replace(/^on/i, '')}', function(event){ ${sp.value} }); }`);
  });
  // 位置がずれないよう後ろから置換する。
  for (let k = spans.length - 1; k >= 0; k--) {
    const sp = spans[k];
    out = out.slice(0, sp.attrStart) + `data-reachmig="${k}"` + out.slice(sp.attrEnd);
  }
  out = insertHtml(out, '<script>\ndocument.addEventListener(\'DOMContentLoaded\', function(){\n'
    + wires.join('\n') + '\n});\n<\/script>\n');
  return { src: out, moved: spans.length };
}

const OPS = [];
{
  const name = uniqIn(RAW, '__opNewButtonHandler');
  OPS.push({
    label: '①新規ボタンをインライン onclick で 1 個追加',
    src: insertHtml(insertTopLevelJs(RAW, A, `function ${name}(){ return 1; }`),
      `<button type="button" onclick="${name}()">new</button>`),
  });
}
OPS.push({
  label: '②新規 script ブロックを追加',
  src: insertHtml(RAW, '<script>\nfunction __opExtraFn(){ return 1; }\n__opExtraFn();\n<\/script>\n'),
});

// ③ セレクタ・ヘルパへの抽出 ＋ `||` フォールバック（FP-4 / FP-7 が安全と証明した形）。
//    死んだ結線を含む関数を対象に選ぶので、在庫が尽きたら**この操作自体が消える**。
//    在庫ゼロ耐性は ⑩⑪ が別途担うので、ここでは存在を assert しない（census のみ）。
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
if (heavyFn) {
  const fp4 = extractHelper(RAW, A, heavyFn.n, '$id', 'function $id(id){return document.getElementById(id);}\n');
  if (fp4) {
    const a2 = analyze(fp4.src);
    const dead2 = new Set(a2.deadBindings.map((d) => d.selector));
    const site2 = selectorSites(fp4.src, a2).find((s) => !dead2.has('#' + s.id));
    if (site2) {
      OPS.push({
        label: '③セレクタ・ヘルパ抽出 ＋ `||` フォールバックのリファクタを実際に施す',
        src: fp4.src.slice(0, site2.end)
          + `||document.querySelector('#${site2.id}')` + fp4.src.slice(site2.end),
      });
    }
  }
}

// ④ 死にコードを 1 件削除し allowlist も掃除（在庫があるときだけ）。
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
{
  const d = pickRemovableDeadFn();
  if (d) {
    const allow2 = clone(ALLOW);
    allow2.static = allow2.static.filter((e) => e.name !== d.name);
    allow2.baseline = Object.assign({}, allow2.baseline,
      { static_unreachable: (allow2.baseline || {}).static_unreachable - 1 });
    OPS.push({ label: `④死にコード ${d.name} を削除し allowlist も掃除`, src: d.src, allow: allow2 });
  }
}

// ⑤ 検査2 だけが違反する状態（存在しない id への防御的ルックアップ）。
const FP5_ID = uniqIn(RAW, '__reachFeatureFlagPanel');
const fp5Src = insertTopLevelJs(RAW, A,
  `var __ff=document.getElementById('${FP5_ID}');\nif(__ff){__ff.style.display='none';}`);
OPS.push({
  label: '⑤検査2 だけが違反する状態（exit code に効かないことの実測）',
  src: fp5Src,
  expectWarn: 'R3:#' + FP5_ID,
});

// ⑥ 同じ関数を呼ぶボタンをもう 1 個足す（実在のインライン on* があるときだけ）。
const inlineVictim = (() => {
  for (const sp of onAttrFullSpans(RAW, A)) {
    const called = sp.value.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
    const v = called.find((n) => A._internal.byName.has(n));
    if (v) return v;
  }
  return null;
})();
if (inlineVictim) {
  OPS.push({
    label: `⑥同じ関数（${inlineVictim}）を呼ぶボタンをもう 1 個追加`,
    src: insertHtml(RAW, `<button type="button" onclick="${inlineVictim}()">__opDupButton</button>`),
  });
}

// ⑦ ファイルの**先頭側**（既存の全関数より前）へ関数を 1 個足す。
//    生テキスト anchor が「最初の出現」を掴んでいたら必ず壊れる位置。
const OP7_NAME = uniqIn(RAW, '__opBeforeendRender');
const op7Src = insertTopLevelJsBefore(RAW, A,
  `function ${OP7_NAME}(){ document.body.insertAdjacentHTML('beforeend','<div class="notice">x</div>'); }\n${OP7_NAME}();`);
if (op7Src) {
  OPS.push({ label: "⑦insertAdjacentHTML('beforeend', …) を使う関数を先頭側に 1 個追加", src: op7Src });
}

// ⑧ allowlist が上限 +1（境界）。A5 は warn なので緑のままであること。
{
  const allow2 = clone(ALLOW);
  allow2.limits = Object.assign({}, allow2.limits, { allowlist_max: allowCount(ALLOW) - 1 });
  OPS.push({
    label: `⑧allowlist が上限 +1（${allowCount(ALLOW)} 件 / 上限 ${allowCount(ALLOW) - 1}）`,
    src: RAW,
    allow: allow2,
    expectWarn: 'A5:allowlist',
  });
}

// ⑨ インライン on* の関数をまとめて呼ぶ関数を addEventListener で結線する
//    （001f はこの 1 編集で M2-0 が恒久 FAIL になった）。
{
  const called = [...new Set(onAttrFullSpans(RAW, A).flatMap((sp) => (sp.value
    .match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []).filter((n) => A._internal.byName.has(n))))];
  if (called.length) {
    const fn = uniqIn(RAW, '__opCallAllInline');
    const btn = uniqIn(RAW, '__opCallAllInlineBtn');
    OPS.push({
      label: `⑨インライン on* の ${called.length} 本をまとめて呼ぶ関数を addEventListener で結線`,
      src: insertHtml(insertTopLevelJs(RAW, A,
        `function ${fn}(){ ${called.map((n) => n + '();').join(' ')} }\n`
        + 'document.addEventListener(\'DOMContentLoaded\', function(){\n'
        + `  var b=document.getElementById('${btn}');\n`
        + `  if(b){ b.addEventListener('click', ${fn}); }\n});`),
      `<button type="button" id="${btn}">まとめて実行</button>`),
    });
  }
}

// --- ⑩ 在庫ゼロ①: #798 の死にコードを全件削除し allowlist も全掃除 ------------
const ZERO_DEAD = stripAllDeadFunctions(RAW);
{
  const allow2 = clone(ALLOW);
  allow2.static = [];
  allow2.runtime = [];
  allow2.bindings = [];
  // baseline は WI-7/8 の二重記帳（allowlist の件数と一致すること）なので、
  // allowlist を全掃除したら 0 に揃える。実測の dead_bindings（R3 warn）は
  // レポートに出たまま残り、運用側が改めて allowlist と baseline を起こし直す。
  // baseline の意味論が「実測値」と読める点は #816 H-6 で整理する。
  allow2.baseline = Object.assign({}, allow2.baseline, {
    static_unreachable: 0,
    runtime_unreachable: 0,
    dead_bindings: 0,
    top_level_functions: ZERO_DEAD.a.topLevelFunctionCount,
  });
  OPS.push({
    label: `⑩在庫ゼロ①: 到達不能な ${ZERO_DEAD.removed} 関数を全件削除し allowlist も全掃除`,
    src: ZERO_DEAD.src,
    allow: allow2,
  });
}
ok(ZERO_DEAD.a.unreachableStatic.length === 0 && ZERO_DEAD.a.unreachableRuntimeOnly.length === 0,
  `ZERO-1 死にコードを全件削除した状態を作れた（${ZERO_DEAD.removed} 関数 / ${ZERO_DEAD.rounds} 周・残り static=${ZERO_DEAD.a.unreachableStatic.length} runtime=${ZERO_DEAD.a.unreachableRuntimeOnly.length}）`);

// --- ⑪ 在庫ゼロ②: インライン on* を全件 addEventListener へ移行 ---------------
const ZERO_ON = migrateInlineHandlers(RAW, A);
const ZERO_ON_A = analyze(ZERO_ON.src);
OPS.push({
  label: `⑪在庫ゼロ②: インライン on* ${ZERO_ON.moved} 件を全件 addEventListener へ移行`,
  src: ZERO_ON.src,
});
ok(ZERO_ON_A.htmlHandlerCount === 0,
  `ZERO-2 HTML 直書きのインライン on* が 0 件の状態を作れた（${ZERO_ON.moved} 件を移行・実測 ${ZERO_ON_A.htmlHandlerCount}）`);
ok(onAttrFullSpans(ZERO_ON.src, ZERO_ON_A).length === 0,
  'ZERO-3 面から引ける on*= 属性も 0 件（＝ ON_SPANS[0] 型の添字参照が在れば必ずここで死ぬ）');

// --- ⑫ 複合メガ編集（①②⑤⑦ を一度に）---------------------------------------
{
  let mega = RAW;
  const name = uniqIn(mega, '__opMegaHandler');
  mega = insertHtml(insertTopLevelJs(mega, analyze(mega), `function ${name}(){ return 1; }`),
    `<button type="button" onclick="${name}()">mega</button>`);
  mega = insertHtml(mega, '<script>\nfunction __opMegaExtra(){ return 1; }\n__opMegaExtra();\n<\/script>\n');
  const megaA = analyze(mega);
  const megaId = uniqIn(mega, '__opMegaAbsentPanel');
  mega = insertTopLevelJs(mega, megaA,
    `var __megaFf=document.getElementById('${megaId}');\nif(__megaFf){__megaFf.style.display='none';}`);
  const megaBefore = insertTopLevelJsBefore(mega, analyze(mega),
    `function __opMegaRender(){ document.body.insertAdjacentHTML('beforeend','<div class="notice">x</div>'); }\n__opMegaRender();`);
  OPS.push({
    label: '⑫複合メガ編集（①②⑤⑦ を一度に）',
    src: megaBefore || mega,
    expectWarn: 'R3:#' + megaId,
  });
}

// --- ⑬ 在庫ゼロ①＋②を同時に（両方の在庫が尽きた状態）------------------------
{
  const both = migrateInlineHandlers(ZERO_DEAD.src, ZERO_DEAD.a);
  const bothA = analyze(both.src);
  const allow2 = clone(ALLOW);
  allow2.static = [];
  allow2.runtime = [];
  allow2.bindings = [];
  allow2.baseline = Object.assign({}, allow2.baseline, {
    static_unreachable: 0,
    runtime_unreachable: 0,
    dead_bindings: 0,
    top_level_functions: bothA.topLevelFunctionCount,
  });
  OPS.push({
    label: '⑬在庫ゼロ①＋②を同時に（死にコード 0 ＋ インライン on* 0）',
    src: both.src,
    allow: allow2,
  });
  ok(bothA.unreachableStatic.length === 0 && bothA.htmlHandlerCount === 0,
    `ZERO-4 両方の在庫が同時にゼロの状態を作れた（static=${bothA.unreachableStatic.length} on*=${bothA.htmlHandlerCount}）`);
}

for (const op of OPS) {
  const allow = op.allow || ALLOW;
  const problems = gateProblems(op.src, allow);
  const a = analyze(op.src);
  const v = evaluate(a, allow);
  ok(problems.length === 0,
    `OP[${op.label}] ゲートが緑（落ちた assert ${problems.length} 件: ${problems.slice(0, 4).join(' / ')}）`);
  if (op.expectWarn) {
    ok(v.warnings.map(sig).indexOf(op.expectWarn) >= 0,
      `OP[${op.label}] 検査2 の内容はレポートに出ている（黙って消していない）: ${op.expectWarn}`);
    ok(v.warnings.length > 0,
      `OP[${op.label}] WARN2 が 1 件以上＝ run_tests.sh の tail -1 で CI ログに載る（実測 ${v.warnings.length}）`);
  }
  console.log(`  ${problems.length === 0 ? '✓' : '✗'} ${op.label}: ERR=${v.errors.length} WARN2=${v.warnings.length}`);
}
{
  const omitted = [];
  if (!heavyFn) omitted.push('③（死んだ結線を含む関数が現存しない）');
  if (!inlineVictim) omitted.push('⑥⑨（実在のインライン on* が現存しない）');
  console.log(`  操作 ${OPS.length} 種を実測（在庫が尽きて省いた操作: ${omitted.join(' / ') || 'なし'}）`
    + '。在庫ゼロ耐性は ⑩⑪⑬ が常に担うので、ここでは在庫の存在を assert しない');
}

console.log(`PHASE1-REACH-001: PASS=${pass} FAIL=${fail} WARN2=${V.warnings.length}`);
process.exit(fail === 0 ? 0 : 1);
