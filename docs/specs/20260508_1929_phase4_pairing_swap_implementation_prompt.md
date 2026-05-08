# Hotfix Phase 4 実装プロンプト

- 作成日: 2026-05-08(木)
- spec 参照: `docs/specs/20260508_1907_phase4_pairing_swap_spec.md`(v2、commit `1bc99df`、ChatGPT A 判定済)
- 対象: `shogi_v4.html` のみ
- 想定実装規模: production +50〜100 行 / e2e +5〜10 件
- マージ目標: 5/9 夕方(本番直前)
- 三エージェント: Claude.ai 設計 → ChatGPT v1/v2 レビュー A → Claude Code 実装 → Codex Quick Gate → マージ

---

## 1. タスク概要

「対戦相手の変更」UI を 1 名置換 replace から 2 ペア間 swap に拡張。winner 入力済みペアの巻き込みは prerequisite で禁止。

## 2. 進め方(必須遵守)

1. **Plan Mode 必須(Shift+Tab×2)**
2. Plan ファイル出力先: `docs/specs/<TS>_phase4_pairing_swap_plan.md`
   - TS は `TZ=Asia/Tokyo date +%Y%m%d_%H%M`
3. Plan 承認(髙橋さん)後に実装着手
4. 実装後: e2e + 単体テスト全件 green 確認
5. PR 作成 + Codex review request prompt 配置
6. **マージは別プロンプト**(本プロンプトの範囲外、Codex Gate 通過後に Claude.ai が別途指示)

## 3. Plan Mode で確認すべき事項(必須、ChatGPT 軽微注意 + spec §10)

### 確認 #1: pairHasRematch の探索対象範囲
- 過去ラウンドのみか、現在ラウンド暫定 pairings/results も含むか
- 現在ラウンドを含む場合: `currentRound` 除外引数追加 or 内部分岐のどちらで対応するかを Plan に明記
- 関数の実装箇所(行番号)と探索ロジックを引用

### 確認 #2: winner 入力済み判定のフィールド名・値
- `state.results[cls][round][i]` の winner フィールド名と未入力時の値
- 入力済み判定式(例: `state.results[cls][round][i].winner != null` 等)を Plan に確定記載

### 確認 #3: getDuplicatePlayersInPairings の入力形式
- 関数のシグネチャと期待入力(配列構造)
- swap 後ペア配列の構造が引数形式に適合するか
- 不適合なら変換ロジックを Plan に明記

### 確認 #4: chg-save クリックハンドラの所在
- L 番号 + 関数名 + 現在の重複検出ロジック箇所

### 確認 #5: state.results / state.players のクラス別/ラウンド別構造
- swap 確定後の更新対象(spec §4.4)を明確化

## 4. 実装方針(spec §10 踏襲)

1. 上記 #1〜#5 の確認結果を Plan に記載 → 髙橋さん承認
2. 変更先選手 X の所属ペア検索ヘルパ実装: `findPairContainingPlayer(cls, round, playerId)` 等
3. prerequisite チェック実装(spec §4.5、5 項目)
   - 対象ペア winner 入力済み拒否(モーダル開く前)
   - swap 相手ペア winner 入力済み拒否(保存時)
   - 同ペア内 swap 拒否(保存時防御)
   - swap 後 getDuplicatePlayersInPairings 防御層
   - pairHasRematch を過去ラウンドのみに限定
4. `chg-save` クリックハンドラを 2 分岐(replace / swap)に拡張
5. swap 分岐: 再戦チェック(両ペア)+ 確認ダイアログ + 2 ペア同時更新
6. localStorage 自動保存 + `renderTournament` 再描画

## 5. e2e 戦略(spec §7、合計 8 ケース)

新規追加 e2e ケース:

1. **swap 成功**: A-B / C-D の B を C に変更 → A-C / B-D に更新確認
2. **swap で再戦衝突**: 過去ラウンドで A-C 対戦済 → swap 試行でエラー表示
3. **replace 成功**(従来動作): 削除済選手の代替で空席を埋める → 1 ペアのみ更新
4. **swap 確認ダイアログキャンセル**: 状態変化なし
5. **swap で過去結果に影響なし**: 過去ラウンド対局済みペアは変更されない
6. **winner 入力済みペアで変更ボタン**: モーダル開かず、エラー表示
7. **swap 相手ペアが winner 入力済み**: swap 拒否、エラー表示
8. **swap 後の同ラウンド重複なし**: `getDuplicatePlayersInPairings` で 0 件確認

既存 e2e 702 件は全件 green 維持(replace 動作は従来通り)。

## 6. PR 作成

### PR タイトル
`feat(phase4): pairing change UI from replace to swap (Hotfix)`

