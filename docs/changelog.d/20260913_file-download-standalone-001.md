## FILE-DOWNLOAD-STANDALONE-001: ホーム画面アプリでバックアップを押すと画面が戻らない

- **問題**: iPhone の「ホーム画面に追加」したアプリ（standalone 表示）では `<a download>` が効かず、WebKit が JSON をそのまま同じ画面に表示する。standalone にはブラウザの「戻る」が無いので、利用者はアプリを強制終了するしかなかった（バックアップは保存されない。2026-09-12 大会当日・作者報告）。Safari で開けば従来どおりダウンロードされる＝環境依存。
- **修正**: ファイル保存の3経路（バックアップ／📤 マスタをエクスポート／大会データ保存）を共通関数 `deliverTextFile` に集約。standalone かつ Web Share API でファイル共有ができる環境だけ `navigator.share({files})` の共有シートで渡す（iOS は「ファイルに保存」でダウンロードへ置ける）。それ以外（Safari/Chrome/Android/PC）は従来の `<a download>` のまま＝挙動不変。判定は純関数 `pickFileDeliveryRoute`。共有シートを閉じた（AbortError）ときは失敗ではなく「保存していません」と案内し、「最終バックアップ」時刻も更新しない。バックアップ画面の保存先案内にホーム画面アプリの手順を1文追記。
- テスト: test/test_file_download_standalone_001.js
