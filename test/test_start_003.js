#!/usr/bin/env node
// SHOGI-TOUR-START-003（受付タブのクラス別「1局目を作成」導線）は
// START-UX-CONSOLIDATE-001 で撤去されました。本ファイルは撤去済みを示す最小スタブです。
//
// 撤去された受付タブの開始導線（reg-class-start 系）:
//   - DOM:    a-start-btn / b-start-btn / reg-start-btn-{classId}（class="reg-class-start"）
//   - helper: regClassStartBtnId / describeClassStartButton / buildClassStartConfirmMessage /
//             renderClassStartButton / onClickClassStart / bindClassStartHandlers
//   - CSS:    .reg-class-start / .reg-class-start:disabled / .reg-class-start-started:disabled
//
// 開始導線は対局管理タブ（startBtnClass_{cls} → startTournamentForClass(cls)）に集約されました。
// 受付タブの readiness 表示（START-001: describeClassReadiness / renderClassReadiness）は
// 読み取り専用の情報表示として残置されています。
//
// 新仕様（撤去の確認・#startBtn のナビ専用化・クラス別開始の保持・validateStartableClass 不変）は
//   test/test_start_ux_consolidate_001.js
// が担保します。本ファイルは test/run_tests.sh から登録解除済みで、スイートからは実行されません。
//
// 旧 START-003 の期待値・旧関数の import・旧仕様依存の assertion は意図的に残していません
// （撤去済みマーカーのみ）。直接実行された場合も撤去済みである旨を表示して正常終了します。

console.log('SHOGI-TOUR-START-003 は START-UX-CONSOLIDATE-001 で撤去済み。');
console.log('撤去確認は test/test_start_ux_consolidate_001.js が担保します。');
process.exit(0);
