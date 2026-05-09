# SHOGI-TOUR Current Status and Next Phase｜現状棚卸し・次フェーズ判断

## 0. メタ情報

- **Project ID**: SHOGI-TOUR
- **Project Name**: 将棋大会運営アプリ（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **本番URL**: https://kazuo1970takahashi-sketch.github.io/shogi/shogi_v4.html
- **Task ID**: SHOGI-TOUR-001
- **作成日**: 2026-05-10
- **作成時点**: 2026-05-10 本番前／本番当日朝時点の整理。本番後フィードバックは本ドキュメントには含めず、SHOGI-TOUR-002 で別途整理する。
- **main HEAD**: PR #30 マージ後の main。作成時点では `7e58fd1` として整理。
- **作成目的**: PR #21〜#30 の到達点を棚卸しし、次フェーズの判断材料を整備する。実装には進まない。
- **対象範囲**:
  - 現在の main HEAD（PR #30 マージ後）が将棋大会運営アプリとしてどこまで動くかの確認
  - PR #21〜#30 の整理
  - 完了済み機能 / 残課題の分類（Must Fix / Should Fix / Nice to Have / Watch）
  - 次フェーズ候補の比較
  - 推奨する次の一手の提示
- **非対象範囲**:
  - SHOGI-LEARN｜将棋学習アプリ（別プロジェクト）
  - 棋譜解析（shogi-coach の領域）
  - AIコーチ機能 / 学習支援機能
  - 新規実装 / コード変更
  - PR作成 / branch作成 / commit / push
  - main直接push / merge / release / deploy / publish / branch削除
  - 本ドキュメント自体の docs/ ディレクトリへの実ファイル配置以外の作業

### 0.1 SHOGI-TOUR-001 と SHOGI-TOUR-002 の境界

- **SHOGI-TOUR-001**:
  - PR #21〜#30 までの棚卸し
  - 本番前／本番当日朝時点の現在地整理
  - 次フェーズ判断
- **SHOGI-TOUR-002**:
  - 5/10 本番後の一次フィードバック収集
  - 実機・現場で起きた事実の整理
  - Hotfix 要否判断

---

## 1. 現在のmain到達点

main HEAD：PR #30 マージ後の main。作成時点の具体的な commit は、Claude Code が docs 配置時に確認した値を記載する。

将棋大会運営アプリとして、5/10 月例本番に必要な機能は **PR報告上は揃っている**。観点別の到達点は以下。実機で確認済か、テスト上のみ確認済かを分けて記載する。

| 観点 | 到達点 | 確認区分 |
|---|---|---|
| 受付（参加者登録） | A/Bクラス別の登録フォーム稼働、過去参加者パネルから A/B クラス指定で登録可 | 実機目視確認済（5/8 まで） |
| 過去参加者からの登録 | 3セクション分離（A級エントリー済 / B級エントリー済 / 未エントリー）で表示 | 実機目視確認済 |
| A/Bクラス管理 | クラス単位のペアリング・成績集計・順位算出が独立稼働 | テスト上確認済 |
| 支部員区分 | F7編集モーダルで保存・再表示可、参加費計算（500円/1000円/0円）に反映 | テスト上確認済 |
| 中学生以下区分 | 同上、grade=chu で参加費判定に反映 | テスト上確認済 |
| city（市町村） | F7 編集モーダルで保存・再表示可、import/export round-trip で保持 | 実機目視確認済（PR #27 マージ後） |
| person master（マスタ） | スキーマに city 含む、F7 編集モーダルで全項目編集可、5列構成で iPhone 375px 縦書き化解消 | 実機目視確認済（PR #26 マージ後） |
| F7編集モーダル | 履歴情報アコーディオン化（PR #29）+ 説明文撤去で保存ボタンが viewport 内に収まる | テスト上確認済（実機確認は5/8時点で実施済） |
| tombstone / 削除済み | A-3 系で実装、削除済み行はマスタ一覧で識別可 | テスト上確認済 |
| マスタ一覧 | 5列構成（氏名 / 支部員区分 / 中学生以下区分 / 編集 / 削除） | 実機目視確認済 |
| バックアップ / 復元 | マスタ JSON エクスポート / インポート 両方稼働、city 含む round-trip 確認済 | テスト上確認済 |
| 22名取込 | `data/import/20260412_participants.json`（A級18 + B級4）取込機能稼働、import 前検証 + 全件ロールバック実装済 | PR報告上確認済。本番前／本番当日朝時点では実運用確認前として扱う |
| 大会データリセット（マスタリセット） | 二段階確認（バックアップ済チェック + テキスト「リセット」入力）+ disabled 制御 | テスト上確認済 |
| 対局管理 | スイス式自動ペアリング、結果入力、過去結果修正、最終順位算出 稼働 | テスト上確認済（既存A-T 系で動作確認） |
| 対戦相手変更 | replace + swap 自動判別（PR #30）、winner入力済みは拒否、swap時のみ確認ダイアログ | PR報告上確認済。本番前／本番当日朝時点では実運用確認前として扱う |
| 結果入力 | winner 選択 → submitRound でラウンド確定、過去結果はモーダルで修正可 | テスト上確認済 |
| スマホ表示 | iPhone 375px ベースで参加者登録 / 過去参加者パネル / マスタ一覧 / F7 / 結果表示の縦書き化解消 | 実機目視確認済（5/8 まで） |
| E2Eテスト | Playwright 718 passed（PR #30 報告値）、mobile-375 project 分離、visual regression あり | PR報告上確認済 |
| 単体テスト | run_tests.sh PASS=53 / FAIL=0（PR #30 報告値） | PR報告上確認済 |
| 本番runbook | `docs/operations/20260510_tournament_setup.md` 配置済、バックアップ→リセット→取込→補完→確認の手順記載 | 本番前／本番当日朝時点では実運用確認前として扱う |

