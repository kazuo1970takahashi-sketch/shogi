# DATA-PERSISTENCE Phase 1（JSON エクスポート/インポート）実装ノート

- 発行: cowork QUEUE `ai-requests/2026-06-20_claude-code_data-persistence-impl-phase1.md`
- 正本仕様: `ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md` §5 Phase 1
- Review Level: **L3（`shogi_v4.html` runtime）→ Draft PR 後 Codex read-only review 必須**
- base: orphan clean base `dade7a8`（#249 CV-1 merge 済）

## 位置づけ
大会データの **JSON バックアップ（エクスポート/インポート）** を `shogi_v4.html` に **追加のみ** で実装。
自動バックアップ・将来の Supabase 移行（Phase 2）の土台。引き継ぎの主役ではない（前面に出さない）ため
ヘッダーに低彩度のグレー「バックアップ」ボタン 1 つだけを足し、自己完結 modal を開く構成にした。

## エクスポート JSON 構造（schema_version=1 / kind=`shogi_tour_backup`）
```
{
  schema_version: 1,
  kind: 'shogi_tour_backup',
  app: 'shogi_v4',
  exported_at: <ISO 文字列>,      // 呼び出し側が new Date().toISOString() を注入（builder は pure）
  local:     { state: <フル state> },   // 氏名・ふりがな・報告書を含む。復元の正本。
  anonymous: { classes, entries, matches } // 氏名を一切含まない派生。Phase 2 同期 payload の元。
}
```
- **分離**: `local`（氏名あり）/ `anonymous`（member_id＋成績、氏名なし）。entries は `{cls, member_id|null, player_ref, entry_no, wins, games}`、matches は `{cls, round(1始まり), p1_ref, p2_ref, p1_member_id|null, p2_member_id|null, winner_ref|null}`。`player_ref` はローカル id（非 PII）。
- **対局情報**: `local.state.pairings/results` にそのまま含み、`anonymous.matches` にも匿名形で投影。

## 設計上の必須ガード（HANDOFF.md 絶対ルール）
- **追加のみ**。既存 `saveData/saveDataAsFile/loadData/loadFromPaste/applyLoadedJson/normalizeState/save/load` は無改変（diff は挿入のみ・削除 0 行）。
- **復元は独自正規化を作らない**: `importTournamentBackupFromText` は検証後に既存 `applyLoadedJson(JSON.stringify(state))` を呼ぶ＝`state=normalizeState(...)→save()→再描画` を再利用。
- **import は上書き操作** → 検証 OK の後に **confirm ガード**（既存 loadData と同じ思想）。検証失敗時は confirm すら出さず state 不変。
- **schema_version / 種別検証**: 不正 JSON / kind 不一致 / schema_version 不一致 / `local.state` 欠落 を安全に拒否しメッセージ（`parseTournamentBackup` が pure に判定）。
- build/bind/coordinator 維持。pure builder（`buildBackupAnonymous`/`buildTournamentBackupObject`/`serializeTournamentBackup`/`parseTournamentBackup`）は global state を参照しない。
- CSS 動作不変（`<div class="section">` 等は触らない）。

## 追加関数
`buildBackupAnonymous` / `buildTournamentBackupObject` / `serializeTournamentBackup` / `parseTournamentBackup`
/ `exportTournamentBackup` / `importTournamentBackupFromText` / `importTournamentBackupFile`
/ `buildBackupModalHtml` / `bindBackupModalEvents` / `openBackupModal`。定数 `BACKUP_SCHEMA_VERSION` / `BACKUP_KIND`。
ヘッダー `#backupBtn` → `openBackupModal`（`bindHeaderEvents` に 1 行・guard 付き）。

## テスト / 検証
- `test/test_data_persistence_phase1.js`（33 assert）: export 構造 / schema 検証拒否（schema_mismatch・invalid_json・wrong_kind・no_state）/ local↔anonymous 分離（氏名リーク無し）/ matches 投影 / 往復 normalize 恒等 / coordinator import（confirm=true 復元・false キャンセル・schema 不一致非破壊）/ 既存 applyLoadedJson 非回帰。
- `bash test/run_tests.sh shogi_v4.html` = **PASS 71 / FAIL 0 / WARN 35**（baseline `dade7a8` の 70/0/35 から新規テスト +1 のみ・新規 FAIL/WARN 0）。
- `npx html-validate shogi_v4.html` = exit 0（clean）。
- 実ブラウザ（python http.server, 8141）: ボタン描画 / modal 開閉 / 往復恒等 / anonymous に氏名なし・local に氏名あり / schema 99 拒否 / 不正 JSON 拒否 / console error 0 を確認。

## 範囲外（Phase 1 では扱わない）
Supabase 接続・鍵・クラウド同期（Phase 2）。`shogi_branch_master` / `shogi_archive` は別 localStorage キーで無改変（バックアップ対象外＝今回は大会 state のみ）。index.html 無変更。
