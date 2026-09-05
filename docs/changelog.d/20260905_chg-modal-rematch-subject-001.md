## CHG-MODAL-REMATCH-SUBJECT-001: 対戦相手変更の「（再戦になる）」を実際に再戦になるペアの氏名で名指す（#838）

- **問題**: 8/9 当日、卓「04×01」の後手候補 07 に「（再戦になる）」が出たが 04 と 07 は未対戦。真因は玉突きで動く 01×03 の再戦。`classifyChangePairingCandidate` の swap 判定が短絡 OR で「どちらの項で落ちたか」を持たず、ラベルが候補の行に貼られるため幹事が誤読する（R-rematch-swap の 34% がこの形）。
- **修正**: swap 経路で両項を評価し、該当した実ペアを `rematchPairs:[[a,b],…]` で返す（`R-rematch-swap` のときだけ）。新設の純関数 `buildRematchReasonLabel` がそのペアを氏名で名指す（候補本人が当事者＝「<残る人>と再戦」／無関係＝「<a>×<b>が再戦」／2組＝「・」連結・カッコ無し）。判定条件・replace 経路（#884）・到達不能 alert とその pin は不変。
- テスト: `test/test_chg_modal_rematch_subject_838.js`（`test_pairing_classify_001.js` の `[6a-2]` は characterization の意図的更新）
