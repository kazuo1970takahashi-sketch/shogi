# Codex 実装レビュー依頼 — shogi_v4 Phase A-1

**依頼日時**: 2026-05-05 01:41 JST
**依頼者**: 髙橋一雄
**対象プロジェクト**: shogi_v4（沼津支部 月例将棋大会 運営ツール）
**対象 PR**: https://github.com/kazuo1970takahashi-sketch/shogi/pull/1
**対象ブランチ**: `feat/phase-a1-branch-master`（commit `9cdfc9c`、main から +8 commits / +1087 行）
**レビュー種別**: **実装レビュー**（実装コードの検証、動作テストを含む）
**根拠**: DevSecOps v1.2 Slim 6.2節「AI 実装（Claude Code）→ **AI レビュー（Codex）** → AI 反映指示（Claude.ai）→ Kazuoさん 方針判断」

---

## 0. 用語に関する注記（v1.2 Slim 5.3節準拠）

| エージェント | 役割 | 動作環境 |
|---|---|---|
| Claude.ai | 設計／調査／依頼文 | チャット内テキストのみ |
| Claude Code | 実装／Git | ローカル Mac の指定ディレクトリ |
| **Codex（本依頼の実施主体）** | **独立レビュー（実装コード検証）** | **プロジェクト別の作業ディレクトリ（`~/AI_Projects/<番号>_<名前>/`）** |
| ChatGPT | 設計メタレビュー（GitHub 連携） | チャット内テキスト + GitHub 連携 |

ChatGPT が **設計レビュー（v4 を A-/Go 判定）** を完了済み。本依頼はその**実装版**で、Codex に **ローカルでコードを動かして検証** していただきます。

---

## 1. 依頼の背景

### 1.1 これまでの経緯

| 時系列 | フェーズ | 担当 | 結果 |
|---|---|---|---|
| 2026-05-04〜05 | 設計 v1〜v3 | Claude.ai | v3 完成 |
| 2026-05-05 | 設計メタレビュー（v3） | ChatGPT | **B+ / Conditional Go**（Must Fix 3点 + Minor 11件） |
| 2026-05-05 | 設計反映 v4 | Claude.ai | 全件反映済み |
| 2026-05-05 | 設計再レビュー（v4） | ChatGPT | **A- / Go**（実装着手 OK） |
| 2026-05-05 | **Phase A-1 実装** | Claude Code | **完了、PR #1**（本依頼の対象） |
| **本依頼** | **実装レビュー** | **Codex** | **判定待ち** |

### 1.2 実装の概要

shogi_v4.html に Phase A-1 の支部マスタ機能を追加：

- **F1**: 支部マスタのデータ層（`shogi_branch_master` localStorage キー、normalizeBranchMaster 含む）
- **F2**: 大会JSONバックアップ保存時のマスタ自動同期（二重加算防止）
- **F3**: ワンクリック呼び出しUI
- **F5a**: 検索フィルタ（漢字部分一致）
- **F9**: マイグレーションウィザード
- **F10**: 利用目的の最小表示
- **F11**: 最小マスタタブ

### 1.3 実装規模

```
shogi_v4.html              | +643 / -2  （F1〜F11 + 既存3関数の最小修正 + タブ統合）
test/test_branch_master.js | +428      （新規、75 アサーション）
test/run_tests.sh          |  +16      （新規テスト呼び出し）
合計                        | +1087 / -2
```

9段階のコミット粒度で段階的に実装。各段階で既存テスト緑を確認済み。

---

## 2. レビュー対象

### 2.1 GitHub 参照

GitHub リポジトリ `kazuo1970takahashi-sketch/shogi`：

| 参照対象 | パス・URL |
|---|---|
| **PR**（推奨レビューUI）| https://github.com/kazuo1970takahashi-sketch/shogi/pull/1 |
| 対象ブランチ | `feat/phase-a1-branch-master` |
| 対象コミット範囲 | `main` → `9cdfc9c`（8 commits） |
| 仕様書（実装の根拠）| `docs/specs/20260504_2341_shogi_design_phaseA_reception_v4.md` |
| 設計レビュー履歴 | `docs/reviews/20260505_0030_chatgpt_review_response_v3.md` |
| 既存設計思想 | `HANDOFF.md`（リポジトリ直下、将棋版）|

### 2.2 ローカル実行を推奨

Codex の強みは **実際にコードを動かしてレビュー** できることです。以下を推奨：

```bash
# リポジトリをクローン or 既存クローンを更新
cd ~/AI_Projects/<your_dir>/
git clone https://github.com/kazuo1970takahashi-sketch/shogi.git
cd shogi
git fetch origin
git checkout feat/phase-a1-branch-master

# 既存テスト + 新規テストの実行
bash test/run_tests.sh shogi_v4.html

# 新規テストのみ
node test/test_branch_master.js shogi_v4.html
```

