# SHOGI-TOUR Phase 2 プログラム 親ドキュメント — SHOGI-TOUR-PHASE2-PROGRAM-001

| 項目 | 値 |
|---|---|
| Task ID | `SHOGI-TOUR-PHASE2-PROGRAM-001` |
| 作成日 | 2026-06-16 |
| 対象 | `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）。**本ドキュメントはコードを変更しない** |
| 種別 | docs-only **プログラム親ドキュメント**（Phase 2 の傘。個別設計はしない） |
| ベース branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（orphan clean base ＝ 本線。`main` ではない。tip `d89a546`） |
| 関連（本線に実在する子・前提ドキュメント） | [大会後 現場要望 設計（§A/§B/§C/§D/§E のビジョン正本）](20260614_shogi_tour_post_event_requests_design.md)／[ふりがな MVP 設計（WS-A）](20260615_shogi_tour_furigana_mvp_design.md)／[大会履歴 MVP 設計（WS-C）](20260615_shogi_tour_history_mvp_design_001.md)／[live scoreboard 完了メモ](20260614_shogi_live_scoreboard_mvp_001_summary.md)／[PDF ファイル名 MVP 完了メモ](20260615_shogi_pdf_filename_mvp_001_summary.md) |

---

## 0. このドキュメントの位置づけ

### 0.1 目的（なぜ「親」ドキュメントが要るか）

Phase 2 の作業は、すでに **複数の独立した設計メモ**（ふりがな・大会履歴）と、**ビジョン正本**
（[post_event 設計](20260614_shogi_tour_post_event_requests_design.md) の §A/§B/§C/§D/§E）に分散している。
個々のメモは自分のスコープには詳しいが、**「Phase 2 全体として何をどの順で達成するのか」「子の間で
共有する原則・接続点は何か」**を一枚で見る場所がない。

本ドキュメントはその **傘（親）**である。役割は次の 4 つに限定する:

1. **スコープ定義** — Phase 1 / Phase 2 / Phase 3 の境界を引く（§1）。
2. **構成の地図** — Phase 2 を構成するワークストリーム（WS）を列挙し、子設計メモと現状を対応づける（§3）。
3. **共有原則の hoist** — 全 WS が継承すべき非破壊・互換・データ凍結・実データ非コミット等を**一箇所に集約**し、
   子が各自で再導出しなくて済むようにする（§4・§5）。
4. **順序とガバナンス** — WS 間の依存・推奨着手順（§6）と、PR/テスト/本番反映/レビューの運用（§7）。

**個別機能の詳細設計はしない。** 各 WS の中身は子メモ（§3 でリンク）が正本であり、本ドキュメントは
それらを上書きしない。矛盾が生じた場合は「横断原則（§4）＞親の記述＞子の記述」の順で本ドキュメント側を
直し、子に手を入れる場合は子メモ側で行う。

### 0.2 docs-only・非対象

- **コードは変更しない。** `shogi_v4.html`・保存データ実装・テスト・workflow・package は未変更。
- **本 PR は docs 追加のみ**（この親ドキュメント 1 ファイルの追加・追補のみ。コード／テスト／workflow／package／他 doc は触らない）。
- 本ドキュメントは（記述内容として）PR 作成・branch 作成・commit・push・merge・deploy を**含意しない**（それらはユーザー明示承認が要る）。
- 実名・実データ・PII・secret を**一切含めない**（例示は完全架空のみ）。
- **as-of**: 2026-06-16 時点 ／ 本線（orphan clean base）tip `d89a546` ／ production `c13abd4`（`index.html` ＋ `shogi_v4.html`）。以後の取込で本線 tip は前進する（数値は記録時点のスナップショット）。

### 0.3 「Phase 2」という語の定義（過去ラベルとの区別）

過去に `SHOGI-TOUR-001`（2026-05-10 現状棚卸し）で **PR #27〜#30 を「Phase 1〜4」と呼んだ**経緯がある
（city フィールド＝Phase 1／マスタリセット＋22名取込＝Phase 2／F7 アコーディオン＝Phase 3／swap hotfix＝Phase 4）。
これは **当時の本番直前スプリント内の micro-phase 名**であり、本ドキュメントの「Phase 2」とは**別物**である。

本ドキュメントの **Phase 2＝プログラム単位のマクロフェーズ**＝「大会**後**・大会**間**の恒久対応」
（post_event §A/§B/§C のビジョンを実装フェーズへ束ねたもの）を指す。以後、本リポジトリで `Phase 2`
と書くときはこのマクロ定義を指すものとする。

---

## 1. Phase 1 → Phase 2 → Phase 3 の境界

| フェーズ | テーマ | 代表機能 | 状態 |
|---|---|---|---|
| **Phase 1** | **当日運営**（イベントをその場で回す） | 受付 / クラス管理 / スイス式ペアリング / 結果入力 / 順位算出 / 参加費 / マスタ / F7 編集 / リセット・取込 / PDF 帳票 / **live スマホ閲覧ビュー** / PDF ファイル名 | **出荷済み（production 反映済み）** |
| **Phase 2** | **大会後・大会間の恒久対応**（データの蓄積・整備・再閲覧） | **ふりがな ruby（§A）** / **大会履歴アーカイブ（§C）** / **参加者マスタ一覧編集（§B）** / `participantMasterId`・`kanaSnapshot` のデータモデル恒久化 | **本プログラム（進行中）** |
| **Phase 3** | **横断集計・対外配信**（蓄積を価値化する） | 正規化 DB（§C-2 三表）上の年間順位 / 直接対戦 / 年間ポイント / 昇降級補助（§C-4） / 別端末配信・公開 URL・QR（§E） | **非対象**（Phase 2 は橋だけ残す。§9） |

### 1.1 Phase 1（当日運営）＝出荷済み

5/10・6/14 の月例本番を回した運営ツール一式。本線（`d89a546`）に取込済みで、`shogi_v4.html` が
production（`https://kazuo1970takahashi-sketch.github.io/shogi/`）に反映されている。直近の出荷物:

