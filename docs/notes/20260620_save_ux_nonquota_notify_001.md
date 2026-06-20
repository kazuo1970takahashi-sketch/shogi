# SAVE-UX-NONQUOTA-NOTIFY-001 — 支部マスタ保存の「quota以外」失敗をユーザー通知へ格上げ

- Issue: #260（cowork PMO dispatch / 実装ライン=Claude Code → Codex L3 レビュー → 人間 merge 承認）
- Review Level: **L3（`shogi_v4.html` runtime）**
- base: orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `33a8920`
- 方針: **追加/最小改変のみ**。Draft PR で停止（Ready化/merge/squash/branch削除/production は人間の明示承認まで実施しない）。

## 背景（問題）
当日運営で支部マスタ（`localStorage` の `BRANCH_MASTER_KEY`）の保存が **quota 超過以外**の理由
（例: `SecurityError` / プライベートブラウズで `localStorage` 書込不可）で失敗したとき、
従来の `saveBranchMaster()` は catch 内で **`console.warn('支部マスタの保存に失敗。',e)` のみ**＝
操作者へ何も表示されず「成功に見える」サイレント握り潰しだった。保存できていないのに気づけず、
タブを閉じてデータ消失というリスクがあった。

quota の場合は既に `notifySaveWarning({kind:'storage-quota'...})` で
`showMsg('warn')`＋`console.warn`＋インジケータ加算（ユーザー通知あり）になっていた。

## 変更（最小・追加のみ）
`saveBranchMaster()` の catch 内「quota 以外」分岐を、サイレントな `console.warn` 単独から
quota 分岐と同じ `notifySaveWarning(...)` 経由のユーザー通知へ格上げ。

```js
notifySaveWarning({
  message:'支部マスタの保存に失敗しました。大会データをコピー（バックアップ）してください。',
  consoleTag:'[STORAGE-ERROR] saveBranchMaster() setItem failed (name=..., code=...)',
  callsiteId:'STORAGE-ERROR:saveBranchMaster',
  kind:'storage-error',
  severity:'warn'
});
```

- `kind:'storage-error'` は `SAVE_WARN_AGGREGATABLE_KINDS`（`save-verify`/`master-verify`）に**含まれない**ため、
  aggregation による文言短縮は起きず、`showMsg('warn')`＋総括 `console.warn` 1回＋インジケータ +1 が確実に発火する。
- **quota 分岐は byte 不変**（挙動・文言・`aggregateKey` 据え置き）。
- **`console.warn` を二重化しない**: 既存の単独 `console.warn('支部マスタの保存に失敗。',e)` は置換し、
  `notifySaveWarning` が内部で出す総括 `console.warn`（`[STORAGE-ERROR]` タグ）1回のみにした。
- 「失敗を隠さない」原則（既存コメント）を維持。

## 他の保存系経路の軽い走査（Issue やること#2）
| 経路 | 非quota 失敗時の現状 | 本PRでの扱い |
| --- | --- | --- |
| `saveBranchMaster()` | 旧: `console.warn` 単独＝サイレント | **本PRで notifySaveWarning へ格上げ（対象）** |
| `save()`（state 本体） | 既に `notifyError(...)` でユーザー通知済み | 対象外（変更なし） |
| `syncBranchMasterOnSave()` → `saveBranchMaster()` | `saveBranchMaster` は内部 catch で握って `return`（throw しない）ため、非quota 失敗は `saveBranchMaster` 側で処理される | **本PRで自動カバー**（呼び元 `syncBranchMasterOnSave` の外側 catch には伝播しない） |
| `syncBranchMasterOnSave()` 外側 catch | `loadBranchMaster`/`ensureTournamentId`/`updateBranchMasterFromTournament` など同期 orchestration の失敗を `console.warn` 単独で握る | **スコープ外（変更なし）**。localStorage 書込みそのものではなく同期処理全体の失敗で、別観点。広げる場合は別Issueで明記して着手する |
| `shogi_archive` 永続化（大会履歴 Step1） | quota は `isQuotaExceededError` で検知し結果オブジェクト `{ok:false,quota:true}` を呼び元へ返す result ベース設計 | **スコープ外（変更なし）**。`saveBranchMaster` の console.warn 握り潰しとは別パターン |

→ 本PRのスコープは **`saveBranchMaster` のみ**に限定（Issue の主対象）。`syncBranchMasterOnSave` 外側 catch /
`shogi_archive` は同種の「localStorage 書込み失敗のサイレント握り潰し」ではないため広げず、上表に明記して停止。

## テスト
新規 `test/test_save_ux_nonquota_notify_001.js`（軽量 DOM/localStorage mock、`test_furigana_mvp_001.js` と同型 harness）を追加し `test/run_tests.sh` に登録。

- A: 非quota（`SecurityError`、`isQuotaExceededError=false`）で `setItem` 失敗 →
  `showMsg('warn')`（`reg-msg` に `alert-warn`＋バックアップ促し文言）＋ indicator count +1 ＝ユーザー可視。
  `console.warn` は**ちょうど1回**（二重化しない）かつ tag `[STORAGE-ERROR]`。
- B: quota（`QuotaExceededError`/code 22）回帰 — 従来通り `showMsg('warn')`＋indicator +1、容量超過文言、tag `[STORAGE-QUOTA]`。
- C: 正常保存（`setItem` 成功）— 警告ゼロ（`reg-msg` 空・indicator 0・`console.warn` 0）かつ `BRANCH_MASTER_KEY` に実書込み。
- D: 分類ガード — `isQuotaExceededError` が `SecurityError=false` / `QuotaExceededError=true`。

検証:
- 修正版 `shogi_v4.html`: 18 assert 全PASS。
- **未修正 orphan base 版**に対しては A1/A2/A3/A5 が**FAIL**（＝本テストが握り潰し挙動を確かに捕捉している）。
- `bash test/run_tests.sh shogi_v4.html`: baseline `72/0/35` → `73/0/35`（新規 +1 PASS、FAIL/WARN 不変＝非回帰）。
- `npx html-validate shogi_v4.html`: exit 0（v10.17.0）。

## 変更ファイル
- `shogi_v4.html`（`saveBranchMaster()` catch の非quota 分岐＋コメント。index.html は未 touch）
- `test/test_save_ux_nonquota_notify_001.js`（新規）
- `test/run_tests.sh`（登録ブロック追加）
- `docs/notes/20260620_save_ux_nonquota_notify_001.md`（本ファイル）
