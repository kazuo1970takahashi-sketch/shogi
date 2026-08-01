'use strict';
// =============================================================================
// PHASE1-REACH-001: shogi_v4.html の到達可能性スキャナ（ライブラリ・純 node / 依存ゼロ）
// -----------------------------------------------------------------------------
// Issue #798 の調査で使った走査ロジックを常設化したもの。実行は
// test/test_reachability_001.js（run_tests.sh の自動発見で CI にも載る）。
//
// このファイルは `test_*.js` に一致しないので run_tests.sh からは直接実行されない
// ＝ライブラリとしてのみ読み込まれる。
//
// 提供する検査は 2 つ:
//
//   検査1（静的到達可能性）
//     トップレベル `function NAME(` に対し、ルート（HTML のインライン属性 ＋
//     DOMContentLoaded 等のスクリプト直下の文）からの**推移的**到達可能性を計算する。
//
//   検査2（実行時到達可能性 ＝ bind 先の実在）
//     getElementById / querySelector(All) の引数に出る id / class のうち、
//     その id / class を**どこでも生成していない**ものを検出し、そこに結線された
//     ハンドラを「実行時に到達しない」として静的到達可能性から差し引く。
//
// #798 で実際に踏んだ 3 つの罠を、この実装は構造的に回避している:
//
//   (1) コメント内の言及を参照に数えない。
//       数えると finalizeAddPastParticipants が「生きている」と誤判定される
//       （HTML コメント + JS コメントで計 8 箇所言及されている）。
//       → 文字クラス 'X'（JS コメント / HTML コメント / <style>）は参照から除外する。
//
//   (2) JS 文字列内の "<script>" で走査領域を二重化しない。
//       得点表ポップアップ生成用に JS 文字列の中へ "<script>" が入っており、
//       単純な全文検索だと同じ領域を 2 回走査して参照数が 5〜10 倍に膨張する。
//       → </script> の直後から次を探す逐次スキャンにしている。
//
//   (3) 「定義以外の出現 0 回」方式は使わない。
//       それでは finalizeAddPastParticipants（呼び出し元が 1 つだけ存在し、その
//       呼び出し元自身が死んでいる）を拾えない。
//       → 呼び出しグラフ＋ルートからの到達可能性で判定する。
//
// 参照検出は意図的に**過剰に拾う側**へ倒してある（文字列リテラル・テンプレート
// リテラル・HTML 属性の中の識別子も参照として数える）。死にコードを見落とす方向
// には倒れない＝偽陽性より偽陰性を嫌う設計。
// =============================================================================

// 文字クラス。ファイルの全バイトにいずれか 1 つが付く。
const H = 72; // 'H' <script> の外（HTML マークアップ・onclick="NAME()" 等）→ 参照として数える
const C = 67; // 'C' JS コード本体                                        → 参照として数える
const S = 83; // 'S' 文字列 / テンプレート文字列部 / 正規表現リテラル      → 参照として数える
const X = 88; // 'X' JS コメント・HTML コメント・<style>                   → 数えない

const IDSTART = /[A-Za-z_$]/;
const IDCHAR = /[A-Za-z0-9_$]/;

// 正規表現リテラル判定で「直前が値ではない」ことを示すキーワード。
const KW_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

const PUNCT_BEFORE_REGEX = '([{,;:=!&|?+-*%~^<>';

function isIdStart(ch) { return IDSTART.test(ch); }
function isIdChar(ch) { return IDCHAR.test(ch); }

// -----------------------------------------------------------------------------
// <script> ブロックの切り出し（逐次スキャン＝罠(2)の回避）
// -----------------------------------------------------------------------------
function findScriptBlocks(src) {
  const blocks = [];
  const re = /<script([^>]*)>/g;
  let cursor = 0;
  for (;;) {
    re.lastIndex = cursor;
    const m = re.exec(src);
    if (!m) break;
    const attrs = m[1];
    const start = m.index + m[0].length;
    let end = src.indexOf('</script>', start);
    if (end === -1) end = src.length;
    cursor = end + '</script>'.length; // ← 次の探索は必ず閉じタグの後ろから
    if (attrs.indexOf('src=') >= 0) continue;
    if (attrs.indexOf('type=') >= 0 && attrs.indexOf('javascript') < 0) continue;
    blocks.push({ start, end });
  }
  return blocks;
}