期待される結果：
- 既存テスト: PASS=50, FAIL=0, WARN=0
- 新規テスト: PASS 75件 / FAIL 0件

実際に動かしての確認をお願いします。

---

## 3. レビュー観点（優先度順）

### ★★★ 必ず判定してほしいもの

#### A. 実装が仕様書 v4 と整合しているか（実コードの検証）

仕様書 v4 の各機能について、実装が仕様通りか **実コードを読んで** 検証してください。

##### A-1. F1 データ層（仕様書 3.1, 3.5）
- `shogi_branch_master` の構造（schema_version, members, ...）が仕様書 3.1 通りか
- `normalizeBranchMaster(raw)` が仕様書 3.5 の補正パターン全てを実装しているか
  - schema_version 不在/未知/不正値
  - members 配列補正
  - 各 member フィールドの補正（id 重複除外、name 空除外、yomi 空文字、last_class 不正→null、日付不正補正、tournament_ids 重複除去 等）
  - attendance_count = tournament_ids.length 再計算
  - updated_at 補完

##### A-2. F2 マスタ同期（仕様書 3.4）
- マスタ同期タイミングが `saveData()` 時のみか（save / resetAll / 編集時に呼ばれていないか）
- `addTournamentIdOnce` が二重加算を確実に防いでいるか
- `findMemberCandidates` の動作が仕様書 3.4.4「漢字一致中心」通りか
- 同名複数候補時にユーザ確認ダイアログが出るか

##### A-3. F11 最小マスタタブ（仕様書 4.2.1）
- 表示要素：登録人数、マイグレ起動ボタン、簡易一覧、利用目的（4項目）
- A-1 で含めない要素：編集／削除／検索フィルタ／ふりがな関連／エクスポート（含まれていないか）

##### A-4. F9 マイグレーション（仕様書 4.4）
- 過去JSONを複数選択できるか
- 同名候補が複数の場合に自動統合しないか（仕様書 7.5）
- マイグレーション結果サマリ（追加 N / 統合 N / スキップ N）が表示されるか

#### B. ChatGPT 実装時注意 5点が **コードレベルで** 強制されているか

ChatGPT が再レビューで明示した5点が、実装で確実に守られているか検証してください。

| # | 注意 | 確認方法（Codex 視点）|
|---|---|---|
| 1 | `generateMemberId` は `crypto.randomUUID().replace(/-/g, '').slice(0, 12)` | コードで replace が slice より前か。固定 UUID で実行して `m_1234567890ab` になるか実機テスト |
| 2 | normalizeBranchMaster 空返却時に既存 localStorage を上書きしない | loadBranchMaster の catch 節で saveBranchMaster() を呼ばないか。テスト実行 → 破損データの localStorage が保持されるか |
| 3 | A-1 のマスタ同期は saveData() 時のみ | shogi_v4.html を grep して `syncBranchMasterOnSave` または `updateBranchMasterFromTournament` の呼び出し箇所が saveData 内のみか |
| 4 | normalizeState で player.member_id を保持 | 既存 normalizeState の player 正規化処理に member_id 保持コードがあるか。member_id ありの JSON で保持、なしの JSON で undefined になるか実行確認 |
| 5 | resetAll() で shogi_branch_master を消さない | resetAll 関数内で `removeItem('shogi_branch_master')` が含まれていないか。確認文言が更新されているか |

#### C. 既存大会運営が壊れていないか（HANDOFF.md 整合）

これが最重要観点の一つ。`shogi_v4.html` への +643 行追加が、既存の build/bind/coordinator パターンや既存 state 管理を壊していないか。

- 既存 50 テスト全件緑か（実機で確認）
- 既存 `renderRegList()` に支部マスタ処理が詰め込まれていないか
- 既存タブ（reg/tournament/result）の挙動が変わっていないか
- 既存 JSON 読込で落ちないか
- マスタなしで起動しても従来通り動くか
- 既存 normalizeState の player ハッシュ計算（テスト基準）が破壊されていないか

### ★★ 重要だが穴があれば気付きたいもの

#### D. テスト品質と網羅性

新規 75 アサーションの test/test_branch_master.js について：

- 各テストケースが本当に意図通りの検証になっているか（false-positive がないか）
- 仕様書 7.1〜7.6 のテスト要件をどの程度カバーしているか
- カバーされていないエッジケースがあるか
  - 例: localStorage QuotaExceededError 時の挙動
  - 例: crypto.randomUUID 不在環境（古い iOS 等）
  - 例: 同時に複数タブで開いた時の race condition
  - 例: マイグレーション中にエラーが起きた時の中間状態

#### E. パフォーマンスとスケール

仕様書では「5年運用で 100〜300名規模」を想定。

- マスタ 1000名規模で `findMemberCandidates`、`renderPastParticipantsPanel` が遅延しないか
- マイグレーションで 100JSON 一括統合した時の挙動
- `normalizePersonName` が頻繁に呼ばれるが計算量問題ないか
- 過去参加者パネルのスクロール（max-height:280px）でメモリ問題がないか