**総合**：5/10 本番に必要な機能は揃っているが、PR #28（22名取込）と PR #30（swap）は本番前／本番当日朝時点では実運用フィードバック未収集。本番当日の実運用で一次情報を収集し、SHOGI-TOUR-002 で整理する。

---

## 2. PR #21〜#30 サマリー

### 2.1 PR一覧表

| PR | タイトル | 種別 | 主な目的 | production code 変更 | テスト結果 | 状態 | 次フェーズへの示唆 |
|---|---|---|---|---|---|---|---|
| #21 | A-4-3 過去参加者からのクラス変更 + マスタ last_class 表示 | Feature | 既登録者のクラス変更手段欠如を解消、A-4.2 リグレッション根因対応 | あり（純粋関数 `changePlayerClass` 追加、F7 last_class 編集、マスタ一覧 last_class 列追加） | Codex Gate Review A判定 | merged | last_class が後続の3セクション分離（A-4.5）の前提となった |
| #22 | A-4-4 過去参加者パネル UX 改善（2セクション分離 + 行内「現在:Xクラス」） | Feature → revert | 行内テキスト追加でクラス所属を表現 | あり → revert | Codex Gate Review A判定（実機破綻を見抜けず） | revert済 | iPhone 375px 行内要素圧迫で氏名縦書き化P0 → Postmortem / Layout Safety L-3/L-4 の根拠 |
| #23 | A-4-5 3セクション分離 + 行2段レイアウト + F7簡素化 + bug fix #7 | Feature | A-4.4 失敗の構造的再発防止、行2段レイアウトで氏名縦書き化解消 | あり | mobile-375 visual regression 新設、Codex A判定 | merged | 行2段レイアウト + 3セクションが現在の標準UI |
| #24 | A-4-6 エントリー済の現クラスボタン色強調復活 | Feature（軽量） | A-4.5 で撤廃した色強調の最小限復活 | あり（CSS中心） | Codex A判定 | merged | 色強調を「行内要素」ではなく「button style」に閉じ込めた |
| #25 | Layout Safety L-3 + L-4 mini Sprint | Test infrastructure | A-4.4 教訓を構造化した検出層 | 0行（test/helpers + 単体 + 既存 e2e 適用のみ） | 単体15件 + e2e 579 緑 | merged | `expectNoHorizontalOverflow` / `expectHeightInRange` / `expectLeftOf` 3関数が以後の標準ガード |
| #26 | マスタ一覧 5列構成 | Refactor / UX | iPhone 375px でマスタ一覧の縦書き化解消 | あり（列削除、5列化） | layout-assertions 適用 | merged | 削除したふりがな/前回クラス/最終参加/回数 は F7 編集モーダル内で確認可 |
| #27 | Phase 1: city フィールド追加 | Feature | 5/10 本番の22名取込に向けた前提整備 | あり（schema + F7 + import/export） | ChatGPT A- → 反映後 Codex Go | merged | 後続 PR #28 の前提 |
| #28 | Phase 2: マスタリセット + 22名取込 + runbook | Feature（P0データ破壊リスク） | 5/10 本番直前の運用整備、リセットの二段階確認、import 前検証 + 全件ロールバック | あり（リセット機能 + 22名取込 UI + 防御的UX） | ChatGPT B+ → A- → Codex Go | merged | runbook 配置。本番実運用フィードバックは SHOGI-TOUR-002 で収集 |
| #29 | Phase 3: F7 履歴情報アコーディオン化 + 説明文撤去 | UX 軽量改善 | F7 モーダル初期表示で保存/キャンセルボタンが viewport 内に収まるように | あり（軽量） | Codex Quick Review | merged | F7 が縦長化する都度この方針で対応可能 |
| #30 | Phase 4 Hotfix: 対戦相手変更 UI replace → swap | Hotfix | 「対戦相手の変更」モーダルの実用性改善。別ペア所属者を選んだ場合に2ペア間 swap | あり（chg-save ハンドラ分岐 + swap 確認ダイアログ + prerequisite） | run_tests.sh PASS=53 / FAIL=0、Playwright 718 passed | merged | 本番実運用で swap の可読性・誤操作リスクを確認する |

