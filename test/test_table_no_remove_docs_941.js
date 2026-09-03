#!/usr/bin/env node
// TABLE-NO-REMOVE-001 (#941): 設計の正本に「卓番号を出せ」という記述が生き残っていないこと。
//
//   なぜ要るか（Codex 2巡目 P2 の指摘）: `docs/REFERENCE.md` は
//   「**矛盾時は specs が正**」と宣言している。卓番号を実装から外しても
//   `docs/specs/` 側に「`buildCurrentPairingsHtml` の既存出力（卓番号…）は変えない」等が
//   残っていると、**権威の連鎖をたどった人はこの撤去を退行とみなしてバッジを戻す**。
//   実際 Codex 1巡目では REFERENCE.md だけ直して specs を見落としていた。
//
//   ★ ここで測るのは「文書そのもの」なので、文面を読む検査でよい（実装の代理ではない）。
//   ★ 履歴（docs/CHANGELOG.md）は当時の事実の記録なので対象外。書き換えない。
//
// 使い方: node test/test_table_no_remove_docs_941.js
// 終了コード 0=全PASS / 1=失敗。

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  x ' + m); } };

const ROOT = path.join(__dirname, '..');
const SPEC_DIR = path.join(ROOT, 'docs', 'specs');

// 「卓番号を出す」ことを要求している疑いのある行（数・単位としての「卓」は対象外）
const DEMANDS = /第 ?\(?i ?\+ ?1\)? ?卓|第 N 卓|卓番号|index ?\+ ?1/;
// ★ 免除は**同じ行に明示の印がある場合だけ**。近接（前後N行）や引用ブロックでの免除は
//   Codex 4〜5巡目で3回穴を突かれた（「> #941: 卓番号を表示する」／失効注記の近くの生きた要求）。
//   規則を1つにする: 要求に見える行は、その行自身が 失効/廃止/取り消し線 を持たなければ赤。
const SUPERSEDED = /失効|廃止|~~/;

function scan(file, text){
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (DEMANDS.test(l) && !SUPERSEDED.test(l)) out.push(file + ':' + (i + 1) + ' ' + l.trim().slice(0, 70));
  });
  return out;
}
const files = fs.readdirSync(SPEC_DIR).filter(f => f.endsWith('.md'));
ok(files.length > 0, 'docs/specs/ の md を読めること（実測 ' + files.length + '本）');
let offenders = [];
for (const f of files) offenders = offenders.concat(scan('specs/' + f, fs.readFileSync(path.join(SPEC_DIR, f), 'utf8')));
const ref = fs.readFileSync(path.join(ROOT, 'docs', 'REFERENCE.md'), 'utf8');
offenders = offenders.concat(scan('REFERENCE.md', ref));
ok(offenders.length === 0,
  '卓番号を要求したままの行（同じ行に 失効/廃止/取り消し線 が無い）:\n      ' + offenders.join('\n      '));
ok(/卓番号は廃止/.test(ref), 'docs/REFERENCE.md に卓番号の廃止が書かれている');

console.log('TABLE-NO-REMOVE-DOCS-941: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);
