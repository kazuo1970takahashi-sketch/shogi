# Codex 実装レビュー依頼 — shogi_v4 Phase A-2 v6 実装（PR #2）

**依頼日時**: 2026-05-05 08:40 JST
**依頼者**: 髙橋一雄
**対象プロジェクト**: shogi_v4（沼津支部 月例将棋大会 運営ツール）
**対象 PR**: https://github.com/kazuo1970takahashi-sketch/shogi/pull/2
**対象ブランチ**: `feat/phase-a2-yomi`（最新 commit `9683ee1`、main から +7 commits）
**レビュー種別**: 実装レビュー（コード読解 + ローカルテスト実行）
**根拠**: DevSecOps v1.2 Slim 6.2 節「設計→ChatGPT メタレビュー→Claude Code 実装→Codex 実装レビュー」フルサイクル 3周目

---

## 0. 用語に関する注記（v1.2 Slim 5.3節準拠）

| エージェント | 役割 |
|---|---|
| Claude.ai | 設計／調査／依頼文 |
| ChatGPT | 設計メタレビュー（GitHub 連携） |
| Claude Code | 実装／Git |
| **Codex（本依頼の実施主体）** | **独立レビュー（実装コード検証）** |

---

## 1. 背景

### 1.1 これまでの経緯

shogi_v4 は沼津支部 月例将棋大会の運営ツール。Phase A-1（支部マスタ + ワンクリック呼び出し + 漢字検索）が main マージ済み（commit `737bb7a`）。

| 時系列 | フェーズ | 担当 | 結果 |
|---|---|---|---|
| 2026-05-05 | Phase A-1 設計 v1〜v5、main マージ完了 | Claude.ai + ChatGPT + Claude Code + Codex | A- / Go |
| 2026-05-05 | Phase A-2 設計 v6 | Claude.ai | 完成（445行）|
| 2026-05-05 | Phase A-2 設計レビュー（v6）| ChatGPT | **A- / Go / Must Fix なし / Minor 5件** |
| 2026-05-05 | Phase A-2 実装（Stage 1〜6）| Claude Code | PR #2 作成（commit `9683ee1`）|
| **本依頼** | **Phase A-2 実装レビュー** | **Codex** | **判定待ち** |

### 1.2 Phase A-2 の位置づけ

A-1 で構築した支部マスタの基本機能（漢字検索ベース）を、**ふりがな対応で拡張する小規模フェーズ**。

| 項目 | 値 |
|---|---|
| スコープ | 5項目（F4 + F5b + F6 + Codex Minor 2件）|
| 仕様書 | `docs/specs/20260505_0753_shogi_design_phaseA2_v6.md`（445行）|
| ChatGPT メタレビュー結果 | A- / Go / Must Fix なし |
| 実装規模 | shogi_v4.html +269/-25、test/test_branch_master.js +377 |
| コミット数 | 7（Stage 0 docs + Stage 1〜6 実装、Stage 7 はプッシュ）|
| テスト件数 | 既存 161 件 + 新規 145 件 = **計 306 件 すべて緑** |

### 1.3 v6 の3つの設計判断

| 論点 | 採用 | ChatGPT 評価 |
|---|---|---|
| ふりがな入力方式 | 方式 Y（ワンクリック呼び出し時にダイアログ）| 採用妥当 |
| ダイアログ形式 | パターン B（まとめて一括入力フォーム）| 採用妥当 |
| yomi 空の扱い | パターン あ（「他」タブに集約、消さない）| 採用妥当 |

### 1.4 ChatGPT Minor 5件への対応

| Minor | 対応 Stage | 反映内容 |
|---|---|---|
| M1: UI文言 | Stage 5 | ダイアログに50音タブ・検索の説明文 + キャンセル補足を追加 |
| M2: 半角カナ非対応 | Stage 2-4 | normalizeYomi/getYomiInitialRow に半角カナ→other のテスト追加 |
| M3: 「他」タブ補足 | Stage 4 | タブ下に「他: ふりがな未登録・その他」を常時表示 |
| M4: 全員空欄通知 | Stage 5 | showMsg('ふりがな未登録のまま N名を追加…','warn')|
| M5: テスト数表記統一 | 全 Stage | コミットメッセージ・PR 本文に「既存全 161 件、うち支部マスタ 111 件」を統一表記 |

---

## 2. レビュー対象

### 2.1 GitHub 参照

