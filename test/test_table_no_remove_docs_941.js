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
const DEMANDS = /第 ?\(?i ?\+ ?1\)? ?卓|第 N 卓|卓番号/;
// 失効が明示されている行、または直後に失効注記が続くブロック
// ★ 「#941」「TABLE-NO-REMOVE」を引用しただけの行（例: 「#941: 卓番号を表示する」）を
//   失効扱いにすると、要求を戻した行が素通りする（Codex 4巡目）。明示的な印だけを免除する。
const SUPERSEDED = /失効|廃止|~~[^~]*卓番号[^~]*~~/;

const files = fs.readdirSync(SPEC_DIR).filter(f => f.endsWith('.md'));
ok(files.length > 0, 'docs/specs/ の md を読めること（実測 ' + files.length + '本）');

const offenders = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(SPEC_DIR, f), 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!DEMANDS.test(lines[i])) continue;
    if (SUPERSEDED.test(lines[i])) continue;
    // ★ 失効注記そのもの（引用ブロック）が「第 N 卓」に言及するので、引用行は対象外にする。
    //   これを入れないと自分の注記を自分で検出する（最初これで偽の赤を出した）。
    if (/^\s*>/.test(lines[i])) continue;
    // 原文を残して前後に注記を添える形も可とする（前6行・後6行を見る）
    const near = lines.slice(Math.max(0, i - 6), i).concat(lines.slice(i + 1, i + 7)).join('\n');
    if (SUPERSEDED.test(near)) continue;
    offenders.push(f + ':' + (i + 1) + ' ' + lines[i].trim().slice(0, 70));
  }
}
ok(offenders.length === 0,
  '卓番号を要求したままの記述が docs/specs/ に残っている:\n      ' + offenders.join('\n      '));

// 正本側にも撤去が書かれていること（索引と詳細の両方で辻褄が合う）
const ref = fs.readFileSync(path.join(ROOT, 'docs', 'REFERENCE.md'), 'utf8');
ok(/卓番号は廃止/.test(ref), 'docs/REFERENCE.md に卓番号の廃止が書かれている');
ok(!/\*\*卓番号\*\* = 描画時の `index \+ 1`/.test(ref), 'docs/REFERENCE.md に旧契約が残っていない');

console.log('TABLE-NO-REMOVE-DOCS-941: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);