### 2.2 PR別の補足

#### PR #21（A-4-3）

- A-4.2 リグレッションの「過去参加者で既登録者の A/B ボタンが silent fail」に対する根因対応。
- 3ケース別の確認ダイアログ（未登録 / 別クラス / 同クラス）で誤操作防止。
- 範囲外：attendance_count / tournament_ids の変更、サジェスト側の既登録者除外撤廃、アンドゥ機能。

#### PR #22（A-4-4、revert済）

- iPhone 375px で flex 圧迫により氏名 span が縦書き化する P0。
- Codex Devil's Advocate も chromium-desktop snapshot を見て判定しており、実機 iPhone の描画を見ていない構造的欠陥が露見した。
- 教訓は mobile-375 project、Layout Safety L-3/L-4、AI が見ていない領域の認識に結実した。

#### PR #23（A-4-5）

- 「現クラス」を行内テキストではなくセクション位置で表現する設計変更。
- 行2段レイアウトで氏名 span に十分な横幅を確保。
- A-4.5 実装中に bounding box 実測で A-4.3 main 時点から既に氏名 span が完全縦書き化していた潜在問題を検出。

#### PR #24（A-4-6）

- 行構造・行内要素は A-4.5 と同一にして、ボタン style だけを変える「最小変更原則」を徹底。

#### PR #25（Layout Safety L-3 + L-4）

- production code 0 行改修。
- test/helpers + 単体テスト + 既存 e2e への適用のみ。
- L-1（mobile/desktop 両 VRT）+ L-2（bounding box 実測 = 縦書き化検出）+ L-3（Overflow 検出）+ L-4（Layout assertion）の4層で iPhone 375px のレイアウト破綻を構造的に検出可能にした。

#### PR #26（マスタ一覧 5列構成）

- 削除した4列（ふりがな / 前回クラス / 最終参加 / 回数）は F7 編集モーダル内で確認可能。
- マスタ一覧は管理画面のため運営クリティカルパス外、削除に伴う一覧情報の圧縮は許容。

#### PR #27（Phase 1: city）

- city は任意項目、空文字を有効値、maxlength=20、`String(value ?? "").trim()` で正規化。
- 既存 localStorage / 旧バックアップ JSON で city 不在 → `""` 補完で下位互換。
- マスタ一覧には表示せず、F7 編集モーダル内のみで扱う（5列を維持）。

#### PR #28（Phase 2: リセット + 22名取込）

- データ破壊リスク P0。
- リセットは二段階確認（バックアップ済チェック + テキスト「リセット」入力 + 両方満たして実行ボタン enabled）。
- import 前検証：配列長=22 / last_played 全件一致 / last_class ∈ {A,B} / A18B4 / name 非空 / city 20文字以内 / unknown field 許容。
- 1つでも失敗で全件ロールバック。
- runbook（`docs/operations/20260510_tournament_setup.md`）でバックアップ→リセット→取込→補完→確認の手順を整備。
- 防御的 UX：取込後に参加者登録タブへ自動切替 + 過去参加者パネル自動展開。

#### PR #29（Phase 3: F7 UX）

- city 追加で F7 が縦長化 → 履歴情報アコーディオン + 説明文撤去で保存/キャンセルボタンを viewport 内に収める。
- 判定方法：375x800 で `#me-cancel` と `#me-save` の bounding box が `window.innerHeight` 内に収まることを layout assertion で primary 検証、mobile-375 visual snapshot で secondary 回帰検知。

#### PR #30（Phase 4 Hotfix: swap）