| 参照対象 | パス・URL |
|---|---|
| **PR**（推奨レビューUI）| https://github.com/kazuo1970takahashi-sketch/shogi/pull/2 |
| 対象ブランチ | `feat/phase-a2-yomi` |
| 対象コミット範囲 | `main` → `9683ee1`（+7 commits）|
| **本依頼文**（参考用）| `docs/reviews/20260505_0840_shogi_codex_implementation_review_request_phaseA2_v6.md`（後ほど配置）|
| **仕様書 v6**（実装の根拠）| `docs/specs/20260505_0753_shogi_design_phaseA2_v6.md` |
| **ChatGPT メタレビュー結果**（実装の指針）| `docs/reviews/20260505_0814_chatgpt_review_response_v6_design.md` |
| Phase A-1 仕様書 v5（前提）| `docs/specs/20260505_0217_shogi_design_phaseA_reception_v5.md` |
| 実装本体 | `shogi_v4.html`（+269/-25 行）|
| 新規テスト | `test/test_branch_master.js`（+377 行）|

### 2.2 ローカル実行

```bash
cd <作業ディレクトリ>
git clone https://github.com/kazuo1970takahashi-sketch/shogi.git || (cd shogi && git fetch origin)
cd shogi
git checkout feat/phase-a2-yomi
git pull origin feat/phase-a2-yomi

bash test/run_tests.sh shogi_v4.html
```

期待される結果：
- 既存テスト（第1〜3層 + ペアリング性質 + タブ選択 + JSON フィクスチャ + 支部マスタ）：**PASS=50, FAIL=0**
- 支部マスタ機能テスト（test_branch_master.js）：**PASS=256, FAIL=0**
- 合計 306 件 / FAIL 0

---

## 3. レビュー観点（仕様書 v6 + ChatGPT 25完了条件 + 12禁止事項を網羅）

### ★★★ 必須判定：Stage 2〜6 の実装が仕様書 v6 通りか

#### 観点 A. Stage 2 ユーティリティ関数（仕様書 v6 §3.4 / §3.5）

`normalizeYomi` / `getYomiInitialRow` の実装を検証。

**確認項目**：
- normalizeYomi のカタカナ→ひらがな変換範囲が `[ァ-ヶ]` で正しいか
- 前後空白除去 + 途中の半角・全角空白削除が機能するか
- 長音符（ー）/ 小書き文字（ぁ・ょ・っ）が保持されるか
- undefined / null / 非文字列で空文字を返すか
- ヴ→ゔ、ヵ→ゕ、ヶ→ゖ の変換
- **半角カナ（U+FF66-FF9F）が変換されない** こと（A-2 非対応の明記が守られているか）
- getYomiInitialRow の12分類が正しいか
- 濁音・半濁音（が→ka, ぱ→ha）が同行に分類されるか
- 小書き文字（ぁ→a, ょ→ya, っ→ta）が同行に分類されるか
- ゔ・ゕ・ゖ・半角カナ・数字・記号・先頭長音符が **other** に分類されるか

**判定**：**OK / Minor / Must Fix が残っている**

#### 観点 B. Stage 3 F5b ふりがな検索（仕様書 v6 §3.2）

`matchesPastParticipantQuery` および `buildPastParticipantsPanelHtml` を検証。

**確認項目**：
- 漢字一致 OR ふりがな一致でヒットするか
- 両方一致でも boolean 戻り値で重複表示なし
- カタカナ入力（「サトウ」）→ 「さとう」と同じヒット
- ローマ字（「sa」）は A-2 非対応で false
- 空 query で全件表示
- yomi 空 member は漢字でしか引けない（ふりがなで引けない）
- 検索ボックスのプレースホルダが「漢字・ふりがな」に更新されている
- ChatGPT E 反映：name 自体は normalizeYomi せず、yomi 側だけ正規化

**判定**：**OK / Minor / Must Fix が残っている**

#### 観点 C. Stage 4 F6 50音タブ（仕様書 v6 §3.3 / §4.1）

`buildPastParticipantsPanelHtml` の50音タブ拡張を検証。

**確認項目**：
- 12タブ（全/あ/か/さ/た/な/は/ま/や/ら/わ/他）が描画されるか
- 「全」タブで全 member 表示
- 各行タブで該当 member のみ表示（あ行で青木、か行で加藤・後藤等）
- 「他」タブで yomi 空 + ローマ字 yomi + 数字 yomi が表示
- 「他」タブで yomi 空が先頭、後方に other
- タブ + 検索の AND 条件
- 件数保存則：全タブ件数 = 各行 + 他 の合計
- active クラスが選択中タブのみに付くか
- ChatGPT M3 反映：「他: ふりがな未登録・その他」の補足文が常時表示
- スマホ対応：タブが画面幅に収まるよう overflow-x:auto
- タブ要素にタップ可能サイズ（min-width:36px, min-height:36px）

