# shogi A-4.4 過去参加者パネル UX 改善 + F7 簡素化 + bug fix #7 Codex Gate Review 依頼

**作成日時**: 2026-05-07 22:10 JST
**対象 PR**: feat(a-4-4): 過去参加者パネル UX 改善 + F7 簡素化 + bug fix #7
**ブランチ**: `feat/a-4-4-pp-panel-ux`(main `ba76473` 起点)
**仕様書**: `docs/specs/20260507_2145_shogi_a_4_4_pp_panel_ux_improvement_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge(髙橋さんの実機目視確認 OK 後)

---

## 1. 背景・目的

A-4.3 main マージ後の実機テストで以下が発覚:

1. **エントリー済 vs 未エントリーが視覚的に紛らわしい**(現クラス active 青/琥珀 + ✓ と前回参加クラス highlight 黄色 が同系統色で混乱)
2. **F7「未設定」radio が実運用で不要**(last_class が null になる業務シナリオなし)
3. **F7 保存後に過去参加者パネル再描画が呼ばれない bug**(髙橋さん指摘 #7)

解決方針: 過去参加者パネルを「**エントリー済 / 未エントリー 2 セクション分離**」に再設計し、視覚言語を「セクション位置」で表現する。これにより色強調(active / highlight)を撤廃して見た目を簡潔化。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+59 / -39 行)

| # | 機能 | 場所 | 行 |
|---|---|---|---|
| 1 | `buildPastParticipantsPanelHtml` を 2 セクション分離 + ボタン強調撤廃 | L1258 周辺 | +44 / -40 |
| 2 | `buildMasterEditModalHtml` から「未設定」radio (value="") 撤廃 | L1724 周辺 | -1 |
| 3 | `bindMasterEditModalEvents`: A/B 以外を未指定扱い(undefined) | L1923 | +1 / -1 |
| 4 | `applyMasterMemberEdit`: バリデーションから null 受理を撤廃、A/B のみ受理 | L846 | +1 / -1 |
| 5 | `bindMasterEditModalEvents` 保存後に `renderPastParticipantsPanel` 呼び出し追加 (bug fix #7) | L1948 | +5 |

### 2.2 設計判断

**(a) 行描画 helper を inline 関数化**

仕様書 §3.1 の「inline でも helper 関数化でも OK」に対し、`renderPpRow(fm)` を `buildPastParticipantsPanelHtml` 内で inline closure として定義。エントリー済 / 未エントリー両セクションで共通利用、セクション固有差分(「現在:Xクラス」テキスト)は `currentRegMap[fm.id]` 判定で吸収。

**(b) 「現在:Xクラス」テキストの位置と色**

エントリー済セクションの行に `pp-current-class` span を `pp-last-class` の手前に配置。色は青系 `#0d47a1`(セクションヘッダ色 `#1F3864` と統一感あり)。前回参加クラスの灰色 `#666` と区別。

**(c) F7 「未設定」radio 撤廃の semantic**

undefined(A/B どちらも未選択) = 「変更しない」、A or B = 上書き、null = 不正入力(invalid_last_class_value)。`applyMasterMemberEdit` の semantic を「**変更しないなら options に含めない**」に統一。これにより F7 で null へのリセット操作は不可能になる(syncBranchMasterOnSave で自動更新される運用前提)。

**(d) bug fix #7 の最小修正**

`bindMasterEditModalEvents` 保存成功後に `renderPastParticipantsPanel` を 1 行追加。`renderMasterTab()` の直後で呼ぶ(タブ切替時の二重呼び出しは問題なし、idempotent)。

### 2.3 e2e (`shogi_app_a4_4.spec.js` 新規 +150 行、a4_3 / a4_2 spec 修正)

- 新規 10 件(a4_4):
  * §2.1 セクション分離(ヘッダ件数 / 該当なし / 行移動 / 「現在:Xクラス」 + 色 / 強調撤廃 / 検索横断、計 7 件)
  * §2.6 bug fix #7(F7 保存後の即時反映、1 件)
  * §2.5 `applyMasterMemberEdit` 純粋関数(null → invalid / undefined → 既存維持、計 2 件)
- a4_3 spec 差分管理:
  * §2.1 現クラス強調 4 件削除
  * §2.5 #1 を A/B 2 択 fieldset に書き換え
  * §2.5 補強を「radio 2 つ + value="" 不在」に書き換え
  * §2.5 #2 を「A/B どちらも未 checked」に書き換え
  * §2.5 #4 「未設定 → null」を削除し「null 維持(A/B 未選択保存)」に置換
- a4_2 spec: 過去参加者パネルの highlight 系 2 件削除(撤廃済み機能のため。サジェスト側 highlight は §2.4 サジェスト UI 変更なしで維持)
- visual_regression: reg-pp-panel-1280 を 2 セクション構造に更新(他 snapshot は変化なし)

---