- 5/8 実機検証発覚：「対戦相手の変更」モーダルは 1名置換 replace UI として実装されており、実運用上の swap が未対応だった。
- 修正：chg-save ハンドラを replace / swap 自動分岐に拡張。
- X が現在ラウンド内の別ペア(X-Y)に所属していれば swap、所属していなければ replace。
- prerequisite 5項目：対象ペア winner 入力済み拒否 / swap 相手ペア winner 入力済み拒否 / 同ペア内 swap 拒否 / swap 後の重複検証（防御層）/ 再戦チェックは過去ラウンドのみ。
- swap 動作時のみ確認ダイアログ、replace は従来通り即時実行。

---

## 3. 完了済み機能一覧

ユーザー目線で「何ができるようになったか」。確認区分を3レベルで併記。

### 3.1 受付・登録

- 過去参加者から A/B クラスを指定して登録できる（実機確認済）
- 登録済み選手のクラスを A↔B で変更できる（確認ダイアログ付き、実機確認済）
- 同クラスへの「変更」を試みた場合、確認ダイアログで気づける（実機確認済）
- 過去参加者パネルが「A級エントリー済」「B級エントリー済」「未エントリー」の3セクションで表示される（実機確認済）
- iPhone 375px で行2段レイアウトにより氏名が縦書き化しない（実機確認済）

### 3.2 マスタ管理

- F7 編集モーダルで氏名 / ふりがな / 支部員区分 / 中学生以下区分 / 前回クラス / city を編集できる（実機確認済）
- F7 編集モーダル初期表示で保存/キャンセルボタンが viewport 内に見える（PR報告上確認済、5/8時点で実機目視済）
- 履歴情報セクションをアコーディオンで開閉できる（PR報告上確認済）
- マスタ一覧が5列構成（氏名 / 支部員区分 / 中学生以下区分 / 編集 / 削除）で iPhone 375px 縦書き化なし（実機確認済）
- city を保持できる（import/export round-trip 含む、実機確認済）

### 3.3 取込・リセット・バックアップ

- マスタ JSON をエクスポート / インポートできる（実機確認済）
- 22名の過去参加者（2026-04-12開催分）を JSON 取込できる（PR報告上確認済、本番前／本番当日朝時点では実運用確認前）
- 取込前検証で配列長/last_played/last_class/A18B4/city文字数 などを確認、失敗時は全件ロールバック（PR報告上確認済）
- マスタリセットは二段階確認（バックアップ済チェック + 「リセット」テキスト入力）で誤操作防止（PR報告上確認済）

### 3.4 対局管理

- スイス式ペアリングを自動生成できる（既存機能、テスト上確認済）
- 「変更」ボタンで対戦相手変更モーダルが開く（実機確認済）
- 別ペア所属者を変更先に選ぶと swap で 2ペア同時更新できる（PR報告上確認済、本番前／本番当日朝時点では実運用確認前）
- swap 時のみ確認ダイアログが表示される（PR報告上確認済）
- 別ペア未所属（過去ラウンドのみ存在 / 削除済み等）を変更先に選ぶと replace で 1ペア更新できる（PR報告上確認済）
- winner 入力済みペアは変更モーダルが開かない（エラー表示、PR報告上確認済）
- swap で過去ラウンドとの再戦が発生する場合は拒否される（PR報告上確認済）
- swap 相手ペアが winner 入力済みなら swap 拒否される（PR報告上確認済）

### 3.5 品質保証基盤

- iPhone 375px の行レイアウト破綻を構造的に検出できる（L-3 Overflow + L-4 Layout assertion + L-1 mobile-375 VRT + L-2 bounding box 実測）
- mobile-375 project と chromium-desktop project が分離され visual regression が両方走る
- run_tests.sh PASS=53、Playwright 718 passed（PR #30 報告値）

### 3.6 運用基盤

- 本番運用 runbook（`docs/operations/20260510_tournament_setup.md`）配置済
- バックアップ手順 / リセット手順 / 22名取込手順 / 必須補完手順 / 異常時リカバリ手順が文書化されている

### 3.7 確認区分の凡例

- **実機確認済**：iPhone 実機で髙橋さんが目視で動作確認済
- **PR報告上確認済**：PR本文・テスト結果・Codex/ChatGPTレビュー上は確認済、実機で目視されていない可能性あり
- **本番前／本番当日朝時点では実運用確認前**：本番後フィードバックは SHOGI-TOUR-002 で別途整理する

---

## 4. テスト・品質保証の現在地

### 4.1 単体テスト

- `test/run_tests.sh`：PASS=53 / FAIL=0（PR #30 報告値）
- `test/helpers/` 配下に 8つのヘルパー + 各 .test.js（layout-assertions / clickAndExpectChange / expectClickable / getStateSnapshot / shogi_assertions / stableStringify / triggerInputFileAndExpectChange）

