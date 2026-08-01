'use strict';
// APP-ISOLATED [PHASE1-ISOLATE-001]
//   テスト共通の「関数だけを空環境で評価する」隔離ヘルパ（スライス3）。
//
//   これまで extractFn 系 7 本が自前で複製していた
//     extractFn(RAW, name) → new Function(prelude + srcs.join('\n') + ';return {…}')
//   を 1 箇所に集約する。
//
//   ★ 隔離は欠陥ではなく検出装置である（test/lib/MIGRATION.md §6）。
//     対象関数が state 依存や新しい関数依存を獲得すると、隔離環境では ReferenceError で即 FAIL する。
//     したがって本ヘルパは「足りない依存を全束から自動で補う」ことを絶対にしない。
//     bare 参照は握り潰さず**実際に throw させる**（`iso.missing` はその付随記録にすぎない）。
//
//   loadApp（全束評価・app_harness.js）との違い:
//     ・見えるのは JS 言語標準（Object/Array/JSON/Math/Date/Promise/RegExp/…）と prelude で明示した名前だけ
//     ・Node のグローバル（console 等）は既定で遮断する。new Function 実装だった旧 7 本は
//       Node の globalThis が透過していたので、ここは**検出力が上がる**方向の差になる（RESULT の表を参照）
//     ・prelude は「名前→値」のオブジェクト形。既定は空＝**state を置かない**
//
//   詳細と移行レシピは test/lib/MIGRATION.md §6 / §7。

const vm = require('vm');
const H = require('./app_harness');

const APP_ISOLATED_VERSION = 1;

// ---------------------------------------------------------------- 切り出し器
//
// 旧 extractFn（7 本すべて同一アルゴリズム）: `function NAME(` から brace 対応の `}` まで。
// この実装が旧実装と byte 一致することは、セルフテスト test/test_app_isolated_001.js が
// **対象関数全件**に対して毎回検査する（参照実装はセルフテスト側に持つ）。
function extractFn(source, name) {
  const idx = source.indexOf('function ' + name + '(');
  if (idx < 0) return null;
  let depth = 0;
  let i = source.indexOf('{', idx);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(idx, i + 1); }
  }
  return null;
}

// ---------------------------------------------------------------- 遮断リスト
//
// vm の新規コンテキストに Node が注入するグローバル（実測 Node 20: console のみ。
// process / Buffer / setTimeout / crypto / fetch / require はそもそも入らない）。
// prelude で明示的に渡された名前は遮断しない（＝意図的な線引きとして記録される）。
const NODE_INJECTED_GLOBALS = ['console'];

function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// 素の（Proxy でない）global を持つ vm コンテキストを作る。
//   ★ここをスコープ Proxy（has:()=>true）にすると、与えていない名前の参照が undefined を返すだけになり、
//     「依存の獲得」を検出できなくなる（B-iso5）。bare 参照は必ず ReferenceError にすること。
function makeMinimalContext(blocked) {
  const sandbox = {};
  vm.createContext(sandbox);
  if (blocked.length) {
    sandbox.__isoBlocked = blocked;
    vm.runInContext(
      'for (var __i = 0; __i < __isoBlocked.length; __i++) { try { delete globalThis[__isoBlocked[__i]]; } catch (e) {} }'
      + ' delete globalThis.__isoBlocked;', sandbox, { filename: 'app_isolated#block' });
  }
  return sandbox;
}