- **live スマホ閲覧ビュー**（`LIVE-MOBILE-SCOREBOARD-MVP-001`, PR #200/#204）— [完了メモ](20260614_shogi_live_scoreboard_mvp_001_summary.md)。
  read-only 全画面・`?view=scoreboard`・自動更新・最終更新時刻。
- **PDF ファイル名 MVP**（`PDF-FILENAME-MVP-001`, PR #206）— [完了メモ](20260615_shogi_pdf_filename_mvp_001_summary.md)。
  `{YYYYMMDD}_{大会名}[_{クラス名}]_{種別}`。
- **ふりがな受付一覧表示**（`FURIGANA-MVP-001`, PR #210）— Phase 1 の当日表示に乗った最小実装だが、
  恒久対応 §A の最初のスライスでもある（§3.1 で WS-A として継続管理）。

### 1.2 Phase 2（大会後・大会間の恒久対応）＝本プログラム

Phase 1 が「**その日を回す**」だったのに対し、Phase 2 は「**回し終えた後／次までの間**」に効く。

**価値の北極星（Phase 2 の目的）**: Phase 2 は、大会を「**運営しやすい**」から
**「早く始められて・見て楽しく・記録が残る」**へ進化させる。3 つの価値ピラーと WS の対応:

| 価値ピラー | 意味するもの | つながる先（WS / 機能） |
|---|---|---|
| **早く始められて** | 受付・マスタ整備で 1 局目開始を高速化する | WS-A（受付ふりがな）／ WS-B（事前のマスタ・ふりがな整備）／ 受付・1 局目開始の高速化 |
| **見て楽しく** | 参加者・観戦者が見て分かり、楽しめる表示 | WS-A（ふりがな ruby）× スマホ星取表・掲示表示（live scoreboard, Phase 1 出荷済） |
| **記録が残る** | 終わった大会が後に残り、積み上がる | WS-C（大会履歴）／ CSV ／ 将来の年間集計（Phase 3） |

ビジョン正本は [post_event 設計](20260614_shogi_tour_post_event_requests_design.md) の §A〜§C:

- **§A ふりがな ruby** — 当日表示だけでなく、全画面・帳票・履歴で氏名にルビを正しく出す恒久基盤。
- **§B 参加者マスタ一覧編集** — 後日まとめてマスタ（特にふりがな未入力）を整備できる表編集 UI。
- **§C 大会履歴アーカイブ** — 過去の月例会結果を保存し、後から閲覧できる土台。

### 1.3 Phase 3（横断集計・対外配信）＝非対象（橋だけ残す）

§C-4 の横断集計（年間順位・直接対戦・昇降級補助）と §E の別端末配信は Phase 2 では**作らない**。
ただし Phase 2 のアウトプットは Phase 3 へ **純関数で移行できる形**にしておく（identity 凍結・snapshot 形・
`participantMasterId` の導入）。これが Phase 2 の「橋」責務（§6.3・§8 Step C3）。

---

## 2. Phase 2 のゴールと成功条件

| # | ゴール | 成功条件（観測可能な形） |
|---|---|---|
| G1 | 氏名にふりがなを**全主要画面で**正しく出せる | 受付・閲覧/星取表・順位表・PDF/報告書で ruby 表示。未入力は氏名のみ（空 `<rt>` を出さない）。XSS 安全 |
| G2 | 過去の月例会を**保存して後から閲覧**できる | `shogi_archive` に確定大会を追記、履歴一覧＋read-only 星取表で再閲覧。当日 state は無傷 |
| G3 | マスタ（特にふりがな未入力）を**後日まとめて整備**できる | 表形式の一覧編集 UI で差分確認 → `saveBranchMaster()`。過去結果の凍結表示は不変 |
| G4 | 氏名・ふりがな・大会の**正本データモデル**が `participantMasterId` で一貫する | `participantMasterId` 紐づけ＋`nameSnapshot`/`kanaSnapshot` 凍結。Phase 3 の DB 化へ純関数で移行可能 |
| G5 | 上記すべてが**既存運営を壊さない** | 順位計算・結果入力・保存読込・既存テストが不変。旧データは後方互換で既定表示 |

---

## 3. 構成ワークストリーム（子ドキュメント一覧）

| WS | ビジョン § | 子設計メモ（正本） | MVP 状態 | 次の一手 |
|---|---|---|---|---|
| **WS-A ふりがな ruby** | §A | [ふりがな MVP 設計](20260615_shogi_tour_furigana_mvp_design.md)（`FURIGANA-DESIGN-001` / PR #209） | **MVP 実装済み・production 反映済み**（PR #210：受付一覧 1 画面 ruby ＋ `player.yomi`） | 閲覧/スマホ星取表 → 順位表 → PDF/報告書 へ ruby 展開（§3.1） |
| **WS-C 大会履歴アーカイブ** | §C | [大会履歴 MVP 設計](20260615_shogi_tour_history_mvp_design_001.md)（`HISTORY-DESIGN-001` / PR #207） | **MVP 設計済み・実装未着手** | `shogi_archive` 追記＋一覧＋read-only 閲覧の実装 PR（§3.2） |
| **WS-B 参加者マスタ一覧編集** | §B | **未作成**（[post_event §B](20260614_shogi_tour_post_event_requests_design.md) が seed） | **未着手（設計から）** | §B を MVP スライスに切り出す docs-only 設計メモ（§3.3） |

> 凡例: 「MVP 状態」は各 WS の**最初のスライス**の到達度。WS-A は MVP が出荷済みでも、恒久対応（§A 全体）は
> まだ途中である点に注意（残りは下記）。

### 3.1 WS-A ふりがな ruby（§A）— MVP 出荷済み、全画面展開が残

- **済み（PR #210）**: 当日 `player.yomi`（snapshot 文字列）＋ 受付一覧の DOM 版 `renderPlayerNameWithRuby(name, yomi)`。
  `normalizeState` 既定 `''` で旧データ後方互換、空 yomi は氏名のみ。
