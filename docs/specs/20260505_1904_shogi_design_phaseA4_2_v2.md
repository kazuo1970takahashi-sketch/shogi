# 沼津支部 月例将棋大会アプリ Phase A-4.2 設計仕様書 v2

**作成日時**: 2026-05-05 19:04 JST（v2: ChatGPT B+ Must Fix 2件 + Should Fix 6件 + Nice to Have 3件 反映）
**作成**: 髙橋一雄 × Claude（設計）
**前 Phase**: A-4（PR #8 mainマージ済み、Codex A-/Go）
**根拠仕様書**: A-4 仕様書 v2（`docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`）
**前バージョン**: v1（`docs/specs/20260505_1857_shogi_design_phaseA4_2_v1.md`）
**ChatGPT v1 メタレビュー**: B+ / Conditional Go
**レビュー予定**: ChatGPT 設計メタレビュー（v2 で再判定）→ Claude Code 実装 → Codex 実装レビュー

### 改訂履歴

| バージョン | 日時 | 変更点 |
|---|---|---|
| v1 | 2026-05-05 18:57 | 初版（4項目）|
| **v2** | **2026-05-05 19:04** | **ChatGPT B+ レビュー反映：Must Fix 2件 + Should Fix 6件 + Nice to Have 3件** |

---

## 0. 背景

A-4 を main にマージし、iPhone 16 Plus で実機運用テストを実施した結果、以下が判明：

- **過去参加者パネル経由で参加者を追加するとき、クラス（A/B）を変更する直感的な手段がない**
- 月例大会の運営では「人数バランス調整・前回成績による昇降格・体調や対戦希望」等で**毎回クラスが変動する**

クラスは「マスタに固定すべき属性」ではなく「**大会ごとの編成判断**」であるため、マスタには「主クラス」を持たせない。代わりに、過去参加者パネルとサジェストリストの**各行に「A」「B」両方のボタン**を並べ、1 タップでクラスを選んで追加できるようにする。

---

## 1. スコープ

| # | 項目 | 概要 |
|---|------|------|
| 1 | 過去参加者パネルの各行に A/B 両方の追加ボタン | 1 タップで指定クラスへ即追加（行本体タップは無効化） |
| 2 | サジェストリストの各行に A/B 両方の追加ボタン | A/B ボタンで直接追加 + **行本体タップは従来のフォーム反映を維持**（併用方式） |
| 3 | 純粋関数 `addPlayerFromMaster(memberId, cls, master, state)` 切り出し | 重複チェックは **member_id 優先**（duplicate_member / duplicate_name の2種類） |
| 4 | `last_class` ボタンの強調表示 + 「前回:Xクラス」テキスト併記 | 前回参加クラスを推奨表示するが拘束しない |

**スコープ外（永続見送り or 別フェーズ）**：
- マスタに「主クラス（regular_class）」フィールドの追加 → **永続見送り**
- マスタ編集モーダルへのクラス編集 UI → **永続見送り**
- 既存 addPlayer の大規模リファクタリング → **A-6 以降に検討**
- レイアウト揺れ修正本体 → **A-4.1（別PR）**
- マスタ画面説明文の古いニュアンス更新 → **A-6（別PR）**

---

## 2. データ構造の変更

### 2.1 schema_version

**変更なし。** branch master schema_version=1, state=4 のまま。

### 2.2 新規フィールド

**なし。** 既存 `last_class` は記録用として保持。

### 2.3 player オブジェクト

**変更なし。** `{id, name, cls, member, grade, member_id?}` の構造を維持。

---

## 3. 機能仕様

### 3.1 過去参加者パネルの各行 UI 変更（F11-a）

#### 3.1.1 新 UI

```
┌────────────────────────────────────────────┐
│ 山田 太郎  やまだたろう               [A][B*] │
│   最終:2026-04-01・前回:Bクラス               │
│ 佐藤 一郎  さとういちろう             [A*][B] │
│   最終:2026-03-01・前回:Aクラス               │
└────────────────────────────────────────────┘
```

- 各行に「A」「B」両方のボタン
- `last_class` のボタンを **太字 + アクセント色**で強調
- **「前回:Aクラス」「前回:Bクラス」テキスト併記**（強調が「現在選択中」と誤認されないため）
- ボタンサイズは **min 44px × 44px**（A-2.6 iPhone Safari ガイドライン準拠）