function missingNameOf(err) {
  if (!err || typeof err.message !== 'string') return null;
  const m = err.message.match(/^([A-Za-z_$][\w$]*) is not defined$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- loadIsolated
//
//   const iso = loadIsolated(['bulkAddPlayers', 'normalizeYomi'], {
//     prelude: { escapeHtml: (s) => String(s) },   // 意図的に与える依存だけを明示的に置く
//     target: 'shogi_v4.html',                     // 省略時 process.argv[2] || 'shogi_v4.html'
//   });
//   iso.fn('bulkAddPlayers')(rows, st)
//   iso.missing    // 実行中に ReferenceError になった名前（＝獲得された依存）の記録
//
function loadIsolated(names, opts) {
  opts = opts || {};
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('[app_isolated] names は 1 件以上の配列で渡すこと');
  }
  for (let i = 0; i < names.length; i++) {
    if (names.indexOf(names[i]) !== i) throw new Error('[app_isolated] names に重複: ' + names[i]);
  }
  const tgt = opts.target || H.defaultTarget();
  const html = H.readHtml(tgt);
  const prelude = opts.prelude || {};
  const preludeNames = Object.keys(prelude);

  // prelude が切り出し対象と衝突したら例外（loadApp の clobber ガードと同じ考え方）。
  // 評価時に本物の定義で黙って上書きされ、stub のつもりが無効化される事故を機械的に潰す。
  const collided = preludeNames.filter((k) => names.indexOf(k) >= 0);
  if (collided.length) {
    throw new Error('[app_isolated] prelude の名前が切り出し対象と衝突している: ' + collided.join(', ')
      + '\n  → 切り出し対象から外すか、prelude の名前を変えること'
      + '（同名を「与えたつもり」でアプリ本体の定義が勝つ事故を防ぐ）');
  }

  // 切り出し（束は束のまま。相互呼出しが密なので分割しない＝MIGRATION.md §6）
  const sources = Object.create(null);
  const parts = [];
  for (const n of names) {
    const s = extractFn(html, n);
    if (!s) throw new Error('[app_isolated] 切り出し失敗: ' + n + '（' + tgt + ' に function ' + n + '( が無い）');
    sources[n] = s;
    parts.push(s);
  }
  const code = parts.join('\n');

  // --- 最小コンテキスト --------------------------------------------------------
  const blocked = NODE_INJECTED_GLOBALS.filter((n) => !hasOwn(prelude, n));
  const sandbox = makeMinimalContext(blocked);
  for (const k of preludeNames) sandbox[k] = prelude[k];
  const preValues = new Map();
  for (const k of preludeNames) preValues.set(k, sandbox[k]);

  vm.runInContext(code, sandbox, { filename: tgt + '#isolated(' + names.join(',') + ')', displayErrors: true });

  // prelude が評価で潰されていないこと（衝突検査を素通りする間接的な上書きの検出）
  const clobbered = preludeNames.filter((k) => sandbox[k] !== preValues.get(k));
  if (clobbered.length) {
    throw new Error('[app_isolated] prelude がアプリ側の定義で上書きされた: ' + clobbered.join(', '));
  }

  const missing = [];
  function note(err) {
    const n = missingNameOf(err);
    if (n && missing.indexOf(n) < 0) missing.push(n);
  }

  const iso = {
    APP_ISOLATED_VERSION,
    target: tgt,
    names: names.slice(),
    preludeNames: preludeNames.slice(),
    sources,
    source: code,
    ctx: sandbox,
    missing,

    has(name) { return hasOwn(sandbox, name) || typeof sandbox[name] !== 'undefined'; },
    // ラップしない生の関数（同一性比較用）
    raw(name) { return sandbox[name]; },
    // 実行時 ReferenceError の名前を missing に記録して**そのまま再送出**するラッパ
    fn(name) {
      const f = sandbox[name];
      if (typeof f !== 'function') {
        throw new Error('[app_isolated] 関数ではない/未定義: ' + name + ' (typeof=' + typeof f + ')');
      }
      return function isolatedCall(...args) {
        try {
          return f.apply(this, args);
        } catch (e) {
          note(e);
          // ★ここで「補って再試行」しない。全束から引く（B-iso3）のも undefined を置く（B-iso5）のも、
          //   隔離＝検出装置を空洞化させる。missing は記録するだけで、例外はそのまま呼び出し側へ返す。
          throw e;
        }
      };
    },
    call(name, ...args) { return iso.fn(name).apply(null, args); },
    // 切り出した全関数を { 名前: ラップ済み関数 } で返す（旧 `return {a:a,b:b}` 相当）
    api() {
      const out = {};
      for (const n of names) if (typeof sandbox[n] === 'function') out[n] = iso.fn(n);
      return out;
    },
  };

  return iso;
}

module.exports = {
  APP_ISOLATED_VERSION,
  loadIsolated,
  extractFn,
  NODE_INJECTED_GLOBALS,
  readHtml: H.readHtml,
  defaultTarget: H.defaultTarget,
};