**判定**：**OK / Minor / Must Fix が残っている**

#### 観点 D. Stage 5 F4 ふりがな入力ダイアログ（仕様書 v6 §3.1 / §4.2）

`buildYomiInputModalHtml` / `bindYomiInputModalEvents` / `openYomiInputDialog` / `applyYomiInputsToMaster` を検証。

**確認項目**：
- ワンクリック呼び出し時、yomi 空の人だけがダイアログに出る（既に yomi がある人は出ない）
- yomi 空が0名 → ダイアログ非表示で即追加
- 入力された yomi が normalizeYomi 後にマスタへ保存される
- 空欄のまま「追加する」 → yomi 空のまま追加
- 部分入力（3名中2名入力、1名空欄）の挙動
- 「キャンセル」で yomi も参加者リストも変更されない
- inputmode="kana" でスマホかな入力モード
- build/bind/coordinator パターンが守られているか
- ChatGPT M1 反映：説明文 + キャンセル補足
- ChatGPT M4 反映：全員空欄追加時の showMsg 通知

**判定**：**OK / Minor / Must Fix が残っている**

#### 観点 E. Stage 6 Codex Minor #1（マイグレ警告）+ #2（crypto 通知）

`buildMigrationModalHtml` / `openMigrationWizard` / `updateBranchMasterFromTournament` 内の crypto 通知を検証。

**確認項目（Minor #1）**：
- `buildMigrationModalHtml(opts)` の opts.corrupted が機能するか
- 通常マスタで警告なし、破損マスタで警告あり
- 警告がヘッダーより前に出る
- 警告に再構築の説明が含まれる
- `mig-corrupt-warning` クラスが付く
- `openMigrationWizard` が `_loaded_with_corruption` フラグを読んで渡す

**確認項目（Minor #2）**：
- `_phaseA2State.cryptoNotificationShown` フラグの初期状態
- crypto 不在環境で1回目の同期 → 通知フラグが true になる
- 2回目以降は true 維持（過剰繰返し防止）
- crypto 正常環境ではフラグ false のまま
- showMsg メッセージ内容（「お使いのブラウザは古いため…」）

**判定**：**OK / Minor / Must Fix が残っている**

### ★★ 重要：新規導入箇所の堅牢性

#### 観点 F. ChatGPT 25完了条件の網羅

ChatGPT メタレビュー結果に記載の **25項目の実装完了条件** がコードレベルで満たされているか確認。

特に重要な項目：
1. schema_version は 1 のまま（v6 §2.1）
2. 既存 A-1 マスタをロードしても壊れない（後方互換性）
3. yomi 空・yomi 欠落・null相当でも例外が出ない（堅牢性）
6. ダイアログで入力した yomi は normalizeYomi 後にマスタへ保存
8. キャンセル時は yomi も参加者リストも変更されない
14. 全タブは既存同等の全件表示
17. 「他」タブでは yomi 空が先頭に来る
21. A-1 既存テスト161件、特に支部マスタ111アサーションをすべて緑維持

#### 観点 G. ChatGPT 12禁止事項の遵守

スコープ管理のため：

1. **schema_version を変更していないか**（grep で確認）
2. **F7 マスタ編集画面を作っていないか**
3. **F8 エクスポート/インポートを作っていないか**
4. **ローマ字検索を実装していないか**
5. **ふりがな自動推定を実装していないか**
6. **半角カナ対応を追加していないか**（other 扱いになっているか）
7. **既存フォーム全体を大きく再設計していないか**
8. **既存CSSを大きく組み替えていないか**
9. **build/bind/coordinator パターンを崩していないか**
10. **A-1 の既存テストを変更して通すような対応をしていないか**
11. **shogi_v4.html 以外の実装ファイルを増やしていないか**
12. **Codex Minor #1/#2 の Stage 6 が肥大化していないか**

#### 観点 H. テストの実効性（false-positive チェック）

新規 145 件のテストが「テストは緑だが実装が間違っている」を検出する構造になっているか：

- 修正前のコードでも通ってしまうテストはないか
- 純粋関数化（applyYomiInputsToMaster）の境界テストの実効性
- 件数保存則（F6）の妥当性
- crypto 不在テストの再現性（loadEnv の noCrypto オプション）
- 破損マスタテストの再現性

#### 観点 I. 既存大会運営の非破壊

A-1 で完成した機能（漢字検索、ワンクリック呼び出し、マイグレ）が A-2 で壊れていないか：