### 4.2 Playwright E2E

- 718 passed（PR #30 報告値）
- spec ファイル：`test/e2e/` 配下に複数ファイル（index_layout / shogi_app / shogi_app_a3 / shogi_app_a4 / shogi_app_a4_2 / shogi_app_a4_3 / shogi_app_a4_5 / shogi_app_a4_6 / shogi_master_list / shogi_phase1_city / shogi_phase2_import / shogi_phase3_f7_ux / shogi_phase4_pairing_swap / visual_regression / visual_regression_mobile など）

### 4.3 Visual Regression

- chromium-desktop project（PC 1280px）と mobile-375 project（iPhone 375px）の2 project 並行運用
- snapshot 命名：`reg-pp-panel-375-chromium-desktop-darwin.png` / `tournament-paired-375-chromium-desktop-darwin.png` 等

### 4.4 mobile-375 project の有無

- あり。
- playwright.config.js で testIgnore 分離、visual_regression_mobile.spec.js が mobile-375 project から走る
- A-4.5（PR #23）で新設（A-4.4 失敗の構造的再発防止策）

### 4.5 layout safety helper の役割（PR #25）

`test/helpers/layout-assertions.js` 3関数：

- `expectNoHorizontalOverflow(target, options)`：scrollWidth > clientWidth で水平はみ出しを検出（L-3）
- `expectHeightInRange(locator, options)`：行高さの上限/下限を assert（L-4）
- `expectLeftOf(locator, options)`：要素並びの順序を assert（L-4）

production code は 0行改修、test/helpers + 単体15件 + 既存 e2e 適用のみで完結。

### 4.6 L-1〜L-4 の意味

| 番号 | 名称 | 検出領域 |
|---|---|---|
| L-1 | mobile/desktop 両 VRT | snapshot 差分による視覚的検出 |
| L-2 | bounding box 実測 | 縦書き化（width が極端に小さい / height が極端に大きい） |
| L-3 | Overflow 検出 | scrollWidth > clientWidth による横はみ出し |
| L-4 | Layout assertion | 行高さ・要素並び制約の明示 |

L-5（height/width 比併用）、L-6（WebKit + iPhone project）、L-7（maxDiffPixelRatio 厳格化）は未実装、必要時追加。

### 4.7 A-4.4 失敗から得た教訓

- AI 全体（Claude.ai / Claude Code / Codex）が「実機 iPhone での見た目」を見ていない構造的欠陥
- 行内要素を増やすと flex 圧迫で破綻するという仮説駆動検証ステップの欠如
- 仕様書のユーザーストーリーにレイアウト要件（狭い画面で行が破綻しない）が必須要件として書かれていなかった
- 「直前の正常状態」への過信。A-4.4 revert 後に「A-4.3 = 正常」と無検証で復帰したが、A-4.3 main 時点から既に縦書き化していた

### 4.8 本番前に最低限人間が見るべき項目

runbook（`docs/operations/20260510_tournament_setup.md`）の §1〜§6 ベース：

- バックアップが iPhone のダウンロードフォルダに実際に保存されたかの目視
- リセットモーダルの「現在のマスタ件数」がバックアップ時に控えた件数と一致するか
- 22名取込のプレビュー（A18 / B4 / city付き / サンプル3件）の確認
- 取込後のマスタ一覧で22名表示
- 過去参加者パネルで未エントリー22名が iPhone 375px で縦書き化せず表示
- 高橋一雄（本人）と大竹智也（高校生）の F7 補完
- swap 動作の実機検証

### 4.9 DevSecOps運用方針 v1.2 final 観点での確認ポイント

| 観点 | 現在地 |
|---|---|
| 仕様と実装の整合 | docs/specs/ にフェーズ別 spec が網羅、Codex Devil's Advocate で整合確認 |
| P0 / データ破壊リスク | リセット二段階確認 + 取込前検証 + 全件ロールバック で対応済 |
| localStorage / backup / restore の安全性 | エクスポート / インポート round-trip 確認済、city 含む |
| UI変更による既存操作破壊 | A-4.4 revert で痛恨経験済、Layout Safety L-1〜L-4 で構造的検出可能に |
| スマホ表示 | mobile-375 project + L-1〜L-4 で iPhone 375px 検出層構築 |
| AI作業の停止位置 | Plan Mode → Spec → Code → Codex Review → merge の流れが定着 |
| PR単位のレビュー | PR #21〜#30 は、Gate Review / Quick Review / Quick Gate Review など、リスクに応じた Codex 独立レビューを経由して merged された |
| Codex独立レビューの必要性 | 仕様と実装の矛盾 / P0 / データ破壊 / UI破壊リスク確認に有効。ただし「実機 iPhone を見ていない」構造的限界は残存 |

