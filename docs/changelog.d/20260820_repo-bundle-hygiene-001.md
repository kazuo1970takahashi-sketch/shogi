## REPO-BUNDLE-HYGIENE-001: 追跡されたままの受け渡し用 bundle を撤去

- repo 直下に tracked のまま残っていた `phase1_master_rebuild.bundle` / `phase1_p3.bundle` /
  `preset_history.bundle`（計 38KB・すべて着地済みの受け渡し物）を削除。内容は git 履歴に残る。
- `.gitignore` の `/*.bundle` は untracked のものにしか効かない。**無視規則があること**と
  **いま追跡ゼロであること**は別の命題なので、後者を測る `test/test_no_tracked_bundles.sh` を新設。
- 同テストは「追跡ゼロ」が空振りしやすい形であることを踏まえ、同じ検査関数を
  bundle を1本コミットした使い捨て sandbox repo にも当て、**検出できること・追跡を外すと
  0 件に戻ること**をテスト自身の中で確かめる。検査が盲目になると C1/C2 が赤くなる。
- 反証パネル3本すべてで赤を確認（追跡 bundle を戻す→A1／`/*.bundle` を消す→B1／
  検査パターンを落とす→C1・C2）。
- 編集範囲は上記 bundle 3本の削除・新規テスト・本断片のみ。`shogi_v4.html` / `app/` /
  `test/run_tests.sh` / `.github/` は無変更。