- **残（[ふりがな設計 §8 後続スライス順](20260615_shogi_tour_furigana_mvp_design.md) に準拠）**:
  1. 閲覧ビュー / スマホ星取表 ruby（当日 state 単体で出せる最初の高価値地点）。
  2. 順位表 ruby（**escape 済み文字列版** helper が要る）。
  3. PDF / 報告書 ruby（print CSS のルビ潰れ調整・print 経路は敏感でリスク高）。
  4. `participantMasterId` 化 ＋ `kanaSnapshot` 改名（**WS-C の identity 移行と一緒に**＝§6.3 の収束点）。
- **注意**: 現状の `player.yomi` は §A の `kanaSnapshot` の役割を満たす「当日スナップショット」。改名・正本化は
  単独で先走らず、WS-C／Phase 3 のデータモデル恒久化に畳み込む（子メモ §3.1 の決定を踏襲）。

### 3.2 WS-C 大会履歴アーカイブ（§C）— 設計済み、実装これから

- **設計の load-bearing 決定**（[履歴 MVP 設計](20260615_shogi_tour_history_mvp_design_001.md) が正本）:
  - 保存単位＝確定 `state` の deep-clone スナップショット＋identity メタ（正規化しない）。
  - 新キー **`shogi_archive`**（追記専用・`schema_version` 付き）。既存 `shogi_v4`/`shogi_branch_master`/
    `save`/`load`/`normalizeState` に**触れない**（現 `shogi_v4.html` に `shogi_archive` は不在＝衝突なし）。
  - **restore はやらない**（閲覧専用）。持ち出しは既存 `saveData()`＋import に委譲。
  - **唯一の既存コード改修点＝scoreboard レンダラ（`renderScoreboard`/`buildScoreboardClassTableHtml`）の
    後方互換 optional 引数化**（引数なし＝既存 live 挙動不変）。quota は `isQuotaExceededError`/`notifySaveWarning` 再利用。
- **実装スライス順**（子メモ §16）: Step 1 archive＋一覧＋閲覧 → Step 2 PDF 再出力/JSON export → Step 3 §C 正規化 DB。
  Phase 2 では **Step 1〜2 まで**。Step 3 は Phase 3（§9）。

### 3.3 WS-B 参加者マスタ一覧編集（§B）— 未設計

- 現状、子設計メモは**まだ無い**。着手は [post_event §B](20260614_shogi_tour_post_event_requests_design.md) を
  seed に、まず **docs-only の MVP 設計メモ**から（本プログラムの他 WS と同じ「設計メモ → 実装 PR」2 段）。
- §B の要点（seed）: 表形式の直接編集 / ふりがな未入力のハイライト・フィルタ / 保存前の差分提示 /
  `participantMasterId` は編集不可 / 既存 `loadBranchMaster()`・`saveBranchMaster()` を SoT に（DOM を SoT にしない）/
  保存済みスナップショット（`nameSnapshot`/`kanaSnapshot`）は変更しない（過去は遡らない）。
- **依存**: WS-B はマスタの `kana` 正本を整備する面でもあるため、WS-A の `participantMasterId` 化（§6.3）と相互に効く。
  ただし MVP レベルでは独立に着手できる（既存マスタ編集の延長）。

---

## 4. 横断原則（全 WS が継承する制約）

[post_event §D](20260614_shogi_tour_post_event_requests_design.md) と
[リポジトリ運用制約](20260614_shogi_tour_post_event_requests_design.md) を Phase 2 全体に hoist する。
**各子メモはこれを再導出せず、本節を参照する。**

1. **非破壊（既存ロジック不変）**: `calcFinal` / `computeDisplayRanks` / `setWinner` / `submitRound` /
   `startTournamentForClass` / `save` / `load` / `normalizeState` / `saveBranchMaster` を**変更しない**。
   新機能は **追加フィールド ＋ 別ストア ＋ 純関数**で実現する。
2. **後方互換（旧データが壊れない）**: すべての新規フィールドは `normalizeState`（または `normalizeBranchMaster`）の
   schema 既定（空文字 / 既定値）で旧データを補完する。旧データを読んでも壊れない・既定表示になる、を必須要件とする。
3. **identity は ID 紐づけ＋凍結**: 横断・参照は氏名一致でなく `participantMasterId` をキーにする。大会結果の
   氏名・ふりがなは `nameSnapshot` / `kanaSnapshot` で**凍結**し、後日マスタを直しても**過去表示は遡って変わらない**。
