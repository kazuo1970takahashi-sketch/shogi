#!/usr/bin/env node
// PRELUDE-CENSUS [PHASE1-ISOLATE-001]
//   隔離モードへ移行したテストが loadIsolated に渡している prelude 名を機械的に列挙し、
//   移行前（--base の revision）の評価文字列で同じ名前が供与されていたかを突き合わせる。
//
//   受け入れ基準「prelude 追加名の表／現行供与との差分（増えていないこと）」の再現手段。
//   ここで **なし（追加）** と出た名前は「意図的な線引き」として RESULT に理由を書くこと。
//
//   使い方（リポジトリ root から）:
//     node test/lib/prelude_census.js [--base <移行前の git revision>]
//
//   ※ run_tests.sh の自動発見（test/test_*.js）には一致しない（test/lib/ 配下のため）。

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
function opt(name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }
const BASE = opt('--base', 'd325d389d2892aff902c63d9711c639ea2365409');

const FILES = [
  'test_class_variable_002.js',
  'test_player_swap_001.js',
  'test_player_swap_002.js',
  'test_bulk_entry_001.js',
  'test_guest_tournament_001.js',
  'test_master_sync_clarity_001.js',
  'test_cloud_history_scoreboard_765.js',
];

// 対応する } まで（brace バランス）
function braceBody(s, start) {
  let d = 1, j = start;
  while (d > 0 && j < s.length) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') d--;
    j++;
  }
  return s.slice(start, j - 1);
}

// オブジェクトリテラル直下のキー（`name:` と shorthand method `name(`）だけを拾う
function topLevelKeys(body) {
  const out = new Set();
  const re = /[{}]|(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*[:(]/gm;
  let d = 0, m;
  while ((m = re.exec(body)) !== null) {
    const tok = m[0].trim();
    if (tok === '{') { d++; continue; }
    if (tok === '}') { d--; continue; }
    if (d === 0 && m[1]) out.add(m[1]);
  }
  return out;
}

function preludeNames(src) {
  const names = new Set();
  const patterns = [/prelude:\s*(?:prelude \|\| )?\{/g, /buildEnv\(\s*\[[^\]]*\],\s*\{/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) for (const k of topLevelKeys(braceBody(src, m.index + m[0].length))) names.add(k);
  }
  return [...names].sort();
}

let total = 0, added = 0;
console.log('| ファイル | 新 prelude 名 | 移行前の供与 | 判定 |');
console.log('|---|---|---|---|');
for (const f of FILES) {
  const now = fs.readFileSync(path.join(ROOT, 'test', f), 'utf8');
  const old = cp.execSync('git show ' + BASE + ':test/' + f, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const names = preludeNames(now);
  if (!names.length) { console.log('| ' + f + ' | （なし＝空 prelude） | — | 増減なし |'); continue; }
  for (const n of names) {
    total++;
    const supplied = new RegExp('(function\\s+' + n + '\\s*\\(|var\\s+' + n + '\\s*=|\\b' + n + '\\s*:|\\b' + n + '\\s*=)').test(old);
    if (!supplied) added++;
    console.log('| ' + f + ' | `' + n + '` | ' + (supplied ? 'あり' : '**なし（追加）**') + ' | ' + (supplied ? '同等' : '要記録') + ' |');
  }
}
console.log('');
console.log('合計 ' + total + ' 名 / 追加 ' + added + ' 名');
