#!/usr/bin/env node
// changelog 断片にテストの件数を書かない。
//   件数はテスト自身の出力が正本で、散文に書くと検査を足すたびに腐る
//   （2026-09-02 に同じ PR 群で 3 回腐った: 21→26→27）。腐った数字は逆の契約を伝える。
// 使い方: node test/test_changelog_no_test_counts.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'docs', 'changelog.d');
// 対象は 2026-09-01 以降の断片（それ以前は CHANGELOG.md へ連結済みの履歴なので触らない）
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && /^\d{8}_/.test(f) && f >= '20260901');
// テスト名の近く（同じ行）に「N件」「PASS=N」「N/0」が出たら件数の記載とみなす
const RE = /(test\/|e2e|検査|スイート)[^\n]*?(\d+\s*件|PASS=\d+|\b\d+\/0\b)|(\d+\s*件|PASS=\d+)[^\n]*?(test\/|\.e2e\.js|\.js）)/;
let bad = [];
for (const f of files) {
  // ★ 行単位だと「テスト名」と「N件」が折り返しで別の行に割れたときに素通りする
  //   （まさに落とした 39件 がその形だった・Codex 4巡目）。箇条書き1本＝継続行を連結して見る。
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  const items = []; let cur = null;
  lines.forEach((l, i) => {
    if (/^\s*[-*]\s/.test(l) || /^#/.test(l) || !l.trim()) { cur = { start: i + 1, text: l }; items.push(cur); }
    else if (cur) cur.text += ' ' + l.trim(); else { cur = { start: i + 1, text: l }; items.push(cur); }
  });
  items.forEach(it => { if (RE.test(it.text)) bad.push(f + ':' + it.start + ' ' + it.text.trim().slice(0, 80)); });
}
if (bad.length) { console.error('  x changelog にテストの件数が書かれている:\n      ' + bad.join('\n      ')); }
console.log('CHANGELOG-NO-TEST-COUNTS: PASS=' + (bad.length ? 0 : 1) + ' FAIL=' + (bad.length ? 1 : 0) + '（対象 ' + files.length + ' 本）');
process.exit(bad.length ? 1 : 0);