4. **escape / XSS 必須**: 氏名・ふりがなは表示・PDF・innerHTML のいずれでも escape する。`<ruby>/<rt>` は
   可能なら DOM API 生成、innerHTML を使う経路は **escape 済み文字列のみ**（ファイル名は除去方式＝`sanitizeFilenamePart`）。
5. **実データ非コミット**: 履歴・マスタ・ふりがなは 100% ブラウザ localStorage。**repo に commit しない**。
   コード・docs・テスト・fixture・コメント・PR 本文に実名/実データを入れない。テスト・サンプルは**完全架空のみ**
   （`架空 …` / `Dummy …` / `example.invalid` / `synthetic`）。持ち出し JSON は端末ローカルの `data/`（`.gitignore` 済）へ。
6. **read-only 閲覧の徹底**: 閲覧経路（live scoreboard / 履歴閲覧）に編集系 UI・運営画面への戻り導線を置かない
   （[post_event Must Fix 1](20260614_shogi_tour_post_event_requests_design.md)）。閲覧は「凍結された読み物」。

---

## 5. 共有インフラと接続点（touchpoints）

複数 WS が同じ既存コード資産に触れる。**重複実装を避け、改修は一度だけ・後方互換で行う**ための共有点を明示する。

| 共有資産 | 由来 | これに依存する WS | 約束（後方互換の取り決め） |
|---|---|---|---|
| `renderPlayerNameWithRuby(name, yomi)` | PR #210（WS-A MVP） | WS-A 全展開 | DOM 版（受付）に加え、順位表/PDF 用に **escape 済み文字列版**を併設。空 yomi は氏名のみ |
| scoreboard レンダラ（`renderScoreboard` / `buildScoreboardClassTableHtml`） | live MVP（#200/#204） | WS-C 閲覧 ＋ WS-A 星取表 ruby | **後方互換 optional 引数化**（`sourceState` 既定＝global `state`、引数なし＝live 挙動不変）。引数化は WS-C で一度行い、ruby 化は同じ共有レンダラに乗せる |
| `buildTournamentPdfFilename` / `buildTournamentHeldDateCompact` / identity 凍結材料 | PDF-FILENAME-MVP（#206） | WS-C identity（`title`/`heldDate`/`targetMonthLabel`）＋ WS-A の PDF 経路 | 命名材料を snapshot に凍結し、過去大会も当時の正しい名前で再出力できるようにする |
| `normalizeState` / `normalizeBranchMaster` の schema 既定 | 既存 | 全 WS | 新フィールドは既定値補完で旧データ後方互換（§4-2） |
| quota helper（`isQuotaExceededError` / `notifySaveWarning`） | 既存 | WS-C（3 つ目の `setItem` 経路） | 新しい握りつぶしを作らず再利用。超過時はロールバックで当日 state 無傷 |

---

## 6. 依存関係と推奨着手順

### 6.1 WS 間の依存（ざっくり）

```
WS-A ふりがな ── MVP済(#210) ─┐
                              ├─▶ [収束] participantMasterId化 + kanaSnapshot正本化 ─▶ Phase 3 (DB化・横断集計)
WS-C 大会履歴 ── 設計済 ──────┘            ▲
WS-B マスタ一覧編集 ── 未設計 ─────────────┘ (kana正本の整備面で寄与)
```

- WS-A と WS-C は**当面は独立に進められる**（WS-A は当日 state 単体で展開、WS-C は別キー追記）。
- ただし両者は **`participantMasterId` 化 / `kanaSnapshot` 改名**で**収束**する（§6.3）。この収束が Phase 3 の橋。
- WS-B は独立着手可だが、マスタの `kana` 正本を整える点で収束に寄与する。

### 6.2 推奨着手順（高価値・低リスク順）

1. **WS-C Step 1 実装**（履歴 archive＋一覧＋read-only 閲覧）。設計が最も成熟、既存非干渉、scoreboard レンダラ引数化を確立。
2. **WS-A 展開その1**（閲覧ビュー / スマホ星取表 ruby）。`player.yomi` が効く最初の地点。**1 と同じ共有レンダラ**に
   乗るので、scoreboard レンダラの引数化（1 で実施）と ruby 化（2）を**連続で**行うと改修が一度で済む。