---

## 5. 本番運用で確認すべき事項

5/10 本番運用で一次情報として確認すべき項目。これが SHOGI-TOUR-002 の主要収集対象。

### 5.1 受付フロー

- 受付時に過去参加者からスムーズに登録できるか（タップ位置 / 反応速度 / 誤タップ）
- A/Bクラス変更が直感的か（クラス変更ボタンの位置 / 確認ダイアログの読みやすさ）
- 22名取込後に過去参加者パネルが期待通り表示されるか
- 大会データリセットとマスタリセットを誤認しないか
- 受付係（副幹事）がスマホで操作してエラーに遭遇しないか

### 5.2 F7 編集モーダル

- F7 編集モーダルの保存 / キャンセルボタンが iPhone 実機で見えるか
- city 入力 → 保存 → 再オープンで保持されているか
- 履歴情報アコーディオンの ▼ 開く / 閉じる が直感的か

### 5.3 対局管理画面

- 対局管理画面の変更 / 削除 / 結果入力が誤操作しにくいか（ボタン配置 / サイズ / 色）
- **重点観察：対局管理画面の削除ボタン位置。特にスマホ実機で、変更・結果入力・削除の並びが誤操作を誘発しないか。**
- swap 時の確認ダイアログ「(○○-▲▲) → (○○-X) / (X-Y) → (▲▲-Y)」が理解しやすいか
- winner 入力済みペアの変更拒否（モーダル開かず「結果入力済みのため変更できません」表示）が妥当か
- replace 動作（従来の1名置換）と swap 動作の区別がユーザー視点で混乱しないか
- 削除ボタンと変更ボタンが隣接している場合に誤タップが発生しないか

### 5.4 スマホ実機 UX

- iPhone 実機で縦書き化 / 横スクロール / ボタン押しづらさがないか
- 画面遷移時の引っかかり / 重さ
- localStorage の容量 / 保存タイミングの体感

### 5.5 バックアップ・復元・runbook

- バックアップ / 復元 / runbook の手順が現場で実際に使えるか
- 異常時に runbook §6 リカバリで本当に復旧できるか
- 主幹事と副幹事の役割分担が runbook 通りに機能するか

### 5.6 大会全体

- ペアリング → 結果入力 → ラウンド確定 → 最終順位算出 → 報告書生成 まで通しで稼働するか
- 5〜6ラウンドの大会1回を最後まで運営できるか

---

## 6. 既知の不安点・残課題

分類凡例：

- **Must Fix**：次の本番運用や次PR前に解消しないと危険
- **Should Fix**：優先度高いが即時ブロッカーではない
- **Nice to Have**：改善すると良いが後回し可能
- **Watch**：問題確定ではないが運用で注意して見る

### 6.1 Must Fix

| 項目 | 理由 |
|---|---|
| 5/10 本番直前のリハーサル未実施の場合は要対応 | runbook はあるが実機リハーサル未実施の場合、本番一発勝負はリスク。5/9 夕方〜5/10 朝の任意のタイミングで通し動作すること |
| swap 動作の実機未確認 | PR #30 は本番前／本番当日朝時点で実運用フィードバック未収集。可能なら本番前に2ペア作って swap を1回試す |

### 6.2 Should Fix

| 項目 | 理由 |
|---|---|
| 対局管理画面の削除ボタン位置 / 変更ボタンとの誤操作リスク | 髙橋さんから言及あり。本番で誤操作が出る可能性。本番後フィードバックで Must Fix 化判断 |
| 仕様書と実装の差分確認 | PR #21〜#30 で多数の spec が docs/specs/ に積み上がっており、現在の main HEAD と整合する spec がどれか一覧化されていない |
| runbook の更新漏れ | runbook は5/8時点の流れが中心。PR #29 / #30 マージ後の runbook 更新が必要かどうかの確認 |
| Phase 4（swap）の本番事後検証 | 5/10 本番後に「実際に swap を使ったか / 使った時の体感」を収集 |

### 6.3 Nice to Have