#### 3.1.2 行本体タップの動作（v2変更）

**過去参加者パネルでは、行全体のタップ動作を削除。**
A/B ボタン経由のみが追加経路。
ボタン以外の領域（氏名・yomi 表示部分）には `cursor: default`、hover 効果なし。
ただし表示エリアに小さく「**追加先を選択**」のヒントテキストを置く（Should Fix 3 反映）。

#### 3.1.3 ボタンタップ時の動作

1. `event.preventDefault()` + `event.stopPropagation()` を呼ぶ（Should Fix 4）
2. **重複チェック**：`addPlayerFromMaster` 内部で **member_id 優先**で検査（§3.3.2 参照）
3. **削除チェック**：`addPlayerFromMaster` 内部で防御的に検査
4. **player 作成**：`addPlayerFromMaster(memberId, cls, master, state)` を呼び出し
5. **DOM 更新**：renderRegList、renderPastParticipantsPanel
6. **showMsg**：`[山田 太郎]（Aクラス）を登録しました` の形式で確認

#### 3.1.4 アクセシビリティ（Nice to Have 1反映）

```html
<button aria-label="山田太郎をAクラスで追加" title="Aクラスで追加">A</button>
<button aria-label="山田太郎をBクラスで追加" title="Bクラスで追加">B</button>
```

---

### 3.2 サジェストリストの各行 UI 変更（F11-b、Must Fix 1反映）

#### 3.2.1 新 UI

```
┌──────────────────────────────────────┐
│ 山田 太郎  やまだたろう  [A][B*] │ ← 行本体タップ可（フォーム反映）
│ 山本 花子  やまもとはなこ [A*][B] │
└──────────────────────────────────────┘
```

#### 3.2.2 行本体タップの動作（v2 重要変更：Must Fix 1）

**サジェストリストでは、行本体タップによるフォーム反映を維持する**（A-4 既存挙動）。
これにより、以下の利用シーンを保護：
- 候補を選んだあと氏名・ふりがなを微修正してから追加したい場合
- 候補を確認してから追加したい場合

#### 3.2.3 A/B ボタンタップ時の動作

1. **`event.preventDefault()` + `event.stopPropagation()` を呼ぶ**（行本体タップと二重発火させない、Must Fix 1 / Should Fix 4）
2. **氏名欄からの IME 自動取得バッファをリセット**：`_yomiAutoBuffer=''`, `_yomiManuallyEdited=false`
3. **`addPlayerFromMaster(memberId, cls, master, state)` を呼ぶ**
4. **氏名欄・ふりがな欄をクリア**
5. **`_pendingNewYomi` には触らない**（マスタにいる member 追加経路）
6. **`master.yomi` を変更しない**（Should Fix 6：A/B 直接追加経路は yomi 更新経路ではない）

#### 3.2.4 yomi 修正経路の整理（Should Fix 6反映）

| 経路 | yomi 更新 |
|------|----------|
| サジェスト行本体タップ → フォーム反映 → 手動修正 → 「追加」ボタン | **既存マスタ yomi 空のときのみ補完**（A-4 既存挙動） |
| サジェスト A/B ボタン → 直接追加 | **master.yomi を変更しない**（v2 新設） |
| マスタ編集モーダル | 直接編集可 |

サジェストの A/B ボタン経由では yomi 修正導線がないため、修正したい場合は行本体タップでフォーム反映するか、マスタ編集モーダルで修正する。

---

### 3.3 純粋関数 `addPlayerFromMaster` の切り出し（F11-c、Must Fix 2反映）

#### 3.3.1 シグネチャ

```javascript
addPlayerFromMaster(memberId, cls, master, state)
```

| 引数 | 型 | 内容 |
|------|----|------|
| memberId | string | 追加する member.id |
| cls | 'A' \| 'B' | 追加先クラス |
| master | object | branch master |
| state | object | 現大会 state |

**v2変更**：tournamentMeta は **受け取らない**（Should Fix 1）。本関数は state.players への追加のみを行う。

#### 3.3.2 戻り値（Must Fix 2反映）

```javascript
{success: true, player: {id, name, cls, member, grade, member_id}}
// または
{success: false, error: '<error_code>'}
```

エラーコード：

