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
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((l, i) => { if (RE.test(l)) bad.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 80)); });
}
if (bad.length) { console.error('  x changelog にテストの件数が書かれている:\n      ' + bad.join('\n      ')); }
console.log('CHANGELOG-NO-TEST-COUNTS: PASS=' + (bad.length ? 0 : 1) + ' FAIL=' + (bad.length ? 1 : 0) + '（対象 ' + files.length + ' 本）');
process.exit(bad.length ? 1 : 0);