// -----------------------------------------------------------------------------
// 字句解析: 文字クラス付与 ＋ トップレベル関数（brace depth 0）の本体スパン抽出
// -----------------------------------------------------------------------------
function lexBlock(text, base, cls, out) {
  const n = text.length;
  let i = 0;
  let depth = 0;
  let last = null;        // 直前の有意トークン（正規表現リテラル判定用）
  let pending = null;     // 本体 '{' を待っている深さ0の関数宣言
  const openStack = [];

  for (let k = 0; k < n; k++) cls[base + k] = C;

  const mark = (a, b, v) => { for (let k = a; k < b; k++) cls[base + k] = v; };

  while (i < n) {
    const ch = text[i];

    // 行コメント
    if (ch === '/' && i + 1 < n && text[i + 1] === '/') {
      let j = text.indexOf('\n', i);
      if (j === -1) j = n;
      mark(i, j, X);
      i = j;
      continue;
    }
    // ブロックコメント
    if (ch === '/' && i + 1 < n && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2);
      j = (j === -1) ? n : j + 2;
      mark(i, j, X);
      i = j;
      continue;
    }
    // 正規表現リテラル or 除算
    if (ch === '/') {
      const regexOk = last === null
        || (last.length === 1 && PUNCT_BEFORE_REGEX.indexOf(last) >= 0)
        || KW_BEFORE_REGEX.has(last)
        || last === '=>';
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n) {
          const c = text[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; break; }
          else if (c === '\n') break;
          j++;
        }
        if (closed) {
          let k = j + 1;
          while (k < n && isIdChar(text[k])) k++; // フラグ
          mark(i, k, S);
          i = k;
          last = 'regex';
          continue;
        }
      }
      last = '/';
      i++;
      continue;
    }
    // 文字列リテラル
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === q || text[j] === '\n') break;
        j++;
      }
      const end = Math.min(j + 1, n);
      mark(i, end, S);
      i = end;
      last = 'str';
      continue;
    }
    // テンプレートリテラル（${ } の内側はコード、外側は文字列）
    if (ch === '`') {
      let j = i + 1;
      let td = 0;
      let seg = i + 1;
      while (j < n) {
        const c = text[j];
        if (c === '\\') { j += 2; continue; }
        if (td === 0 && c === '`') break;
        if (td === 0 && c === '$' && j + 1 < n && text[j + 1] === '{') {
          mark(seg, j, S);
          td = 1;
          j += 2;
          continue;
        }
        if (td > 0) {
          if (c === '{') td++;
          else if (c === '}') { td--; if (td === 0) seg = j + 1; }
        }
        j++;
      }
      if (td === 0) mark(seg, Math.min(j, n), S);
      i = j + 1;
      last = 'tmpl';
      continue;
    }
    // 波括弧（深さ追跡＝トップレベル判定の根拠）
    if (ch === '{') {
      if (depth === 0 && pending) {
        openStack.push({ name: pending.name, namePos: pending.namePos, bodyStart: i });
        pending = null;
      }
      depth++;
      last = '{';
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && openStack.length) {
        const f = openStack.pop();
        out.topFunctions.push({
          name: f.name,
          namePos: f.namePos + base,
          bodyStart: f.bodyStart + base,
          bodyEnd: i + base,
        });
      }
      last = '}';
      i++;
      continue;
    }
    // 識別子
    if (isIdStart(ch)) {
      let j = i;
      while (j < n && isIdChar(text[j])) j++;
      const w = text.slice(i, j);
      if (w === 'function') {
        let k = j;
        while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n')) k++;
        if (k < n && isIdStart(text[k])) {
          let k2 = k;
          while (k2 < n && isIdChar(text[k2])) k2++;
          let k3 = k2;
          while (k3 < n && (text[k3] === ' ' || text[k3] === '\t' || text[k3] === '\n')) k3++;
          if (k3 < n && text[k3] === '(') {
            const nm = text.slice(k, k2);
            out.allFunctionDecls.push({ name: nm, namePos: k + base, depth });
            if (depth === 0) pending = { name: nm, namePos: k };
          }
        }
      }
      last = w;
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) last = ch;
    i++;
  }
}