| 項目 | 理由 |
|---|---|
| スマホ表示の窮屈さの主観評価 | 構造的検出層はあるが、ユーザー視点の窮屈さは定量化されていない |
| swap 確認ダイアログの可読性改善 | 「(○○-▲▲) → (○○-X) / (X-Y) → (▲▲-Y)」が iPhone 375px で読みやすいか |
| マスタ一覧から削除した4列（ふりがな / 前回クラス / 最終参加 / 回数）の確認導線改善 | 現状 F7 編集モーダルでのみ確認可、一覧で見たいケースはあり得る |

### 6.4 Watch

| 項目 | 理由 |
|---|---|
| localStorage 依存の限界 | DB を持たない設計のため、ブラウザ/端末故障 / プライベートブラウズ誤起動 / Cookie クリアでデータ全損リスク |
| 大会履歴管理がまだ弱い | 各大会のスナップショット保管は手動バックアップ依存、過去大会の参照が体系化されていない |
| 複数大会対応が未整理 | 現状は1大会1運用、月例間でデータを引き継ぐが、複数大会並行や履歴比較は未対応 |
| 操作ログがない | 誤操作 / リセット / 取込 / swap などのログが残らないため、事後調査が困難 |
| 本番データ保護の弱さ | localStorage のみ依存、サーバー側での保護なし |
| restore / import / reset の誤操作リスク | 二段階確認はあるが、運用で慣れると「リセット」→「取込」を誤った順序で打つリスクは残る |
| Codex Devil's Advocate の構造的限界 | A-4.4 で露見した「実機 iPhone を見ていない」問題は L-1〜L-4 で技術的にカバーされたが、AI レビュー全般の限界は今後も残る |
| SHOGI-LEARN との混同リスク | 同じ将棋関連プロジェクト群だが、SHOGI-TOUR は大会運営アプリ、SHOGI-LEARN は学習アプリであり混同しない |

---

## 7. 次フェーズ候補

### 候補A：本番運用後フィードバック整理フェーズ（SHOGI-TOUR-002 案）

**目的**：実際の大会運用で出た違和感・困りごと・改善要望を一次情報として整理する。

**対象**：
- スマホ実機 UX（受付・対局管理・F7・マスタ）
- 対局管理画面の削除ボタン位置 / 変更ボタンとの誤操作
- 受付導線（過去参加者パネル → A/Bクラス選択）
- F7 編集での補完作業
- swap 動作の実運用初検証
- runbook §1〜§6 の現場通用性

**やらないこと**：
- 実装
- Phase B 設計
- 大会履歴管理 / 複数大会対応の検討

**完了条件**：
- 5/10 本番後のフィードバックが Must Fix / Should Fix / Nice to Have / Watch で分類されている
- SHOGI-TOUR-003（Hotfix Phase）が必要かどうかの判断材料が揃っている

### 候補B：UI/UX改善フェーズ

**目的**：本番運用で問題になりやすい画面を、誤操作しにくく・見やすくする。

**対象**：
- 対局管理画面のボタン配置
- 削除ボタンの危険操作化(赤色 + 確認ダイアログ強化)
- 結果入力済みペアの見え方
- swap 確認ダイアログの可読性
- スマホ375px最適化（追加対応）

**前提**：
候補A の収集が終わっていないと改善対象が思い込みになるリスク。候補A の後で実施すべき。

### 候補C：運用runbook強化フェーズ

**目的**：大会前・大会中・大会後の手順を明確にする。

**対象**：
- 大会前準備（前日チェックリスト）
- バックアップ運用
- 22名取込（次回大会では別データ）
- 当日受付フロー
- 対局変更（swap / replace の使い分け）
- 結果入力フロー
- トラブル時対応
- 復元手順

**前提**：
候補A で実運用フィードバックを収集してから整備したほうが現場通用性が上がる。

### 候補D：Phase B 設計フェーズ

**目的**：
将棋大会運営アプリを、単発大会運用から継続運用に耐える構造へ進める。

**対象**：
- 大会履歴管理（各大会のスナップショット保管）
- 複数大会対応
- 操作ログ
- rollback 機能
- localStorage 依存の見直し
- データ永続化方針
- バックアップ設計
- 将来的な DB 化

**前提**：
- いきなり Phase B に進むと、本番で出るであろう誤操作リスクの一次情報を取りこぼす
- Phase B は SHOGI-TOUR-002 の後、実運用フィードバックを踏まえて判断する

---

## 8. 推奨する次の一手

### 推奨

- **Task ID**：SHOGI-TOUR-002
- **Task Name**：本番運用フィードバック整理

### 推奨理由