| エラー | 発生条件 |
|-------|---------|
| `invalid_master` | master が null / members が配列でない |
| `invalid_state` | state が null / state.players が不正 |
| `invalid_id` | memberId が空文字 / null |
| `invalid_class` | cls が 'A' / 'B' 以外 |
| `not_found` | master.members に該当 memberId なし |
| `deleted` | member.deleted === true |
| **`duplicate_member`** | **state.players.A/B に member_id === memberId の player が存在**（v2 新設） |
| **`duplicate_name`** | member_id 不一致だが、normalizePersonName 後の同名 player が存在（v2 で意味変更） |

#### 3.3.3 処理フロー

1. 引数バリデーション（master / state / memberId / cls）
2. master.members から memberId 探索 → なければ `not_found`
3. `member.deleted === true` なら `deleted`
4. **state.players.A.concat(state.players.B) を走査**：
   - **`p.member_id === memberId` があれば `duplicate_member` を返す**（最優先、Must Fix 2）
   - `p.member_id` が無く `normalizePersonName(p.name) === normalizePersonName(member.name)` なら `duplicate_name`
5. player ID 生成（既存 `genPlayerId()` を再利用）
6. `state.players[cls].push({id, name, cls, member: member.member||'member', grade: member.grade||'ippan', member_id: member.id})`
7. 戻り値で player を返す

**禁止事項（v2拡張、Should Fix 1/2 反映）**：
- 関数内で `save()` / `renderRegList()` を呼ばない（純粋関数として保つ）
- 関数内で **`master.yomi` / `master.last_class` / `master.attendance_count` / `master.last_attended` / `master.tournament_ids` を変更しない**（責務は saveData → syncBranchMasterOnSave）
- `_pendingNewYomi` は触らない
- 既存 addPlayer の大規模リファクタリングはしない（新規関数追加のみ）

---

### 3.4 last_class 強調表示と「前回:Xクラス」テキスト併記（F11-d、Should Fix 2反映）

#### 3.4.1 強調ルール

`member.last_class` の値で：
- `'A'` の場合 → A ボタンを強調表示（太字 + 背景色 `#FFD580` or アクセント）
- `'B'` の場合 → B ボタンを強調
- 不明 / null の場合 → どちらも通常表示

#### 3.4.2 last_class の更新タイミング（v2明記、Should Fix 2）

- A/B ボタン押下時には **last_class を更新しない**
- last_class は **大会保存・マスタ同期時**に、その大会で実際に参加した `player.cls` をもとに更新される
- A/B ボタンの強調表示は、画面表示時点の `master.last_class` を参照するだけ

#### 3.4.3 「前回:Xクラス」テキスト併記

ボタン強調と併せて、行に**「前回:Aクラス」「前回:Bクラス」**を明記する。
強調が「現在選択中」と誤認されることを防ぐ。

---

## 4. 実装フェーズ（Stage 構成）

| Stage | 内容 | 想定差分 |
|-------|------|---------|
| 1 | 純粋関数 `addPlayerFromMaster` の追加と単体テスト（duplicate_member 含む） | 中 |
| 2 | 過去参加者パネルの A/B ボタン UI と動作（行本体タップ無効化） | 中 |
| 3 | サジェストリストの A/B ボタン UI（**行本体タップは維持**、stopPropagation） | 小 |
| 4 | last_class 強調表示と「前回:Xクラス」表記 | 小 |
| 5 | 全体テスト・PR | — |

---

## 5. テスト戦略

### 5.1 単体テスト追加項目（`test/test_branch_master.js`）

`addPlayerFromMaster` 純粋関数：

| ID | 内容 |
|----|------|
| A4-2-S1-add-01 | A クラスに正常追加 |
| A4-2-S1-add-02 | B クラスに正常追加 |
| A4-2-S1-add-03 | last_class='A' の member を B に追加 → success（強制 last_class にしない） |
| A4-2-S1-add-04 | invalid_class（'C'）→ error='invalid_class' |
| A4-2-S1-add-05 | invalid_master（null）→ error='invalid_master' |
| A4-2-S1-add-06 | invalid_state（null）→ error='invalid_state' |
| A4-2-S1-add-07 | not_found → error='not_found' |
| A4-2-S1-add-08 | deleted member → error='deleted' |
| **A4-2-S1-add-09** | **duplicate_member**：state.players.A に同一 member_id → B 追加でも duplicate_member（v2新設、Must Fix 2） |
| A4-2-S1-add-10 | member.member='other', grade='chu' → player に正しくコピー |
| A4-2-S1-add-11 | member.member 不在 → player.member='member'（既定値） |
| A4-2-S1-add-12 | player.member_id=member.id でリンクされる |
| **A4-2-S1-add-13** | **duplicate_name_normalized**：member_id なしの既存 player と normalizePersonName 後同名 → duplicate_name（v2新設） |
| **A4-2-S1-add-14** | **same_name_different_member_id**：同名だが member_id が異なる場合の扱い → 安全側で duplicate_name（v2新設） |
| **A4-2-S1-add-15** | **last_class が変更されない**：addPlayerFromMaster 実行後、master.last_class が変わらない（v2新設、Should Fix 2） |
| **A4-2-S1-add-16** | **attendance_count / last_attended / tournament_ids が変更されない**（v2新設、Should Fix 1） |
| A4-2-S1-add-17 | invalid_id（空文字 / null）→ error='invalid_id' |