### PR description テンプレート
```
## 概要
Hotfix Phase 4: 「対戦相手の変更」UI を 1 名置換 replace から 2 ペア間 swap に拡張。

## spec
docs/specs/20260508_1907_phase4_pairing_swap_spec.md (v2, commit 1bc99df, ChatGPT A 判定済)

## 実装サマリ
- §4.5 prerequisite チェック 5 項目実装
- 系統 A (replace) / 系統 B (swap) の自動分岐
- 既存 helper(pairHasRematch / getDuplicatePlayersInPairings)再利用
- production 変更行数: +XX 行 (実数)
- 新規 helper 追加: findPairContainingPlayer

## e2e 結果
- 既存 702 件: 全件 green 維持
- 新規 8 件: 全件 green
- 合計: 710 件

## 動作確認手順(マージ後)
1. iPhone 実機で本番 URL → 対局管理タブ
2. swap: 別ペアの選手を選択 → 確認ダイアログ → 2 ペア更新確認
3. replace: 削除選手の代替を選択 → 1 ペア更新確認
4. winner 拒否: 結果入力済みペアで「変更」ボタン押下 → モーダル開かずエラー

## ロールバック手順
git revert <squash commit> → push → 旧動作(repair で代替)
```

## 7. Codex review request prompt 配置

配置先: `docs/specs/<TS>_phase4_codex_review_prompt.md`

### Codex プロンプト内容
```
GitHub の kazuo1970takahashi-sketch/shogi リポジトリの PR #XX を Quick Gate Review してください。

【背景】
5/10(日)月例将棋大会の本番直前 Hotfix。
ペアリングの「変更」ボタンが事実上機能しない問題に対し、
1 名置換 replace から 2 ペア間 swap に動作仕様変更を実装しました。

【参照 spec】
docs/specs/20260508_1907_phase4_pairing_swap_spec.md (v2, commit 1bc99df, ChatGPT A 判定済)

【レビュー観点】
1. spec §4.5 prerequisite チェック 5 項目すべて実装されているか
2. spec §4.2 系統 A/B の分岐ロジックが正しく実装されているか
3. pairHasRematch の探索対象が過去ラウンドのみに限定されているか(現在ラウンド暫定状態を除外)
4. swap 後の getDuplicatePlayersInPairings 防御層が機能しているか
5. winner 入力済みペアの巻き込みが防がれているか
6. e2e 8 ケースのカバレッジが spec §7 通りか
7. 既存 702 件 e2e が全件 green を維持しているか
8. spec §8 範囲外項目に手を出していないか(自動ペアリング本体 / UI 全面刷新 / クラス間 swap 等)

【判定】
- A: マージ可
- A-: 微修正後マージ可
- B: 構造的修正必要

判定理由 + Must Fix / Should Fix / Nice-to-Have を分けて記載してください。
```

## 8. ファイル命名規則(JST)

- Plan: `docs/specs/<TS>_phase4_pairing_swap_plan.md`
- Codex prompt: `docs/specs/<TS>_phase4_codex_review_prompt.md`
- TS は `TZ=Asia/Tokyo date +%Y%m%d_%H%M`

## 9. 範囲外(spec §8 厳守)

- 自動ペアリングロジック本体への変更 ✗
- UI 全面刷新 ✗
- クラス間 swap(A 級 ⇄ B 級) ✗
- 過去ラウンド swap ✗
- 3 ペア循環 swap ✗
- winner 入力済みペアの巻き込み swap ✗
- 対局済み結果 winner の修正 ✗

## 10. ロールバック手順(マージ後問題発覚時)

`git revert <hotfix4 squash commit>` → push → 本番に旧動作復帰。Plan B(「変更」ボタン一時無効化)に切替可能。

## 11. タイムライン

| 時点 | タスク | 担当 |
|---|---|---|
| 5/8 夜(本日) | 本プロンプト配置 + Plan Mode 開始 or 5/9 朝に持ち越し | Claude Code |
| 5/9 朝 | Plan Mode 出力 + 髙橋さん承認 | Claude Code → 髙橋さん |
| 5/9 午前〜午後 | 実装 + e2e 全件 green | Claude Code |
| 5/9 午後 | PR + Codex Quick Gate | Claude Code → Codex |
| 5/9 夕方 | Codex 判定確認 → マージ → 本番反映 → iPhone 実機 | Claude.ai 別プロンプト + Claude Code |
| 5/9 夜 | 過去データセット(本番準備) | 髙橋さん本番運用 |
| 5/10 朝 | 大会開始 | - |

## 12. 完了条件

- Plan ファイル配置(docs/specs/)
- Plan 髙橋さん承認
- 実装完了 + e2e 710 件全件 green
- PR 作成完了 + Codex review request prompt 配置
- 本プロンプトの範囲はここまで(マージは別プロンプト)
