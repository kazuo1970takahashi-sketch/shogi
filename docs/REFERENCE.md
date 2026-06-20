# REFERENCE — SHOGI-TOUR コード設計マップ（`shogi_v4.html`）

> このファイルは、`shogi_v4.html` の**設計マップ・関数構造・データ構造**を1か所にまとめた
> リファレンスです。Issue #267（HANDOFF 軽量化）で、履歴は [`./CHANGELOG.md`](./CHANGELOG.md) に、
> 設計マップは本ファイルに分離しました。
>
> - **開発プロセス（工程・SoD・結果書き戻し）の正本** = [`./ai-ops/`](./ai-ops/)。
> - **実装履歴（スライス単位）** = [`./CHANGELOG.md`](./CHANGELOG.md)。
> - **各機能の権威ある詳細設計** = [`./specs/`](./specs/)（本ファイルは索引・要約。矛盾時は specs が正）。
> - **現在地・ブランチ運用** = [`../HANDOFF.md`](../HANDOFF.md)。
>
> ※ 本ファイルは索引・要約。関数シグネチャ等の最終的な正は `shogi_v4.html` 本体。

---

## 1. アーキテクチャ概要

- **単一 HTML**（`shogi_v4.html`）+ `localStorage` で完結。ビルド工程・外部依存・フレームワークなし。
- 保存キー = `shogi_v4`（レガシー `shogi_v3` も読込）。GitHub Pages 公開・スマホ運用前提。
- **ES5 / 古典的クロージャ / グローバル `state`**。モジュール化・フレームワーク化しない（拘束ルール参照）。
- **build / bind / coordinator パターン**（特に MODALS 系）: 「HTML を組み立てる関数（build）」「イベントを結びつける関数（bind）」「呼び出しを束ねる関数（coordinator/render）」を分けて維持する。
- **CSS の動作を変えない**。とくに `<div class="section">` の閉じタグ省略は**元コードからの仕様**（ブラウザ自動補完で動作）。修正してはいけない。
- production 反映時は `index.html` + `shogi_v4.html` の 2 ファイルを公開し、URL の `?v=N` をインクリメント（キャッシュ回避）。

## 2. `<script>` セクション地図

`shogi_v4.html` の `<script>` は `// ===` バナーで以下の主要セクションに分かれる（コードの所在マップ）:

| セクション | 役割 |
|---|---|
| **UTILITY** | 純粋/参照系（`escapeHtml` / `getName` / `getFee` / `calcTotal` / `getWins` / `pairHasRematch` / `normalizeState` ほか・クラス正規化 `ROUND-CLASS-START-003`） |
| **STORAGE** | `save()`（key `shogi_v4`）/ `load()`（レガシー移行込み）/ Quota 判定 |
| **BRANCH MASTER（支部マスタ）** | マスタ import / export / delete(tombstone) / restore / edit / suggest / sync |
| **REPORT-UX** | 報告書（日付・時刻・大会名・主催・FAX・会計提出文 等）正規化 pure helper 群 |
| **PAST PARTICIPANTS PANEL** | 過去参加者からのワンクリック登録（クラス追加・クラス変更） |
| **MASTER TAB / MODALS** | マスタタブ・リセットモーダル・22 名取込モーダル（二段階確認） |
| **MIGRATION WIZARD** | 過去大会データを支部マスタへ統合 |
| **TOURNAMENT（対局管理）** | 開始導線・ペアリング生成・ラウンド確定・1局目部分手合い（FRP）・逐次手合（progressive） |
| **RESULT / 印刷** | 順位表・星取表・閲覧ビュー・印刷経路（ふりがなルビ展開含む） |

> 注: 本アプリの関数数は多数（クラス可変化・FRP・逐次手合・データ永続化・ふりがな等で増加）。本マップは
> 機能の所在を示す索引であり、全関数の網羅一覧ではない。

## 3. データモデル（保存 vs 派生）

`state`（保存対象）の主な形:

- `state.classes`: クラス定義（`id` / `name` / `started` ほか）。クラスは可変（A/B 固定ではない）。
- `state.players[cls]`: 選手（`id` / `name` / 任意 `yomi` / `member` / `grade` / `entry_no` 等）。`entry_no` は欠番維持。
- `state.pairings[cls]`: 手合せ（match）の配列。
- `state.results[cls]`: 確定ラウンドの配列（`results.length` が確定ラウンド数）。

**match の正準形（`sanitizeMatch`）= `{ p1, p2, winner, lastModifiedBy }` の 4 フィールドのみ。**

- `round` / `table` / `source` / `generatedBy` 等の**メタフィールドは保存しない**（FRP-IMPL-004 で確認）。
- **卓番号** = 描画時の `index + 1`（派生・非保存）。**ラウンド番号** = `results.length + 1`（派生・非保存）。
- **未割当者 / leftover** = `players − pairings(p1,p2)` の**派生**（非保存）。
- `normalizeState(loaded)` が JSON ロード時に欠落フィールドを補完。**normalize 往復は恒等**（保存復元で壊れない）— FRP-IMPL-004A で reload 不変条件として固定。
- 新しい保存スキーマ/メタ情報を安易に足さない（`sanitizeMatch` が剥がすため反映されない）。

## 4. 主要機能の関数ファミリー

