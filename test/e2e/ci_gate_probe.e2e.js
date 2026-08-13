#!/usr/bin/env node
// ★一時ファイル: E2E-NOT-RUN-001 (#865) の受け入れ基準2 を CI 上で確認するためだけのもの。
//   「e2e を1本壊すと CI の E2E ジョブが failure になる」ことを実測したら、次のコミットで削除する。
//   ブラウザは起動しない（配線が効いているかだけを見るので、落ちる理由は単純なほどよい）。

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

ok(true, 'このスイート自体は実行されている（＝run_e2e.sh の glob に載っている）');
ok(false, '★意図的な失敗: これが CI を赤にできなければ、E2E ジョブは検査として機能していない');

console.log('\nE2E-CI-GATE-PROBE: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);