3. **WS-A 展開その2**（順位表 → PDF/報告書 ruby）。文字列版 helper・print CSS のリスクを別スライスで隔離。
4. **WS-B MVP 設計メモ → 実装**（マスタ一覧編集）。
5. **WS-C Step 2**（過去大会の PDF 再出力 / JSON export）。
6. **収束（§6.3）**: `participantMasterId` 化 ＋ `kanaSnapshot` 正本化（WS-A 残り＋WS-C identity を一緒に）。

### 6.3 収束点（Phase 2 → Phase 3 の橋）

- WS-A の `player.yomi`（当日 snapshot 文字列）と WS-C の `state` snapshot は、いずれも**今は氏名/ふりがなを文字列で
  凍結**しているだけで、`participantMasterId` による正規化はしていない（各 MVP の意図的な先送り）。
- Phase 2 の最後に、両者を **`participantMasterId` 紐づけ ＋ `kanaSnapshot` 命名へ揃える**。これにより
  [§C-3 の純関数 `buildTournamentArchiveFromState(state)`](20260614_shogi_tour_post_event_requests_design.md) を
  後段で被せれば、蓄積済み snapshot を**捨てずに**正規化 3 表（Phase 3）へ移せる。
- **この収束を WS-A 単独で先走らない**こと（子メモ双方の決定）。識別子の改名はマイグレーションを伴うため、
  WS-C の identity 移行と**同じ PR 群**で行う。

---

## 7. 運用ガバナンス（PR / テスト / 本番反映 / レビュー / データ）

Phase 2 の各 WS はこの運用に従う（[リポジトリ運用制約](20260614_shogi_tour_post_event_requests_design.md) と整合）。

