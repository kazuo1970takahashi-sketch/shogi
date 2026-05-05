# Codex 実装レビュー結果（v6.5 実装、PR #4）— shogi_v4 Phase A-2.5

**レビュー実施日**: 2026-05-05
**レビュー対象**:
- リポジトリ: kazuo1970takahashi-sketch/shogi
- PR: https://github.com/kazuo1970takahashi-sketch/shogi/pull/4
- ブランチ: feat/phase-a25-terminology
- リモート先端: d92f1a3（Codex 依頼文追加コミット込み）
- レビュー対象実装最新 commit: 02d9176（Stage 7 index.html UI 文言の JSON 撤廃）
- 仕様書: docs/specs/20260505_1006_shogi_design_phaseA25_v6_5.md
- 依頼文: docs/reviews/20260505_1045_shogi_codex_implementation_review_request_phaseA25_v6_5.md

**レビュー種別**: 実装レビュー（v1.2 Slim 6.2 節 フルサイクル 4周目）
**判定**: **A- / Go / main マージ Yes**
**Must Fix**: なし
**Minor**: 1件（観点 J、docs の trailing whitespace）

---

## 0. 総合判定

**判定**: **A- / Go**
**等級**: A-2 と同等、初回 Pass
**main マージ判断**: **Yes（マージしてよい）**
**Minor 1件**: マージ阻止ではない、整えるなら今が楽

---

## 1. 実機確認結果

```bash
bash test/run_tests.sh shogi_v4.html
```

- 既存テスト: PASS=50, FAIL=0, WARN=0
- 支部マスタ機能テスト: **PASS 277件 / FAIL 0件**
- 合計相当: **327件 / FAIL 0**

実装コードへの修正は実施せず（レビューのみ）。

---

## 2. 必須観点（A〜E）の判定

### A. 構造矛盾解消

**判定**: **OK**

確認内容：
- 保存ボタンは「大会データをコピー」、マイグレは `mig-paste-area` 貼り付け方式
- 保存→貼り付け統合の動線は一貫
- 旧 `mig-files` / `parseTournamentJsonFiles` 参照は残っていない

### B. parseTournamentTextInput()

**判定**: **OK**

確認内容：
- CRLF/LF/CR、BOM、先頭/末尾/連続空行、空文字、全件失敗、一部成功を返り値 `{tournaments, errors}` で扱える
- 原則 throw しない設計が守られている

### C. 既存ロジック非破壊

**判定**: **OK**

確認内容：
- `mergeTournamentParticipantsIntoMaster()` は統合ロジック変更なし
- `saveData()` のクリップボード優先 + ファイル fallback も維持
- 既存読み込み `load-paste-area` も残っている

### D. UI 文言の「JSON」撤廃

**判定**: **OK**

確認内容：
- index.html は JSON/json ゼロ
- shogi_v4.html のユーザー表示文言からも実質撤廃済み
- 残りは JSON.parse/stringify、変数名、コメント、.json 拡張子など内部・技術文脈のみ

### E. 旧コード削除

**判定**: **OK**

確認内容：
- `parseTournamentJsonFiles` と `mig-files` は grep で参照なし
- マイグレ UI は貼り付け方式に置換されている

---

## 3. 重要観点（F〜I）の判定

### F. ChatGPT Minor 5件

**判定**: **OK**

| Minor | 反映確認 |
|---|---|
| M1: throw/return 仕様統一 | parser で反映 |
| M2: 境界値テスト | 21件のテストで反映 |
| M3: 既存ファイル保有者向け案内 | モーダル補足文で反映 |
| M4: UI/内部分離 | 守られている |
| M5: 「読み込み」と「マスタ統合」の違い | モーダル補足文で反映 |

### G. テスト実効性

**判定**: **OK**

- 新規21件は境界値を直接突いていて有効
- 特に一部成功・全件失敗・改行差異は false-positive になりにくい構造

### H. 既存テスト保護判断

**判定**: **OK**

- 既存の「過去大会の統合」substring テストを壊さず、ヘッダーを「過去大会の統合（支部マスタへ）」に調整した判断は妥当
- M5 の意図はサブテキストで担保されている

### I. e2e 整合

**判定**: **OK**

- `#saveBtn` の正規表現は新文言に追従
- ※ Playwright 自体は今回実行していない、コード整合は確認済み

---

## 4. 補助観点（J〜L）の判定

### J. コード品質

**判定**: **OK / Minor**

**指摘内容**：
- build/bind/coordinator の分離は維持
- `parseTournamentTextInput()` は副作用なし
- **軽微な点として `git diff --check` で docs の trailing whitespace が出ている**
- 実装品質や main マージ判断には影響しないが、整えるなら今が楽

**評価**：
- マージ阻止ではない（Codex 自身が明記）
- A-2.5 で同梱修正することにした（運営試験前の整理として）

### K. パフォーマンス

**判定**: **OK**

想定規模では問題なし。巨大テキストでも単純 split + JSON.parse で、運用上の懸念は小さい。

### L. ブラウザ互換性

**判定**: **OK**

単一HTML/localStorage 構成維持。新規コードも既存と同程度の互換性。

---

## 5. Minor 1件の対応

| # | 指摘 | 対応 | 理由 |
|---|---|---|---|
| J-1 | docs の trailing whitespace | **A-2.5 で同梱修正** | Codex 推奨「整えるなら今が楽」、main マージ前に整理 |

修正方針：
- `git diff --check` で対象を特定
- `sed -i '' 's/[[:space:]]*$//'` で一括除去
- 修正コミット追加 → main マージ実施

---

## 6. main マージ判断

**Yes: main にマージしてよい。**

A-2 と同等の初回 Pass、Must Fix なし。

任意の事前整備として、docs の trailing whitespace だけ軽く消す程度で十分。

---

## 7. A-2 v6 実装レビューとの比較

| 項目 | A-2 v6 実装 | A-2.5 v6.5 実装 |
|---|---|---|
| 等級 | A- | **A-** |
| Must Fix | なし | **なし** |
| Minor | 1件（マスタタブ文言）| **1件（trailing whitespace）**|
| main マージ | Yes | **Yes** |
| 初回 Pass | ○ | **○** |

A-2.5 は **既存機能の修正・置換** が主体であり、新規機能リスクが小さい。
A-2 と同等のクリーンな実装サイクル。

---

**END OF REVIEW**
