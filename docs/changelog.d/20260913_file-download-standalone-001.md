## FILE-DOWNLOAD-STANDALONE-001: ホーム画面アプリでバックアップを押すと画面が戻らない

- **問題**: iPhone の「ホーム画面に追加」したアプリ（standalone 表示）では `<a download>` が効かず、WebKit が JSON をそのまま同じ画面に表示する。standalone にはブラウザの「戻る」が無いので、利用者はアプリを強制終了するしかなかった（バックアップは保存されない。2026-09-12 大会当日・作者報告）。Safari で開けば従来どおりダウンロードされる＝環境依存。
- **修正**: 「バックアップを保存」の配達経路を `deliverTextFile` に切り替え、standalone かつ Web Share API でファイル共有ができる環境だけ `navigator.share({files})` の共有シートで渡す（iOS は「ファイルに保存」でダウンロードへ置ける）。それ以外（Safari/Chrome/Android/PC）は従来の `<a download>` のまま＝挙動不変。判定は純関数 `pickFileDeliveryRoute`。共有シートの結果はバックアップ画面内の案内欄（`#backup-export-msg`・完了＝alert-ok／未完了＝alert-warn の class 色＋見出し語）で伝え（モーダル表示中は toast を使わない）。AbortError は「閉じた」とも「共有先なし」とも断定できないので「保存していません」として次の行動（もう一度押す／Safari で開く）を示し、「最終バックアップ」時刻は更新しない。保存先の案内文は実際に選ばれる経路に合わせて出し分ける（通常ブラウザ＝従来文言／ホーム画面アプリで共有可＝共有画面の手順／共有不可＝Safari へ誘導）。
- **範囲**: このスライスはバックアップ経路だけ。📤 マスタをエクスポート／大会データ保存の 2 経路は無改変（Codex 1巡目 P1「リファクタと挙動変更を混ぜない」に従い FILE-DOWNLOAD-STANDALONE-002 へ切り出し）。
- テスト: test/test_file_download_standalone_001.js（42 命題）
