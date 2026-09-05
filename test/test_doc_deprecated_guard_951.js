#!/usr/bin/env node
// @suite: DOC-GUARDS-001 (#951) 廃止概念の文書ガード（docs/DEPRECATED.md × 先頭宣言）
// 保証すること（1文）: docs/DEPRECATED.md に登録された廃止概念の語彙を含む文書ファイルは、
//   先頭 10 行に `<!-- deprecated: <id> -->` の宣言を持つ。
// 保証しないこと: 行ごとの生死（引用・取り消し線・近接の失効注記）。免除規則は
//   「ファイル先頭の宣言」以外に持たない（#946 で Codex が示した抜け道を持ち込まない）。
// 赤にする条件は 3 つだけ: (a) 語彙あり・宣言なし／(b) 宣言あり・語彙なし／
//   (c) 宣言の id が一覧に無い。
// Markdown のコード文脈は認識しない（先頭 10 行にあれば例示でも宣言）。語彙の照合からは宣言コメントだけ除く。
// 読み取り専用・実データ不使用。
const fs = require('fs');
const path = require('path');
const target = process.argv[2] || 'shogi_v4.html';
const ROOT = path.dirname(path.resolve(target));
const DOCS = path.join(ROOT, 'docs');
const HEAD_LINES = 10;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const done = () => { console.log('DOC-GUARDS-001: PASS=' + pass + ', FAIL=' + fail); process.exit(fail ? 1 : 0); };

// ---- 0. DEPRECATED.md の json ブロックを読む（表は解析しない）
let registry = null, regErr = '';
try {
  const md = fs.readFileSync(path.join(DOCS, 'DEPRECATED.md'), 'utf8');
  const m = md.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error('```json ブロックが無い');
  registry = JSON.parse(m[1]);
  if (!Array.isArray(registry) || registry.length === 0) throw new Error('配列が空');
  registry.forEach(e => {
    if (typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) throw new Error('id 不正: ' + JSON.stringify(e.id));
    if (!Array.isArray(e.vocabulary) || e.vocabulary.length === 0) throw new Error(e.id + ': vocabulary が空');
    e.re = e.vocabulary.map(s => new RegExp(s, 'u'));
  });
} catch (e) { regErr = e.message; }
ok(!regErr, 'R0 docs/DEPRECATED.md の json ブロックを読めること: ' + regErr);
if (regErr) done();
const ids = new Set(registry.map(e => e.id));

// ---- 1. 対象ファイル（除外: CHANGELOG.md / changelog.d / ai-ops / DEPRECATED.md）
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (/\.(md|html)$/.test(d.name)) out.push(p);
  });
  return out;
}
const files = []
  .concat(walk(path.join(DOCS, 'specs'), []))
  .concat(walk(path.join(DOCS, 'notes'), []))
  .concat(['REFERENCE.md', 'STYLE-GUIDE.md', 'install_guide.html'].map(f => path.join(DOCS, f)))
  .concat(fs.readdirSync(DOCS).filter(f => /^manual_.*\.html$/.test(f)).map(f => path.join(DOCS, f)))
  .filter(f => fs.existsSync(f))
  .sort();
ok(files.length > 0, 'S0 対象ファイルが 1 本以上あること');

// ---- 2. 3 条件
// 宣言 = 先頭 10 行に現れる `<!-- deprecated: id -->`。Markdown のコード文脈は**認識しない**
// （作者裁定 2026-09-05・案A）。先頭 10 行にあれば例示でも読者に見えるので宣言として数える。
// 検査器が Markdown パーサになる道（```/~~~/行頭/入れ子…）をここで閉じる。
const DECL_RE = /<!--\s*deprecated:\s*([a-z0-9-]+(?:\s*,\s*[a-z0-9-]+)*)\s*-->/g;
files.forEach(f => {
  const rel = path.relative(ROOT, f);
  const text = fs.readFileSync(f, 'utf8');
  const head = text.split('\n').slice(0, HEAD_LINES).join('\n');

  const declared = new Set();
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(head)) !== null) m[1].split(',').forEach(s => declared.add(s.trim()));

  // (c) 一覧に無い id
  declared.forEach(id => ok(ids.has(id), '(c) ' + rel + ': 宣言 id "' + id + '" が docs/DEPRECATED.md に無い'));

  // 語彙の照合は本文全体から、宣言コメントそのものだけを除いて行う
  // （id が語彙と重なっても (b) が生きる・Codex 2巡目 P2）。
  const body = text.replace(DECL_RE, '');
  registry.forEach(e => {
    const hit = e.re.find(re => re.test(body));
    const has = declared.has(e.id);
    // (a) 語彙あり・宣言なし
    ok(!(hit && !has), '(a) ' + rel + ': 廃止概念 "' + e.id + '" の語彙 ' + hit + ' を含むのに先頭に <!-- deprecated: ' + e.id + ' --> が無い');
    // (b) 宣言あり・語彙なし
    ok(!(has && !hit), '(b) ' + rel + ': <!-- deprecated: ' + e.id + ' --> が有るのに語彙が 1 つも無い（宣言が腐っている）');
  });
});

done();