// -----------------------------------------------------------------------------
// 本体
// -----------------------------------------------------------------------------
function analyze(src) {
  const N = src.length;
  const cls = new Uint8Array(N).fill(H);

  // HTML コメントと <style> は散文 / CSS ＝参照ではない（罠(1)）
  const markRaw = (a, b, v) => { for (let k = a; k < b; k++) cls[k] = v; };
  for (const m of src.matchAll(/<!--/g)) {
    let e = src.indexOf('-->', m.index + 4);
    e = (e === -1) ? N : e + 3;
    markRaw(m.index, e, X);
  }
  for (const m of src.matchAll(/<style[^>]*>/g)) {
    const s = m.index + m[0].length;
    let e = src.indexOf('</style>', s);
    if (e === -1) e = N;
    markRaw(s, e, X);
  }

  const blocks = findScriptBlocks(src);
  const out = { topFunctions: [], allFunctionDecls: [] };
  for (const b of blocks) lexBlock(src.slice(b.start, b.end), b.start, cls, out);

  const byName = new Map();
  for (const f of out.topFunctions) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  // 関数名の宣言位置（＝参照ではない）
  const declNamePos = new Set();
  for (const f of out.topFunctions) declNamePos.add(f.namePos);
  for (const d of out.allFunctionDecls) declNamePos.add(d.namePos);

  // 全単語出現のうち、既知の関数名だけを拾う
  const occ = new Map();
  for (const m of src.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    const w = m[0];
    if (!byName.has(w)) continue;
    const p = m.index;
    if (p > 0 && isIdChar(src[p - 1])) continue;
    if (!occ.has(w)) occ.set(w, []);
    occ.get(w).push(p);
  }

  // 位置 → その位置を含むトップレベル関数名
  const spans = out.topFunctions
    .map((f) => ({ s: f.bodyStart, e: f.bodyEnd, name: f.name }))
    .sort((a, b) => a.s - b.s);
  const spanStarts = spans.map((x) => x.s);
  function ownerOf(p) {
    let lo = 0;
    let hi = spanStarts.length - 1;
    let k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (spanStarts[mid] <= p) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (; k >= 0; k--) {
      if (spans[k].s <= p && p <= spans[k].e) return spans[k].name;
    }
    return null;
  }

  // --- 検査2の前段: bind 先が実在しないセレクタを洗い出す ---------------------
  const deadBindings = detectDeadBindings(src, cls);
  const deadRegions = buildDeadRegions(src, deadBindings, spans);
  const inDeadRegion = (p) => deadRegions.some((r) => p >= r.start && p < r.end);

  // --- 呼び出しグラフとルート -------------------------------------------------
  const graph = new Map();      // caller -> Set(callee)   （静的）
  const graphLive = new Map();  // caller -> Set(callee)   （死んだ結線を除いたもの）
  const roots = new Map();      // name -> [{pos, cls}]     （静的）
  const rootsLive = new Map();
  const refSites = new Map();   // name -> [{pos, owner, cls, dead}]
  const commentRefs = new Map();

  const addEdge = (g, from, to) => {
    if (!g.has(from)) g.set(from, new Set());
    g.get(from).add(to);
  };

  for (const [name, positions] of occ) {
    for (const p of positions) {
      if (declNamePos.has(p)) continue;
      const k = cls[p];
      if (k === X) { // コメント内の言及は参照ではない（罠(1)）
        commentRefs.set(name, (commentRefs.get(name) || 0) + 1);
        continue;
      }
      const o = ownerOf(p);
      const dead = inDeadRegion(p);
      if (!refSites.has(name)) refSites.set(name, []);
      refSites.get(name).push({ pos: p, owner: o, cls: String.fromCharCode(k), dead });
      if (o === null) {
        if (!roots.has(name)) roots.set(name, []);
        roots.get(name).push({ pos: p, cls: String.fromCharCode(k) });
        if (!dead) {
          if (!rootsLive.has(name)) rootsLive.set(name, []);
          rootsLive.get(name).push({ pos: p });
        }
      } else {
        addEdge(graph, o, name);
        if (!dead) addEdge(graphLive, o, name);
      }
    }
  }

  const reachFrom = (rootNames, g) => {
    const seen = new Set();
    const stack = [...rootNames];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      const cs = g.get(n);
      if (cs) for (const c of cs) if (!seen.has(c)) stack.push(c);
    }
    return seen;
  };

  const allNames = [...byName.keys()];
  const reachStatic = reachFrom(roots.keys(), graph);
  const reachRuntime = reachFrom(rootsLive.keys(), graphLive);

  const lineOf = (p) => {
    let line = 1;
    for (let k = 0; k < p; k++) if (src.charCodeAt(k) === 10) line++;
    return line;
  };

  const describe = (name) => {
    const f = byName.get(name)[0];
    return {
      name,
      line: lineOf(f.namePos),
      endLine: lineOf(f.bodyEnd),
      liveRefs: (refSites.get(name) || []).length,
      commentRefs: commentRefs.get(name) || 0,
      callers: [...new Set((refSites.get(name) || []).map((r) => r.owner).filter(Boolean))].sort(),
    };
  };

  const unreachableStatic = allNames
    .filter((n) => !reachStatic.has(n))
    .map(describe)
    .sort((a, b) => a.line - b.line);

  const unreachableRuntimeOnly = allNames
    .filter((n) => reachStatic.has(n) && !reachRuntime.has(n))
    .map(describe)
    .sort((a, b) => a.line - b.line);

  return {
    scriptBlocks: blocks.length,
    functionDeclsAllDepths: out.allFunctionDecls.length,
    topLevelFunctionCount: byName.size,
    rootNames: [...roots.keys()].sort(),
    unreachableStatic,
    unreachableRuntimeOnly,
    deadBindings: deadBindings.map((d) => ({
      selector: d.selector, kind: d.kind, line: lineOf(d.pos),
    })),
    // 検算・デバッグ用
    _internal: { cls, byName, graph, roots, refSites, lineOf },
  };
}

