# MEMBERS-CANDIDATE-MASTER-RECUT-001 結果メモ

- 日付: 2026-06-19
- branch: `feature/members-candidate-master-recut-001`
- base: orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `9be80f2f9358c00ac219cece57afc684fb199388`（#240 直上）

## 目的

stale open PR #194（members 形式 参加者候補マスタ検証）には価値が残るが、base が古く `shogi_v4.html` を触り、現 orphan base と差分前提がずれていた。#194 を直接 rebase / 継続せず、**価値分だけを最新 orphan base から再切り**し、実データを使わない候補マスタ検証を安全に整備する。#194 は参照のみ（無変更で open 据え置き）。

## #194 から取り込んだもの / 取り込まなかったもの

### 取り込んだ（現 base へ最小再実装）
1. `normalizeBranchMaster`: 外部 members 形式の boolean `member`（true=支部員 / false=一般）後方互換。`m.member===false` → `'other'`。native の `'member'/'other'` 文字列・未指定は無影響。
2. `processMasterImportText` の取込完了メッセージ2件（上書き / マージ）に「これは候補マスタです。受付時に『過去参加者から選ぶ』で当日参加者を選択してください」を明示（当日参加者の自動登録ではないことを示す安全UX）。
3. 完全架空 fixture ＋ Node 単体テスト（形式判定 / member 真偽値変換 / 禁止項目 whitelist 除外 / deleted 墓石除外 / attendance 再計算 / 大会state 不変 / 堅牢性）。

### 取り込まなかった（意図的・scope 外）
- `.gitignore` の `/data/`（**PR #240 で merge 済み**）。本タスクでは `.gitignore` 非接触。
- `convertPhase2ParticipantsToMembers`（別 Phase2 配列変換経路。#194 も非変更 → scope creep 回避）。
- #194 の `docs/operations/…verification.md`（183 行）/ `test/e2e/*.spec.js`（Playwright・npm test 非実行）→ 価値は Node 単体テストへ集約、記録は本 `docs/notes` へ。
- #194 差分そのものの cherry-pick / rebase / merge は行わない（再実装）。

## 変更ファイル（最小）

- `shogi_v4.html`（runtime 3 箇所: `normalizeBranchMaster` の member 真偽値 + コメント、取込完了メッセージ2件）
- `test/test_members_candidate_master_recut_001.js`（新規・単体テスト）
- `test/fixtures/import/members_candidate_recut_001_synthetic.json`（新規・完全架空 fixture）
- `test/run_tests.sh`（新規テストの登録）
- `docs/notes/20260619_members_candidate_master_recut_001_result.md`（本メモ）

`index.html` / `.github` / `scripts` / `docs/ops` / `.gitignore` / production / 実データ は非接触。

## fixture が完全架空であること

`members_candidate_recut_001_synthetic.json` は 100% 架空。氏名は全て「架空 …」、id は `synthetic-*`、email は RFC 予約の `example.invalid`、phone は `000-0000-0000`。`synthetic-005` に注入した禁止項目（address/phone/email/birthday/paymentHistory/pastResults と日本語別名）は**正規化 whitelist で除外されることを assert するためのダミー**で、実 PII ではない。実名・実参加者・実マスタ・secret・対応表は一切含まない。

## 検証結果

- `npm test`: **PASS=68 / FAIL=0 / WARN=35**（baseline 9be80f2 = 67/0/35 から +1 PASS、WARN 不変、新規 FAIL なし）。新テスト内部 = `PASS=70 FAIL=0`。
- `npx html-validate shogi_v4.html`: **exit=0**（エラーなし）。
- secret / PII grep（fixture・test）: 一致は `000-0000-0000` / `synthetic@example.invalid` / 全ゼロ UUID の**架空ダミーのみ**。実 PII・鍵・トークン・パスワードなし。氏名は全て架空。
- 既存 START / FRP / mobile / gate 系テスト: 悪化なし（FAIL=0 維持・WARN=35 不変）。

## 非実施
- #194 は無変更で open 据え置き（コメント・close・commit・push・rebase なし）。
- Ready 化 / merge / branch 削除 / rebase / force push / deploy / release / production 反映なし（Draft 停止）。
- main `832bc5a` / production `9693a83` / orphan base `9be80f2` 不変。