### 5.2 e2e テスト追加項目（`test/e2e/shogi_app_a4_2.spec.js`）

#### Stage 2（過去参加者パネル）
1. 各行に A/B ボタン両方が表示される
2. last_class='A' で A ボタン強調表示
3. last_class='B' で B ボタン強調表示
4. A ボタン → state.players.A に追加
5. B ボタン → state.players.B に追加
6. last_class='A' でも B ボタンを押せば B クラスに追加（拘束なし）
7. 既に追加済みの player（同じ member_id）を別クラスのボタンで追加 → duplicate_member エラー
8. 削除済み member の行は表示されない
9. **行本体タップで何も起こらない**（フォーム反映しない、v2変更）
10. **「追加先を選択」ヒントテキストが表示される**（Should Fix 3）
11. **A/B ボタンに aria-label / title が付いている**（Nice to Have 1）

#### Stage 3（サジェストリスト）
1. 各候補行に A/B ボタン両方が表示される
2. **行本体タップでフォーム反映が残ること**（v2 Must Fix 1）
3. **A ボタン押下で行本体タップが二重発火しないこと**（Must Fix 1 / Should Fix 4）
4. **B ボタン押下で行本体タップが二重発火しないこと**（同上）
5. A/B ボタン → state.players に追加 + 氏名欄・ふりがな欄クリア
6. A/B ボタン押下後、`_pendingNewYomi` に値が増えないこと
7. **A/B ボタン経由で master.yomi が変更されないこと**（Should Fix 6）
8. last_class 強調表示
9. 行本体タップでフォーム反映 → 手動修正 → 「追加」ボタンで master.yomi が空のときのみ補完される（A-4 既存挙動の回帰確認）

#### Stage 4（last_class 表示）
1. 「前回:Aクラス」「前回:Bクラス」の文言が出る
2. last_class=null の場合は文言なし、両ボタン通常表示
3. **A/B ボタン押下時に master.last_class が即時変更されないこと**（Should Fix 2）
4. **次回 saveData 後、master.last_class が今回 player.cls に更新されること**（既存挙動の回帰確認）

#### Stage 5（全体）
1. **mobile-430 相当で過去参加者パネルとサジェストの A/B ボタンが見切れない**（Should Fix 5）
2. **横スクロールが発生しない（1px 許容）**（Should Fix 5、A-4 §3.6.4 と同方式）
3. **長い氏名・長い yomi（10〜15文字）でも A/B ボタンが押せる**（Should Fix 5）
4. duplicate_member / duplicate_name のエラーメッセージが出る

---

## 6. iPhone Safari 対応

- A/B ボタンは **min 44px × 44px** のタップターゲット
- ボタン間の間隔は **min 8px**
- font-size は **14px 以上**
- A/B ボタンを横並びにすると幅を食うため、長い氏名 + 長い yomi の行で折返しが起きないか確認

**A-4.2 の完了条件（Should Fix 5）**：
- iPhone 16 Plus 実機または mobile-430 相当で、過去参加者パネルとサジェストリストの A/B ボタンが**見切れず**、**横スクロールなしでタップできる**こと

---

## 7. 実装禁止事項（v2拡張）

### A-4 から継承

1. schema_version を変更しない
2. 新規スキーマフィールドを追加しない
3. **player.yomi フィールドを追加しない**
4. 既存 A-4 機能を破壊しない（既存テスト 604+182 件を維持）
5. **applyMasterMemberEdit シグネチャを変更しない**
6. A-3 のサジェスト・member_id 連携を破壊しない
7. A-3 の F8 branch master インポート仕様を変更しない

