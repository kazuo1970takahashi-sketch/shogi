# LIVE-MOBILE-SCOREBOARD-MVP-001 完了メモ（スマホ閲覧専用 順位/星取表ビュー）

- 日付: 2026-06-14
- タスク: `SHOGI-TOUR-LIVE-SCOREBOARD-MVP-001`
- 対象: `shogi_v4.html`
- ブランチ: `feature/shogi-tour-live-scoreboard-mvp-001`（隔離ブランチ。pin SHA `24296c5` 起点）
- 種別: MVP（最短で動くもの優先。大規模設計・履歴・ふりがな・外部同期の完成は対象外）

## 0. 前提（重要）

スマホ閲覧用ビュー本体は **既に PR #200（`feat(tour): スマホ星取表ビューとPDF出力名を改善する`）で実装・マージ済み**。
本作業はその上に、**仕様で要求されていたが未充足だった2点を最小追加**して MVP 仕様を満たすもの。

- 既存（#200 で実装済み）: `#scoreboard` hash 起動 / フルスクリーン閲覧ビュー / クラス別タブ /
  storage・focus による自動更新 / read-only 徹底（運営UI非表示・戻り導線なし） / 星取表（○×－ + 対戦相手番号）。
- 本作業で追加（未充足だった仕様）:
  1. **`?view=scoreboard` クエリ経路**（仕様2 の主経路。`#scoreboard` も後方互換で維持）。
  2. **最終更新時刻の表示**（仕様6 の必須表示項目。従来はラベルのみで時刻が出ていなかった）。

## 1. 起動方法（運営者向け）

同一ブラウザで、運営タブとは別タブとして閲覧ビューを開く。次のいずれでも起動する:

- クエリ: `…/shogi_v4.html?view=scoreboard`（`?view=viewer` / `?view=mobile-standings` も可）
- ハッシュ: `…/shogi_v4.html#scoreboard`（`#viewer` / `#mobile-standings` も可。従来運用）
- 運営画面ヘッダの **「📱 スマホ星取表」** ボタン → `#scoreboard` 付きで別タブを開く。

トークンは `scoreboard` / `viewer` / `mobile-standings` の3種、大小文字無視。

## 2. 表示項目（仕様6 充足）

| 項目 | 実装 |
|------|------|
| 大会名 | ヘッダ `〈大会名〉 星取表`（`state.report.title`） |
| クラス名 | 各表の見出し（`state.classes[].name`、A級/B級…） |
| 順位 | 先頭列（`computeDisplayRanks` 欠番方式・同順位対応） |
| 氏名 | 2列目（sticky 固定）+ No. |
| 勝数 / 負数 | 「勝」「負」列 |
| 順位判定に使う値 | 「B」「C」列（B=対戦相手の勝数合計／C=勝った相手の勝数合計）+ 凡例 |
| 最終更新時刻 | ヘッダ `最終更新：YYYY/MM/DD HH:MM:SS`（**本作業で追加**） |

クラスが2つ以上あれば「全クラス / 各クラス」タブで切替可能（仕様7 充足）。

## 3. ロジックは既存流用（重複実装なし）

順位・勝敗は既存の `calcFinal` / `computeDisplayRanks` / `getWins` / `getName` / `entryNoOf` を流用。
順位計算・保存データ構造には一切手を入れていない。

最終更新時刻は **memory-only**（`_sbLastUpdate`、非保存）。`save()` / state スキーマは不変なので
保存済みデータ互換性に影響しない。タブ切替の再描画では更新せず、データ再読込時
（route 突入 / `storage` イベント / `focus`）のみ現在時刻へ更新する。

## 4. 自動更新の仕組みと「外部同期」の制約（仕様10）

- 自動更新は **同一ブラウザ・同一 localStorage 内** で成立する。運営タブの `save()` が
  localStorage(`shogi_v4`) を更新 → 閲覧タブが `storage` イベントを受信して `load()` + 再描画。
  `focus` 復帰時にも取りこぼし保険として再読込する。
- **本MVPは「別端末スマホからの完全リアルタイム同期」を実装対象外とする。**
  localStorage はオリジン×ブラウザ毎に独立するため、幹事PCの別ブラウザや別端末のスマホからは
  自動では同期しない。今回の現場運用は「幹事PCと同一ブラウザの別タブ／同一端末」を前提とする。
- 別端末スマホへ配信したい場合の将来案（今回は未実装・docsのみ）:
  GitHub Pages 等へ state を書き出す軽量パブリッシュ、または共有ストレージ（サーバ/Realtime DB）経由。
  いずれもサーバ追加・データモデル拡張を伴うため MVP のスコープ外。

## 5. テスト

- 追加: `test/test_live_scoreboard_001.js`（57 アサーション）。`test/run_tests.sh` に登録済み。
  - 構造検査: コンテナ既定 `display:none` / フルスクリーン固定 / `isScoreboardRoute` の query+hash 両対応 /
    最終更新描画 / ヘルパ定義 / 横スクロール+氏名 sticky / 閲覧描画に編集系UIを含まない。
  - 挙動: `sbFormatUpdateTime` ゼロ詰め整形 / `isScoreboardRoute` の `?view=` `#hash` 肯定否定9ケース /
    `applyScoreboardRoute` のビュー切替と運営UI(.header/.container)退避 /
    `renderScoreboard` スモーク（必須表示項目が出る・編集系が出ない）/ 空 state の案内。
- 全体: `bash test/run_tests.sh shogi_v4.html` → **PASS=96 / FAIL=0 / WARN=0**（既存テスト維持＋本テスト）。
- 実ブラウザ確認（375px モバイル幅、**架空データのみ**でローカル localStorage は退避→復元）:
  `?view=scoreboard` で閲覧ビュー表示・運営ヘッダ/コンテナ非表示・クラスタブ3個・
  `最終更新：2026/06/14 23:40:20` 表示・編集系UIなし・console エラーなし・レイアウト崩れなし を確認。

## 6. やっていないこと（スコープ厳守）

既存データ構造/保存互換は不変。通常操作画面は作り替えていない（ヘッダにボタンが1つ既存である以外、追加UIなし）。
ふりがな本格対応 / 過去大会履歴 / PDFファイル名改善 には広げていない。release/deploy/publish・
main/production 直変更・branch 削除はしていない。