- 既存 50 テスト全件緑か（実機で確認）
- 既存 build/bind/coordinator パターンを維持しているか
- 既存タブ（reg/tournament/result/master）の挙動が変わっていないか
- マスタなしで起動しても従来通り動くか
- A-1 で構築済みマスタ（yomi 空）でも全機能動くか

### ★ 補助観点

#### 観点 J. コード品質

- セクション分けの明確性
- コメントの質（仕様書 §3.4 等への参照が適切か）
- 既存パターン（normalizePersonName, generateMemberId 等）との整合
- ES5 構文維持

#### 観点 K. パフォーマンスとスケール

- 100〜300名規模の参加者マスタで50音タブが軽快に動くか
- normalizeYomi が頻繁に呼ばれても問題ない計算量か

#### 観点 L. ブラウザ互換性

- 単一HTML + localStorage の構成維持
- ES5 範囲内
- スマホでのタブ操作（タップサイズ、横スクロール）

---

## 4. 期待するアウトプット

### 4.1 形式

各観点（A〜L）について判定とコメント。

### 4.2 判定の解像度

| 解像度 | 意味 | 後続アクション |
|---|---|---|
| **OK** | そのまま main にマージしてよい | main マージへ |
| **Minor** | 軽微な改善提案あり（A-3 で対応可）| バックログ化 |
| **Must Fix（実装修正）**| マージ前に修正が必要 | 再度 fix コミット → 再々レビュー |
| **Must Fix（仕様修正）**| 仕様書の不備が露呈 | 仕様書 v6.1 + 実装やり直し |
| **Critical**| 既存運営を壊している、データ消失リスクなど | 即停止、main マージ禁止 |

### 4.3 等級判定

- 設計レビュー基準（v6 仕様書）：A- / Go
- 前回 Phase A-1 v5 実装：A- / Go / main マージ Yes

今回の Phase A-2 v6 実装が **設計の A- に追いついているか / 越えているか / 落ちているか** を判定してください。

### 4.4 main マージ判断

最後に、**「main にマージしてよいか」** の明示的な Yes/No を含めてください。

---

## 5. 特に重視してほしい点

1. **Phase A-1 と同レベルの厳格さ**：A-1 では「テストは緑だが実装が間違っている」3点を見抜いてもらった。同じ厳しさで grep やテスト実行を活用してほしい
2. **新規導入箇所の堅牢性**：normalizeYomi, getYomiInitialRow, applyYomiInputsToMaster, _phaseA2State などの新規機構に重大な穴がないか
3. **既存資産の保護**：A-1 で構築した111アサーション + 既存50テスト = 161件すべて緑のまま動くか
4. **ChatGPT の 25完了条件 + 12禁止事項**：これらが実装に反映されているか網羅確認
5. **データモデル後方互換性**：A-1 マスタ（yomi 空が大半）を A-2 が壊さない

---

## 6. レビュー所要時間の目安

- ★★★ Stage 2〜6（観点 A〜E）：60〜90分相当
- ★★ 新規導入箇所（観点 F〜I）：30〜45分相当
- ★ 補助観点（観点 J〜L）：15〜30分相当
- 全観点：120〜180分相当

時間制約があれば ★★★ のみで構わない。

---

## 7. レビュー後のフロー（v1.2 Slim 6.2 節準拠）

```
本実装レビュー（Codex）
  → Claude.ai が反映方針を判断
  → 髙橋さん最終確認
  → 判定別の次ステップ
```

| 判定 | 次ステップ |
|---|---|
| **OK** | feat ブランチを main にマージ → 実機スマホ確認 → A-3 検討 |
| **Minor** | A-3 バックログに記録、main マージへ進む |
| **Must Fix（実装修正）** | feat ブランチで修正コミット → Codex 再々レビュー |
| **Must Fix（仕様修正）** | 仕様書 v6.1 → ChatGPT 設計再々レビュー → 実装やり直し |
| **Critical** | 即停止、root cause 分析後に方針再検討 |

---

## 8. 安全のためのお願い

- レビュー作業中、**実装コードの修正は行わないでください**（レビューのみ、修正は Claude Code 担当）
- ローカル shogi リポジトリで作業する場合、`feat/phase-a2-yomi` 以外への push は不要
- main へのマージは行わないでください（Kazuoさん の判断後に Claude Code が実施）
- v1.2 Slim 4.4 節の「越境禁止」原則：他プロジェクト（shogi-coach / golf-compe / bp-matching / x-support / file-organizer）への干渉は不可

---

**END OF REQUEST**