### A-4.2 固有

8. **マスタに「主クラス（regular_class）」を追加しない**
9. **マスタ編集モーダルにクラス編集 UI を追加しない**
10. **`addPlayerFromMaster` 内で `save()` / `renderRegList()` を呼ばない**
11. **`_pendingNewYomi` を触らない**
12. **`last_class` をボタンタップで上書きしない**（Should Fix 2）
13. **既存の登録フォーム経由 addPlayer ロジックを破壊しない**

### v2 追加（ChatGPT Should Fix 反映）

14. **サジェストの A/B ボタン押下時に行本体タップを二重発火させない**（Must Fix 1 / Should Fix 4）
15. **サジェストの行本体タップ→フォーム反映を完全削除しない**（Must Fix 1）
16. **A/B ボタン追加のために A-4.1 のレイアウト揺れ修正を先取りしない**
17. **`addPlayerFromMaster` 内で `master.last_class` を更新しない**（Should Fix 2）
18. **`addPlayerFromMaster` 内で `master.attendance_count` / `master.last_attended` / `master.tournament_ids` を更新しない**（Should Fix 1）
19. **重複チェックを name のみで完結させない**（Must Fix 2：member_id 優先）
20. **サジェスト A/B ボタン経由で `master.yomi` を変更しない**（Should Fix 6）
21. **A-4.2 で既存 addPlayer の大規模リファクタリングをしない**（A-6 以降）

---

## 8. A-4.2 完結条件

### UI（Stage 2-4）
- [ ] 過去参加者パネルの各行に A/B 両方のボタンが表示される
- [ ] サジェストリストの各候補行に A/B 両方のボタンが表示される
- [ ] サジェストの行本体タップでフォーム反映が機能する（A-4 既存挙動維持）
- [ ] サジェストの A/B ボタン押下で行本体タップが二重発火しない
- [ ] last_class が強調表示される + 「前回:Xクラス」テキスト併記
- [ ] A/B どちらのボタンでも、その指定クラスに player が追加される
- [ ] last_class と異なるクラスへの追加が成功する

### 関数（Stage 1）
- [ ] addPlayerFromMaster が duplicate_member / duplicate_name を正しく区別する
- [ ] addPlayerFromMaster 実行で master.last_class / attendance_count / last_attended / tournament_ids が変更されない

### スマホ対応（Stage 5、Should Fix 5）
- [ ] iPhone 16 Plus 相当（mobile-430）で A/B ボタンが見切れない
- [ ] 横スクロールが発生しない（1px 許容、A-4 §3.6.4 と同方式）

### 全体（Stage 5）
- [ ] 既存テスト 604+182 件すべて緑
- [ ] 新規テスト追加（単体 17件 / e2e 18件）すべて緑
- [ ] iPhone Safari 実機でボタンが押しやすい（44px 以上）

---

## 9. レビュー観点（ChatGPT v2 向け）

v1 で指摘された Must Fix 2件 + Should Fix 6件 + Nice to Have 3件への反映状況を確認してほしい：

1. **Must Fix 1（サジェスト併用方式）**：§3.2.2 で行本体タップ→フォーム反映を維持、A/B ボタンで stopPropagation を明記。十分か？
2. **Must Fix 2（重複チェック member_id 優先）**：§3.3.2 で duplicate_member / duplicate_name を区別。エラーコード追加。十分か？
3. **Should Fix 1（tournamentMeta 不要 + 責務明記）**：§3.3.1 / §3.3.3 の禁止事項で saveData 側の責務を明記。十分か？
4. **Should Fix 2（last_class 更新タイミング）**：§3.4.2 で明記。十分か？
5. **Should Fix 3（過去参加者パネル UI 明確化）**：§3.1.2 で「追加先を選択」ヒント、aria-label 追加。十分か？
6. **Should Fix 4（stopPropagation）**：§3.1.3 / §3.2.3 / §7-14 で明記。十分か？
7. **Should Fix 5（mobile-430 確認）**：§6 / §8 完結条件で明記。十分か？
8. **Should Fix 6（master.yomi 不変）**：§3.2.4 で yomi 修正経路を整理。十分か？
9. **Nice to Have 1-3**：§3.1.4（aria-label）/ §3.4.3（前回テキスト）/（連打防止は実装裁量に委ねる）

A / B / C / D で再判定をお願いします。
