## CHANGELOG-MERGE-ATOMIC-001: 永続transaction方式へ再設計

- `scripts/changelog_merge.sh` の連結処理を、rollback中心の方式から永続transaction方式へ変更。
- CHANGELOGと同じfilesystemにatomic `mkdir` lockを作り、既存lockはactive/staleを推測せず
  fail closed（exit 3）にする。lock取得クリティカル区間はsignalを一時保留し、owner無しlockを残さない。
- live断片は永続transactionのquarantineへ`rename`してからsnapshotを作成する。
  移動前にhard-link probeで断片とCHANGELOGが同一filesystemであることを確認し、cross-FSは拒否する。
  成功した同じ実行ではquarantineを削除しないため、rename前から開かれていたfile descriptorによる
  遅延書込みも元inodeに残り、消失しない。
- CHANGELOGの同一filesystem `rename`を唯一のcommit pointとし、commit後はrollbackしない。
  `preparing` / `prepared` / `committing` / `committed` / `aborted` のstateをatomic更新する。
- crash後の`committing`は、保持した`changelog.before`・`published.image`と現在のCHANGELOGを比較し、
  commit済み・未commitを確定する。どちらとも一致しない場合は曖昧状態としてexit 3で停止する。
- commit前の断片復元はhard-link作成をatomic no-clobber pointにする。同名liveが再作成されていれば
  上書きせず、liveとquarantineの双方を保持してexit 3にする。
- 空・空白のみの断片は変更前に全件拒否。`--dry-run`、`--position top/end`、決定的なファイル名順、
  断片ゼロno-opを維持。
- `test/test_changelog_merge.sh` を新設計に合わせて更新し、排他lock、commit前後crash recovery、
  signal、曖昧crash、同名再作成race、open fdへのpost-rename write、commit後の並行CHANGELOG更新を
  sandbox内で直接検証する。
- 永続transactionとlockは`.gitignore`に登録し、通常の`git add -A`で誤って取り込まれないようにする。
- 編集範囲はスクリプト本体・専用テスト・本断片のみ。
  `docs/CHANGELOG.md`本体、`shogi_v4.html`、`test/run_tests.sh`、productionは無変更。