#### F. 実装の堅牢性

- 例外時のフォールバック設計（saveBranchMaster の例外時に大会JSON保存は継続するか）
- JSON.parse エラー時のメッセージが分かりやすいか
- ユーザ操作の取り消し可能性（マイグレーション後に取り消せるか）
- 確認ダイアログの文言の妥当性（仕様書 §3.3 の修正版が反映されているか）

### ★ 余裕があれば

#### G. コード品質

- 関数命名・配置が build/bind/coordinator パターンに沿っているか
- コメントの妥当性（特に「§3.1.X」参照コメントの正確性）
- 重複ロジックの有無
- DRY 原則からの逸脱

#### H. ブラウザ互換性

shogi_v4.html は GitHub Pages + スマホ運用の単一HTML。

- iOS Safari（旧バージョン含む）で動くか
- Android Chrome で動くか
- crypto.randomUUID のフォールバック要否

---

## 4. 期待するアウトプット

### 4.1 形式

各観点 A〜H について判定とコメント。**A〜C（★★★）は必須**。

### 4.2 判定の解像度

| 解像度 | 意味 | 後続アクション |
|---|---|---|
| **OK** | そのまま main にマージしてよい | main マージへ |
| **Minor** | 軽微な改善提案あり（A-2 で対応可）| バックログ化 |
| **Must Fix（実装修正）**| マージ前に修正が必要 | feat ブランチで修正コミット → 再レビュー |
| **Must Fix（仕様修正）**| 仕様書の不備が露呈 | 仕様書 v5 + 実装やり直し |
| **Critical**| 既存運営を壊している、データ消失リスクなど | 即停止、main マージ禁止 |

### 4.3 等級判定

ChatGPT 設計レビューの最終等級は **A-**（仕様書 v4）。
実装が仕様を **越えて優れている / 等しい / 落ちている** のどれか、等級判定（A+/A/A-/B+/B/...）を付けてください。

---

## 5. 特に避けたい落とし穴

実装レビューでよくある見逃しパターンを共有します：

1. **テストが緑 = 正しい、と早合点**：テストの欠落・誤りで「緑だが間違っている」可能性
2. **ChatGPT 実装時注意 5点を文字列検索だけで OK 判定**：実際の動作確認が必要
3. **A-1 スコープ外の機能（A-2 機能）が紛れ込んでいないか見逃す**：YAGNI 違反
4. **既存 3 関数の修正が「最小」のつもりで意図せず広範**：差分の精査
5. **マイグレーション時のデータ破損リスク**：途中失敗時のロールバック設計
6. **二重加算防止が「ちゃんと動くつもり」だが実機で動かない**：実行確認

---

## 6. 任意質問（判定とは別に意見が欲しい）

1. **`crypto.randomUUID` のフォールバック**：実装にはフォールバックがありません。古いブラウザを切り捨てる判断は妥当ですか？
2. **マイグレーション時の同名複数候補処理**：A-1 では「自動統合せず新規作成」（仕様書 7.5）にしました。これで実運用上の事故は防げますか？
3. **マスタ同期タイミング**：A-1 では `saveData()`（JSONバックアップ保存）時のみ。「保存し忘れ」リスクと「多重更新」リスクのトレードオフで妥当ですか？
4. **75 アサーション**：実装規模に対して過不足ありますか？

---

## 7. レビュー所要時間の目安

- ★★★ のみ（コード読み + テスト実行 + 実装時注意5点検証）：60-90分相当
- 全観点（パフォーマンス・互換性検証含む）：120-180分相当

時間制約があれば ★★★ のみで構わない。

---

## 8. レビュー後のフロー（v1.2 Slim 6.2 節準拠）

```
本実装レビュー（Codex）
  → Claude.ai が反映方針を判断
  → 髙橋さん最終確認
  → 判定別の次ステップ
```

| 判定 | 次ステップ |
|---|---|
| **OK / Minor** | feat ブランチを main にマージ → 実機スマホ確認 → 次回月例大会で運用試験 |
| **Must Fix（実装修正）** | feat ブランチで修正コミット → Codex 再レビュー |
| **Must Fix（仕様修正）** | 仕様書 v5 → ChatGPT 設計再々レビュー → 実装やり直し |
| **Critical** | 即停止、root cause 分析後に方針再検討 |

---

## 9. 安全のためのお願い

- レビュー作業中、**実装コードの修正は行わないでください**（レビュー結果を Claude.ai に渡し、Claude Code が修正する分業）
- ローカル shogi リポジトリで作業する場合、`feat/phase-a1-branch-master` 以外への push は不要です
- main へのマージは行わないでください（Kazuoさん の判断後に Claude Code が実施）
- v1.2 Slim 4.4節の「越境禁止」原則：他プロジェクト（shogi-coach / golf-compe / bp-matching / x-support / file-organizer）への干渉は不可

---

**END OF REQUEST**