## 3. 受け入れ条件 検証結果(仕様書 §4 1〜9)

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 過去参加者パネルが「エントリー済 / 未エントリー」2 セクションに分離 | e2e a4_4 §2.1 セクションヘッダ | ✅ |
| 2 | セクションヘッダに件数表示「(N 名)」、件数 0 は「該当なし」 | e2e 「初期状態 0/3」「該当なし」 | ✅ |
| 3 | 検索・クイックフィルタが両セクション横断で機能 | e2e 「検索フィルタ両セクション横断」 | ✅ |
| 4 | エントリー済の行は「現在:Aクラス」or「現在:Bクラス」テキスト表示 | e2e A/B 両方の「現在:Xクラス」 | ✅ |
| 5 | ボタン色強調(現クラス active / 前回 highlight)が撤廃される | e2e 「pp-add-btn-active / -highlight 0 件」 | ✅ |
| 6 | F7 編集モーダルの前回クラス radio が A/B 2 択になる | e2e a4_3 「radio 2 つ DOM 存在」 | ✅ |
| 7 | F7 保存後、リロードなしで過去参加者パネルに反映(bug fix #7) | e2e a4_4 §2.6 即時反映 | ✅ |
| 8 | 既存 + 新規 e2e すべて緑(visual `--update-snapshots`) | `npx playwright test` | ✅ **517 passed** |
| 9 | 単体テスト緑 | `npm test` | ✅ **PASS=50, FAIL=0** |
| 10 | iPhone 実機目視確認 | 髙橋さん | (本レビュー後、merge 前必須) |
| 11 | Codex Gate Review A 判定 | 本レビュー | (本依頼) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `5114254` | docs(a-4-4): 仕様書 v1 配置 |
| 2 | `5cef98c` | feat(a-4-4): 過去参加者パネル 2 セクション分離 + ボタン色強調撤廃 |
| 3 | `99aa394` | feat(a-4-4): F7 編集モーダル last_class A/B 2 択化 |
| 4 | `756531c` | fix(a-4-4): F7 編集保存後に過去参加者パネル再描画(bug fix #7) |
| 5 | `413129e` | test(a-4-4): a4_3 spec 差分管理 + a4_4 spec 新規 + visual snapshot 更新 |

---

## 5. レビュー観点(必読)

### 5.1 通常観点

1. **§4 受け入れ条件 1〜9 の検証根拠が e2e で十分か**
2. **production diff の最小性**(機能変更分 +59 行は妥当か / 不要な追加はないか)
3. **2 セクション分離による既存 e2e のセマンティクス影響**(`#ppPanel .pp-row` セレクタが両セクション横断でマッチする副作用、件数カウント `.pp-check` の合計値整合性)
4. **A-4.3 e2e 削除の妥当性**(削除 4 件 / 書き換え 3 件 / 維持の判断は仕様 §3.6 と一致しているか)
5. **bug fix #7 の placement**(`renderMasterTab()` の直後に `renderPastParticipantsPanel` を呼ぶ順序が常に正しいか、タブ切替直後の race はないか)
6. **`applyMasterMemberEdit` の null 撤廃に伴う後方互換性**(A-4.3 が main にいた間に F7 で null 保存した member は存在しないが、F8 import で last_class:null member は依然として有効)

### 5.2 Devil's Advocate 質問(運用ルール「Devil's Advocate 常用化」、必須回答)

仕様書 §6 の 5 質問に対する **明示的回答** を必須とする:

1. **iOS Safari 固有の罠**:
   - セクションヘッダの件数表示が long 氏名 / 多人数で改行崩れしないか
   - 「現在:Aクラス」テキストが long 氏名(10〜15 文字)行で改行崩れしないか
   - 2 セクション間で `pp-row` の連続性が断たれた結果、`overflow-y:auto` のスクロール挙動に副作用は出ないか

2. **空セクション UI の扱い**:
   - フィルタ結果で **両セクション 0 件** のとき(例: 検索 "存在しない名前")、現状「両方とも該当なし」になるが UX として OK か
   - 「該当する参加者がいません」(filtered 全体 0 件メッセージ、L1254)と「該当なし」(セクション内 0 件)が両方出る整合性は妥当か

3. **F7 保存後の再描画ちらつき**:
   - `renderMasterTab()` → `renderPastParticipantsPanel()` の順序実行で、参加者登録タブが非表示の間に再描画が走る。タブ切替時に最新状態が確実に見えるか
   - `state` の取得タイミング race(saveBranchMaster → loadBranchMaster の間に F2 saveData が割り込むなど)の懸念

4. **エントリー済 → クラス変更時のセクション内リオーダー**:
   - 山田太郎(A)を B に変更 → エントリー済セクション内の位置(yomi 順)は維持されるか、移動するか
   - ユーザーから見て「自分が今操作した行がどこに行ったか」が直感的か

5. **A-4.3 e2e の差分管理**:
   - 削除 4 件(現クラス強調)/ 書き換え 4 件(F7 fieldset, radio 補強, last_class=null 初期選択, 未設定→null 保存)/ 維持(§2.2 ケース 1〜3, §2.4, §3.1)の判断が仕様 §3.6 と一致しているか
   - 削除した 4 件で担保していた assertion が a4_4 spec の新規 e2e で **同等以上** にカバーされているか

---

## 6. 想定される A 判定外要素(自己点検)

- **2 セクション内の helper 関数 `renderPpRow` の inline 化**: `buildPastParticipantsPanelHtml` 内 closure で定義、再利用は想定なし。可読性の観点では別関数化すべきか議論余地。
- **「現在:Xクラス」テキストの色**: `#0d47a1`(青)固定。A クラス / B クラスで色を分ける UI も検討余地あり(現状はセクション位置でクラス区別、色はアクセント用)。
- **Codex Devil's Advocate 質問 4(リオーダー)**: 現実装ではセクション切替時に renderRegList → renderPastParticipantsPanel が走り、A→B 変更の人は「未エントリー → エントリー済(B 行 yomi 位置)」に移動。同セクション内のクラス変更(B → A 等の direct change)はエントリー済セクション内で yomi 順を維持。

---

**END**