権威ある詳細設計は各 `docs/specs/` を正とする。本節は索引。

### 4.1 開始導線（START-UX-CONSOLIDATE-001 / 受付タブから開始副作用を撤去し対局管理タブへ集約）
- `goToTournamentFromReg()` — 受付タブの「登録内容を確認して対局管理へ」。**nav-only**（`save()` + `showTab('tournament')` のみ・round 作成や `started` 変更をしない）。
- `startTournamentForClass(cls)` — **正規の開始導線**（対局管理タブ `startBtnClass_{cls}`）。そのクラスだけ開始。
- `validateStartableClass(cls)` — 開始可否（2名以上・偶数）。シグネチャ/条件は**不変**（部分開始用に流用しない）。
- `isClassStarted(cls)` — そのクラスで1局目運用を開始したかの述語（全員開始・部分開始の双方で true）。
- `startTournament()` — UI からは呼ばない **legacy/deprecated**（削除しない）。
- 設計 = `docs/specs/20260617_start_ux_consolidate_001_design.md`。

### 4.2 1局目部分手合い（FRP: First Round Partial / 未割当者から選択して append）
- `validatePartialStartableClass(cls)` — pure・偶数不要。
- `startClassPartial(cls)` — `started=true`・`pairings`/`results` 空で開始。
- `getUnassignedFirstRoundPlayers(cls)` — 派生・非保存・`entry_no` 昇順・`results` 非空なら空。
- `buildFirstRoundPartialSectionHtml(cls)` — 未割当一覧の**表示専用**。
- `buildFirstRoundPartialPairs(selected)` — pure。偶数全員ペア／奇数は末尾1人 leftover。
- `appendFirstRoundPairs(cls, pairs)` — 末尾 append のみ（`SAVE-FRP-002` 保存検証）。`generatePairing`/`startTournamentForClass` を呼ばない。
- `onClickAppendFirstRound(cls)` — 再入防止 + 実行時再検証 + confirm + append。
- `shouldShowRegenerateButton(cls)` — 「組み合わせを再生成」(`repairBtn_`) の出力 gate。`isClassStarted ∧ results 空 ∧ pairings>0 ∧ 未割当>0` のときだけ非表示（部分手合い保護）。
- 設計 = `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md` / `..._frp_impl_004_save_restore_regenerate_design.md`。

### 4.3 1局目逐次手合（PROGRESSIVE-PAIRING / 受付順で2人ずつ・まとめて）
- `onClickAddOneTable(cls)`（`addTableBtn_`）— 受付順の先頭2名で1卓を追加（押すたびに次）。
- `onClickAddAllTables(cls)`（`addAllTablesBtn_`）— 未手合いをまとめて1局目作成。
- いずれも既存 builder/append（FRP 系）に委譲し、`generatePairing`/`startTournamentForClass` は無改変。
- 確定仕様 = `ai-requests/2026-06-20_progressive-pairing-CONFIRMED-spec.md`（リポジトリ運用 QUEUE 側）。

### 4.4 ペアリング/ラウンド・アクションバー
- `generatePairing(cls)` — 全員を組み直す**破壊的**処理（`state.pairings[cls]` を上書き）。**本体は不変**に保つ（通常開始 round1 の再シャッフルは正規用途）。破壊抑止は UI 層 gate（4.2 の `shouldShowRegenerateButton`）で行う。
- `buildClassActionBarHtml(cls)` / `bindClassActionBarEvents(cls)` — クラス別の開始/部分開始/逐次手合ボタンの build/bind。
- `buildCurrentPairingsHtml(cls)` / `renderTournament()` — 現手合せ描画・対局管理タブの coordinator。

### 4.5 その他の機能ライン（設計の所在）
- **クラス可変化（A/B 撤廃→N クラス）**: `populateClassSelect` ほか。調査/設計は `docs/specs/`（class variable 系）。
- **ふりがなルビ**: `renderPlayerNameWithRuby` / `playerNameRubyHtml` / `yomiOf` / `nameWithNoRubyHtml`（VIEW-002）。
- **大会履歴 / export**: `docs/specs/20260619_shogi_tour_history_minimal_spec.md`。
- **データ永続化**: JSON バックアップ（Phase1）/ Supabase スキーマ・RLS・マジックリンク（Phase2 Stage A）= `docs/specs/20260620_data_persistence_phase2_stagea_design.md`。

## 5. テストハーネス（`test/run_tests.sh`）

- 実行: `bash test/run_tests.sh shogi_v4.html`。**WARN=0** を維持（実在しないテスト参照を増やさない）。
- 期待関数の **present/構造チェック**（`escapeHtml` / `getName` / `getFee` …）で関数構造の意図しない変化を検出。
- **escape ヒューリスティック**（innerHTML 流入箇所の未エスケープ検出）。氏名描画変更時に当たりやすい pin。
- `data_*.json` fixture は不在時 skip（`TEST-HARNESS-001`・実データ非コミット方針と整合）。

---

正本ポインタ: プロセス = [`./ai-ops/`](./ai-ops/) ／ 履歴 = [`./CHANGELOG.md`](./CHANGELOG.md) ／ 現在地 = [`../HANDOFF.md`](../HANDOFF.md) ／ 各機能の詳細設計 = [`./specs/`](./specs/)。