1. PR #21〜#30 のうち PR #28（22名取込）と PR #30（swap）は、本番前／本番当日朝時点では実運用フィードバック未収集
2. A-4 系の教訓である「AI 全体が実機 iPhone を見ていない」構造的欠陥は L-1〜L-4 で技術的にカバーしたが、運用フィードバック層は未整備
3. Phase B にいきなり進むと、本番で出るであろう「対局管理画面の削除位置」「swap 確認ダイアログの可読性」「リセット/取込の取り違え」などの誤操作リスクの一次情報を取りこぼす
4. SHOGI-TOUR-002 の完了条件は「収集」までなので、実装に進まない選択肢を取りやすい

### やること

- 5/10 本番運用の準備
- 5/10 本番中の気づきメモ収集（紙・スマホメモ・スクショ）
- 5/10 本番後の振り返り（受付係・主幹事・参加者観察からの集約）
- フィードバックの Must Fix / Should Fix / Nice to Have / Watch 分類
- SHOGI-TOUR-003 起票要否の判断材料整備

### やらないこと

- 実装（コード変更 / spec 作成 / PR 作成 / commit / push / merge）
- Phase B 設計
- runbook 強化
- UI/UX 改善
- 5/10 本番中の AI による即興判断

### Claude / Claude Code / Codex / ChatGPT の役割分担

| 役割 | 担当 |
|---|---|
| 本番準備リハーサル支援（runbook の手順確認） | 髙橋さん（人間）、Claude.ai は質問対応のみ |
| 本番中のフィードバック収集 | 髙橋さん（人間）、AI は介入しない |
| 本番後のフィードバック整理（メモ → 構造化） | Claude.ai |
| Must Fix / Should Fix / Nice to Have / Watch 分類補助 | Claude.ai + ChatGPT（司令塔として方針判断） |
| 仕様化（必要な場合のみ、SHOGI-TOUR-003 として別タスク） | Claude.ai（spec 起草）→ ChatGPT（レビュー）→ Codex（独立レビュー）→ Claude Code（実装） |
| SHOGI-TOUR-002 における Claude Code / Codex | 初期段階では原則介在しない。ただし、整理済みフィードバックを docs/ops に保存する段階では、Claude Code に docs 反映のみ依頼する可能性がある。Codex は、Hotfix や実装判断が必要になった場合に独立レビューとして使う |

### 依存関係

- 前提：5/10 本番が実施されること
- 後続：必要なら SHOGI-TOUR-003（Hotfix Phase）として軽量実装、不要なら次は候補B または候補C

### 完了条件

- 5/10 本番運用で出たフィードバックが構造化されている
- Must Fix / Should Fix / Nice to Have / Watch で分類されている
- SHOGI-TOUR-003 起票要否が判断できる状態になっている
- 本番後の振り返りログが docs/ops/ 配下に配置されている（SHOGI-TOUR-002 の最終アウトプットとして）

---

## 9. AI作業分担案

### ChatGPT（司令塔）

- 方針判断（候補A〜D の選択）
- Claude / Claude Code / Codex への依頼文作成
- レビュー結果の整理
- Must Fix / Should Fix / Nice to Have / Watch 分類補助
- Go / Conditional Go / No Go 判断補助

### Claude.ai（設計・整理）

- 設計整理（本ドキュメント作成）
- 仕様案作成
- ドキュメント案作成
- 論点整理
- 実装前の設計レビュー

### Claude Code（実装・docs反映）

- 実装(SHOGI-TOUR-002 初期段階では原則介在なし、SHOGI-TOUR-003 以降で活用)
- docs 反映
- branch 作成
- commit
- draft PR 作成
- 完了報告
- 明示指示なしに ready 化 / merge / main 直接 push / release / deploy / publish / branch 削除をしない

### Codex（独立レビュー）

- 独立レビュー(SHOGI-TOUR-002 初期段階では原則介在なし)
- Devil's Advocate
- 仕様と実装の矛盾確認
- テスト観点確認
- P0 / データ破壊 / UI 破壊リスク確認

---

## 10. 完了条件

SHOGI-TOUR-001 の完了条件：

- [x] PR #21〜#30 の棚卸しが完了している（§2）
- [x] 現在の main 到達点が説明できる（§1）
- [x] 完了済み機能と残課題が分類されている（§3 / §6）
- [x] 次フェーズ候補が比較されている（§7）
- [x] 推奨する次の一手が提示されている（§8）
- [x] その後の Claude Code / Codex に渡せる状態になっている（§9）
- [x] 実装・commit・push・PR 作成はしていない

---

**本ドキュメントの位置づけ**：
SHOGI-TOUR の現在地と次フェーズ判断材料の司令塔向け一次資料。実装に進む前に、髙橋さん + ChatGPT が読んで方針判断するためのもの。
