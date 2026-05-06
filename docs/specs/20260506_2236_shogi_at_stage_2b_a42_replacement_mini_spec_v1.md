# shogi A-T Stage 2b Mini 仕様書: A-4.2 関連 e2e factory 置換

**作成日時**: 2026-05-06 22:36 JST
**文書種別**: Mini 仕様書(目標 150〜200 行)
**親仕様**: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md` (v1.5)
**親レポート**: `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
**実装担当**: Claude Code
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**main HEAD 前提**: 1775c98

---

## 0. 背景と目的

A-4.2(commit 73961d3)で発生した重大リグレッション「A/B クラスボタンが実機で動作しないが、e2e 124 件・単体 595 件は全 pass」を構造的に防止する。

Stage 1 完了レポートで主因「観点 2(クリック前検証不在)」が e2e 130/130 click = 100% 該当と判明。Stage 2a で 3 つの中核 factory(`participantAdded` / `classSelectedFromPast` / `classSelectedFromSuggest`)+ helpers(`expectClickable` / `clickAndExpectChange`)が完成。Stage 2b ではこれを A-4.2 spec の主要部分に適用する。

---

## 1. スコープ

### IN(対象、22 it)

`test/e2e/shogi_app_a4_2.spec.js` 内の以下 2 describe:

- **Stage 2: 過去参加者パネル A/B ボタン**(L29–L160、13 it)主担当 factory: `classSelectedFromPast(cls)`
- **Stage 3: サジェストリスト A/B ボタン**(L162–L282、9 it)主担当 factory: `classSelectedFromSuggest(cls, expectedMemberId)`

### OUT(対象外、Stage 2c 以降に申し送り)

- **Stage 4: last_class 強調表示**(L284–L413、11 it)— 特に L371–L393 は §10.5 パターン(`syncBranchMasterOnSave` 直接呼出)で独立検討対象
- **Stage 5: 横スクロール検出 / 長い氏名**(L415 以降、12 it)— viewport assertion 主体で観点 2 該当度が低い

OUT 分の根拠:
- A-4.2 リグレッション主因は「クラス選択クリック前の到達性検証不在」。Stage 2/3 describe の 22 it でこの構造的欠陥を一掃すれば主目的達成。
- Stage 4/5 は性質が異なる(同期 master 更新 / viewport 計測)ため、別フェーズで適切な factory 設計を検討する方が責務が明確。

---

## 2. 完全書き直し対象(IN 内 1 件)

**L138–L143「追加成功で showMsg『[氏名](Xクラス)を登録しました』」**:

現状は `showMsg` テキストのみ確認しており、primary assertion が不在(Stage 1 §4.2 の「showMsg のみ」分類)。`participantAdded('B')` factory を併用し、`state.players.B` に対象が増加することを primary assertion として追加する。

その他 21 it は factory 直接ラップで対応可能。

---

## 3. 制約(Stage 2a より継承)

- **production code(`shogi_v4.html`)変更禁止**
- **raw click ゼロ / force:true ゼロ**(grep 検証可能)
- **変更前後の it 数同一**(22 件)、既存 describe / it 名は原則変更しない(grep 互換性のため)
- factory 不足が判明した場合は `test/helpers/` への追加のみ可。production 側修正は不可。

---

## 4. 受け入れ条件(Codex Gate Review 5 観点に対応)

| 観点 | 検証方法 |
|---|---|
| P0(対象 22 it 全 pass) | `npx playwright test test/e2e/shogi_app_a4_2.spec.js -g "Stage 2\|Stage 3"` |
| 既存挙動破壊なし | 全 e2e 緑維持(438 件以降、Stage 2a で確立した母数) |
| 構造的防止達成 | 対象 22 it 範囲で `\.click\(` 出現 0(`expectClickable` 内部除く)、`force:\s*true` 出現 0 |
| 保存読込影響なし | A-4.2 spec は localStorage 系を呼ばないため自明、Codex 確認のみ |
| データ破壊なし | A-4.2 spec は `loadFromPaste` / `resetAll` / `runMasterImport` を呼ばないため自明、Codex 確認のみ |

---

## 5. 実装方針

- **一括置換**(22 it のスコープなら 1 PR で十分、段階置換不要)
- **ブランチ名**: `feat/at-stage-2b-a42-factory-replacement`
- **PR ベース**: main HEAD `1775c98`
- **コミット粒度**: 論理単位で 2〜4 コミット推奨(Stage 2 describe / Stage 3 describe / showMsg 件書き直し / 最終 grep 検証 commit)

---

## 6. レビュー手順

1. **実装** → Claude Code(本ブランチ)
2. **ChatGPT レビュー: スキップ**(Gate Review 運用、memory #22 改訂2 準拠)
3. **Codex Gate Review**: 上記 §4 の 5 観点のみ、Codex に直接依頼
4. Codex A 判定 → 髙橋さんが PR レビュー → squash merge

---

## 7. Stage 2c 以降への申し送り

- **L371–L393(syncBranchMasterOnSave 直接呼出)**: Stage 2a 仕様書 v1.5 §10.5 で言及された「非同期 + DOM mutation」パターンの典型例。独立フェーズで `evaluate(() => window.fn())` 呼出を UI 経由フローに置き換えるか、専用 factory を新設するか検討。
- **Stage 5 width ループ系**(12 it): `expectClickable` 段階 5(タップ拡大検証)で代替可能か、もしくは viewport 専用 helper を新設するか別途評価。

---

## 8. リスクと予防

- **リスク R1**: factory ラップ時の引数誤り(`classSelectedFromPast('A')` を `'B'` で呼ぶ等)。
  - 予防: factory 内 primary assertion が `state.players[cls]` の増加を必須化しているため、引数誤りは即座に test 失敗で検出される(Stage 2a 仕様書 v1.5 §3 設計)。
- **リスク R2**: Stage 2 / Stage 3 describe で beforeEach の master 投入順序が変わって依存先 it が落ちる。
  - 予防: beforeEach 自体は変更せず、it 本体内のクリック操作のみを置換する。

---

## 9. 想定行数・工数(参考)

- 置換対象: 22 it
- 想定 diff: `test/e2e/shogi_app_a4_2.spec.js` のみ、+150 / -100 行程度
- 想定実装時間: Claude Code で 30〜60 分(factory が完成しているため)
- 想定 Codex Gate Review: 1 ラウンド A 判定の見込み(IN スコープが構造的にシンプル)

---

**END**