- **PR ベース＝orphan clean base 一択**: `--base chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（本線・tip `d89a546`）。
  **`main` をベースにしない**（共有履歴ゼロで全ツリー差分になる）。docs-only 設計メモ PR も最初からこの base で作る。
- **surgical staging**: `git add -A` しない。対象ファイルだけ stage（working tree に大量の untracked が同居するため）。
- **2 段プロセス**: 「docs-only 設計メモ（実装根拠）」→「最小実装 PR」。設計メモは本ドキュメントを親として参照する。
- **テスト方針**: 純関数中心（DOM を SoT にしない）。`bash test/run_tests.sh shogi_v4.html` を維持。**件数は未追跡 fixture/test の
  有無で環境依存**するため固定値を約束せず、実装時に同コマンドで baseline（無改変 tip を `git worktree --detach` で出す）と比較する。
- **本番反映は別レルース PR**: production（`index.html` ＋ `shogi_v4.html` の 2 ファイルのみ）へは `--base production` の
  別 PR で反映。**production 宛 PR は CI が走らない**（workflow は main scoped）ため、`run_tests.sh`＋`mergeStateStatus=CLEAN`
  で代替検証。merge / Pages 変更 / deploy はユーザー明示承認が必須。
- **レビュー gate**: 設計メモは read-only レビュー（Go/Must Fix/Should Fix）、実装 PR は Codex/レビュアで gate。
- **dangling link を作らない**: 本線に**実在するファイルだけ**をリンクする（`docs/specs/*` や `docs/ops/*` は本線未追跡＝
  リンクせず ID/名称参照に留める）。本ドキュメントのリンクはすべて本線 `docs/notes/` の実在ファイル。

### 7.1 Agent 並行運用ルール（A/B/C 起動の前提）

WS-A / WS-B / WS-C を複数の Agent（A/B/C）が分担して並行に進める際の安全規約。**本節は Agent 起動の前提**であり、
逸脱が必要な場合は着手前にユーザー承認を得る。

1. **コード実装は原則 1 ライン（直列）**。`shogi_v4.html` を触る WS は、原則として**同時に 1 本だけ**進行させる。
   実装 PR を複数 open してよいが、`shogi_v4.html` への**実装フェーズは 1 ラインずつ直列化**する
   （巨大な単一ファイルゆえ、並行編集は衝突・取りこぼしの温床）。
2. **WS-A と WS-C の CODE フェーズは同時実装・同時 merge を避ける**。両者は共有 touchpoint
   （scoreboard レンダラ／`renderPlayerNameWithRuby`／`normalizeState` 既定。§5・§11）に触れる可能性が高い。
   一方の実装・レビュー・merge が落ち着いてから他方の CODE フェーズへ進む（§6.2 の連続改修方針と一致）。
3. **docs-only 設計メモは並行可**。コードに触れない設計メモ（例: WS-B 設計、本親ドキュメントの改訂）は
   別 Agent が**並行**して進めてよい（衝突面が無い）。
4. **各 WS の PR は Draft 起票を原則**。実装・設計いずれの PR も、まず Draft で起票してレビューに回す。
5. **Ready 化・merge はユーザーの明示承認後のみ**。Agent 判断で Ready 化／merge しない。
6. **branch 削除・main / production・release / deploy / publish は明示承認なしに行わない**
   （横断原則 §4・ガバナンス §7 のとおり、常にユーザー承認事項）。
7. **他 Agent の成果物に勝手に触れない**。Agent A/B/C は、自分の担当 WS 以外の
   **branch / PR / commit / 成果物を改変・force push・close・rebase しない**。
   共有 touchpoint の調整が要るときは、独断で割り込まずユーザーに相談して順序を決める。

---

## 8. Phase 2 マイルストーン（ロードマップ）

| マイルストーン | 含む WS スライス | 完了の定義 |
|---|---|---|
| **M1 履歴 read-only** | WS-C Step 1 ＋ scoreboard レンダラ引数化 | 確定大会を `shogi_archive` に保存・一覧・read-only 閲覧。当日 state 無傷・既存テスト不変 |
| **M2 当日 ruby 展開** | WS-A 閲覧/星取表/順位表 ruby | 当日 state 由来の主要画面で ruby 表示（未入力は氏名のみ・XSS 安全） |
| **M3 帳票 ruby ＋ 過去再出力** | WS-A PDF/報告書 ruby ＋ WS-C Step 2 | print 経路の ruby と過去大会 PDF 再出力 / JSON export |
| **M4 マスタ一覧編集** | WS-B（設計 → 実装） | 表形式編集・未入力ハイライト・差分確認保存。過去スナップショット不変 |
| **M5 データモデル恒久化（橋）** | §6.3 収束（WS-A 残り＋WS-C identity） | `participantMasterId` 紐づけ＋`kanaSnapshot` 正本化。Phase 3 へ純関数移行可能な状態 |

> M1→M5 はおおむね §6.2 の着手順に対応。各 M は独立した実装 PR（群）として出す。

> 価値ピラー（§1.2）↔マイルストーン: **記録が残る** = M1・M3（過去再出力）・M5（年間集計への橋）／
> **見て楽しく** = M2・M3（帳票 ruby）／**早く始められて** = M4（事前マスタ整備）＋ WS-A 受付 ruby（出荷済 #210）。

---

## 9. 非対象（Phase 2 でやらないこと）

| 区分 | 項目 | 行き先 |
|---|---|---|
| データ | §C 正規化 3 表 DB（`tournaments`/`tournamentPlayers`/`games`）の**構築** | Phase 3（Phase 2 は移行可能な形に整えるのみ） |
| 集計 | 年間順位 / 直接対戦 / 年間ポイント / 月例会別推移 / 昇降級補助（§C-4） | Phase 3 |
| 配信 | 別端末同期 / 公開 URL / 静的書き出し / QR（§E） | Phase 3 |
| 履歴 | 過去 snapshot の **restore（現 state へ書き戻し）** | 恒久的に非対象（閲覧専用。持ち出しは export に委譲） |
| 自動化 | 確定時の**自動**アーカイブ / 自動 dedup / merge / CSV 自動入出力 | 当面非対象（履歴は明示保存、§C 子メモ §11） |
| 別領域 | 棋譜解析 / AI コーチ / 学習支援 | 別プロジェクト（SHOGI-LEARN / shogi-coach） |
| 既存 | `save` / `load` / `normalizeState` / 順位計算 / 勝敗入力の変更 | しない（§4-1） |

---

## 10. プログラム横断の未決事項（着手前に確認）

| # | 項目 | 暫定方針 | 関連 |
|---|---|---|---|
| 1 | 「Phase 2」の境界（本ドキュメントの §1 区分）でよいか | §1 のとおり（当日運営＝1／後・間＝2／集計・配信＝3）。ユーザー確認で調整可 | §0.3・§1 |
| 2 | WS-B（マスタ一覧編集）に着手する優先度 | M4。WS-A/C 先行でよいか、ふりがな整備のため前倒すかは要判断 | §3.3・§8 |
| 3 | `participantMasterId` 化の実施タイミング | M5 で WS-A 残り＋WS-C identity を**一緒に**（先走らない） | §6.3 |
| 4 | 履歴起動経路（運営内タブ / `?view=history`） | どちらでも可。対称性なら `?view=history`（WS-C 子メモ §6.3 の未決を継承） | §3.2 |
| 5 | `shogi_archive` 上限・超過時 UX | 警告のみ・自動削除なし（WS-C 子メモ §4.2 を継承） | §3.2 |
| 6 | ふりがな全画面展開の打ち切り基準 | 受付＋閲覧＋順位表＋PDF で「実用上十分」とするか、対局管理 `winner-btn` まで行くか | §3.1 |

---

## 11. リスクと留意

- **print 経路は敏感**: PDF/報告書の ruby（M3）は print CSS でルビが潰れやすく、直近の PDF タイトル/FAX 対応でも
  print 経路は注意が必要だった。M3 は別スライスに隔離し、`result-finalized-*` の VRT 不変を確認する。
- **scoreboard レンダラの二重改修を避ける**: 引数化（WS-C）と ruby 化（WS-A）を別 PR で別々にやると同じ関数を 2 度触る。
  §6.2 のとおり**連続させて改修回数を最小化**し、§7.1-2 のとおり WS-A/WS-C の CODE フェーズを同時に走らせない。
- **識別子改名の早すぎる着手**: `kanaSnapshot`/`participantMasterId` をマイグレーション無しで先に変えると後方互換を壊す。
  必ず M5（収束）で行う。
- **本番反映の検証が CI で代替されない**: production PR は CI 非対象。`run_tests.sh`＋`mergeStateStatus=CLEAN`＋
  無改変 production との比較で代替する運用を守る（§7）。
- **dangling link**: 本線未追跡ファイル（`docs/specs/*`・`docs/ops/*`）へのリンクを足さない（過去レビュー指摘）。

---

## 12. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-06-16 | v0 作成。Phase 2（大会後・大会間の恒久対応）のプログラム親ドキュメント（docs-only）。Phase 1/2/3 の境界、構成 WS（A ふりがな=MVP出荷済 / C 大会履歴=設計済 / B マスタ一覧編集=未設計）と子メモ対応、横断原則の hoist（§D＋運用制約）、共有インフラ接続点、依存・推奨着手順と Phase 3 への橋、運用ガバナンス、マイルストーン、非対象、未決事項、リスクを整理。コード・既存ドキュメントは未変更。 |
| 2026-06-16 | v0.1 PR #212 read-only レビュー反映（docs-only）。**Must Fix**: §7.1「Agent 並行運用ルール（A/B/C 起動の前提）」を新設（コード実装 1 ライン直列／WS-A・WS-C の CODE 同時実装・同時 merge 回避／docs 設計は並行可／PR は Draft 起票／Ready 化・merge は明示承認／branch 削除・main・production・release・deploy・publish は明示承認／他 Agent 成果物に触れない）。**Should Fix**: §1.2 に価値叙述（「運営しやすい→早く始められて・見て楽しく・記録が残る」とピラー↔WS 対応表）を追加。**Nice to Have**: §0.2 に as-of ピン（2026-06-16／本線 tip `d89a546`／production `c13abd4`）と「本 PR は docs 追加のみ」、§8 に価値ピラー↔マイルストーン対応、§11 に §7.1 への相互参照。コードは未変更。 |