// -----------------------------------------------------------------------------
// 検査2-a: どこでも生成されていない id / class を検出する
//   判定は「セレクタ引数以外の位置に、コメント外で 1 度でも出現するか」。
//   出現しなければ、その要素は DOM に存在しえない＝そこに結線したハンドラは発火しない。
// -----------------------------------------------------------------------------
function detectDeadBindings(src, cls) {
  const found = [];
  const seen = new Set();

  const scan = (re, kind) => {
    for (const m of src.matchAll(re)) {
      const key = m[1];
      const argStart = m.index + m[0].indexOf(key);
      if (cls[m.index] === X) continue; // コメント内のサンプルコードは対象外
      found.push({ kind, key, pos: m.index, argStart, argEnd: argStart + key.length });
    }
  };
  // getElementById('id') / getElementById("id")
  scan(/getElementById\(\s*'([^']+)'\s*\)/g, 'id');
  scan(/getElementById\(\s*"([^"]+)"\s*\)/g, 'id');
  // querySelector('.cls') / querySelectorAll('.cls')（単純クラスセレクタのみ）
  scan(/querySelectorAll?\(\s*'\.([A-Za-z0-9_-]+)'\s*\)/g, 'class');
  scan(/querySelectorAll?\(\s*"\.([A-Za-z0-9_-]+)"\s*\)/g, 'class');

  // キーごとに「セレクタ引数の位置」を集める
  const argRanges = new Map();
  for (const f of found) {
    if (!argRanges.has(f.key)) argRanges.set(f.key, []);
    argRanges.get(f.key).push([f.argStart, f.argEnd]);
  }

  for (const f of found) {
    if (seen.has(f.kind + ':' + f.key)) continue;
    const ranges = argRanges.get(f.key);
    // id / class は '-' を含むので単語境界に '-' も入れる
    const re = new RegExp('(?<![A-Za-z0-9_$-])' + escapeRe(f.key) + '(?![A-Za-z0-9_$-])', 'g');
    let produced = 0;
    for (const m of src.matchAll(re)) {
      const p = m.index;
      if (cls[p] === X) continue;                                  // コメント / CSS は生成ではない
      if (ranges.some(([a, b]) => p >= a && p < b)) continue;      // セレクタ引数そのもの
      produced++;
    }
    if (produced === 0) {
      seen.add(f.kind + ':' + f.key);
      found.filter((g) => g.kind === f.kind && g.key === f.key).forEach(() => {});
      f.selector = (f.kind === 'id' ? '#' : '.') + f.key;
      f.dead = true;
    }
  }
  return found.filter((f) => f.dead);
}

// -----------------------------------------------------------------------------
// 検査2-b: 死んだセレクタの「影響範囲」を決める
//   規則（単純・説明可能・この repo の bind 関数の書き方に一致）:
//     死んだセレクタの呼び出し位置から前方へ、
//       (a) 次の document.getElementById( / querySelector( / querySelectorAll( の位置、
//       (b) 内包するトップレベル関数の本体末尾、
//     のいずれか早い方まで。
//   bind 関数は `var x=document.getElementById(...); if(x)x.addEventListener(...)` の
//   並びで書かれているため、この区間はちょうど 1 つの結線ブロックに対応する。
// -----------------------------------------------------------------------------
function buildDeadRegions(src, deadBindings, spans) {
  const nextSelectorPos = [];
  for (const m of src.matchAll(/document\.(?:getElementById|querySelectorAll|querySelector)\s*\(/g)) {
    nextSelectorPos.push(m.index);
  }
  nextSelectorPos.sort((a, b) => a - b);

  const regions = [];
  for (const d of deadBindings) {
    let end = src.length;
    for (const p of nextSelectorPos) {
      if (p > d.pos) { end = p; break; }
    }
    for (const s of spans) {
      if (s.s <= d.pos && d.pos <= s.e) { end = Math.min(end, s.e); break; }
    }
    regions.push({ start: d.pos, end, selector: d.selector });
  }
  return regions;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { analyze, findScriptBlocks };
