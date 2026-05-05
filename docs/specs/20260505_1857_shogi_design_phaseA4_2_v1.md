# 沼津支部 月例将棋大会アプリ Phase A-4.2 設計仕様書 v1

**作成日時**: 2026-05-05 18:57 JST
**作成**: 髙橋一雄 × Claude（設計）
**前 Phase**: A-4（PR #8 mainマージ済み、Codex A-/Go）
**根拠仕様書**: A-4 仕様書 v2（`docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`）
**レビュー予定**: ChatGPT 設計メタレビュー → Claude Code 実装 → Codex 実装レビュー

---

## 0. 背景

A-4 を main にマージし、iPhone 16 Plus で実機運用テストを実施した結果、以下が判明：

- **過去参加者パネル経由で参加者を追加するとき、クラス（A/B）を変更する直感的な手段がない**
- 現状は「行をタップ → フォームに反映 → クラス変更ドロップダウンで A/B を切り替え → 追加ボタン」の 3 ステップだが、ドロップダウンの存在に気づきにくく、`last_class` が固定されるように感じられる
- 月例大会の運営では「人数バランス調整・前回成績による昇降格・体調や対戦希望」等で**毎回クラスが変動する**ことが普通

クラスは「マスタに固定すべき属性」ではなく「**大会ごとの編成判断**」であるため、マスタには「主クラス」を持たせない。代わりに、過去参加者パネルとサジェストリストの**各行に「Aで追加」「Bで追加」両方のボタン**を並べ、1 タップでクラスを選んで追加できるようにする。

---

## 1. スコープ

| # | 項目 | 概要 |
|---|------|------|
| 1 | 過去参加者パネル（`#ppPanel`）の各行に A/B 両方の追加ボタン | 1 タップで指定クラスへ即追加 |
| 2 | サジェストリスト（`#suggest-list`）の各行に A/B 両方の追加ボタン | 同上、登録フォーム経由でなく直接追加 |
| 3 | 純粋関数 `addPlayerFromMaster(memberId, cls, master, state)` 切り出し | 既存 addPlayer の重複・サジェスト処理を共通化 |
| 4 | `last_class` ボタンの強調表示 | 前回参加クラスを視覚的に推奨 |

**スコープ外（永続見送り or 別フェーズ）**：
- マスタに「主クラス（regular_class）」フィールドの追加 → **永続見送り**（last_class は記録用のまま）
- マスタ編集モーダルへのクラス編集 UI → **永続見送り**
- Aクラス専用 / Bクラス専用ボタンによるクラス指定の永続化 → **永続見送り**
- レイアウト揺れ修正 → **A-4.1（別PR）**
- マスタ画面説明文の古いニュアンス更新（Codex Minor #3） → **A-6（別PR）**

---

## 2. データ構造の変更

### 2.1 schema_version

**変更なし。** branch master schema_version=1, state=4 のまま。

### 2.2 新規フィールド

**なし。** 既存 `last_class` は記録用として保持。新規「主クラス」は追加しない。

### 2.3 player オブジェクト

**変更なし。** `{id, name, cls, member, grade, member_id?}` の構造を維持。

---

## 3. 機能仕様

### 3.1 過去参加者パネルの各行 UI 変更（F11-a）

#### 3.1.1 現状の UI（推定）

```
┌──────────────────────────────────────────┐
│ 山田 太郎  やまだたろう  最終:2026-04-01 │
│ 佐藤 一郎  さとういちろう 最終:2026-03-01 │
└──────────────────────────────────────────┘
```

タップ → 登録フォームに名前・last_class が反映 → ユーザーが「追加」ボタンを押す。

#### 3.1.2 新 UI

```
┌──────────────────────────────────────────┐
│ 山田 太郎  やまだたろう              [A][B*] │
│   最終:2026-04-01・前回:Bクラス             │
│ 佐藤 一郎  さとういちろう            [A*][B] │
│   最終:2026-03-01・前回:Aクラス             │
└──────────────────────────────────────────┘
```

- 各行に **「A」「B」両方の追加ボタン**を右端に並べる
- `last_class` のボタンを **太字＋アクセント色**（`*` で表現）
- 既存の last_class 表示は維持（明示的に「前回:Aクラス」と書く）
- ボタンサイズは **min 44px × 44px**（iPhone Safari タップターゲット基準）

#### 3.1.3 ボタンタップ時の動作

1. **重複チェック**：すでに同じ player.name が state.players.A or B にいれば showMsg('同じ名前の参加者がいます','err')
2. **削除チェック**：member.deleted が true なら showMsg('削除済み member は追加できません','warn')（基本的にこの行は表示されないはずだが防御的に）
3. **player 作成**：`addPlayerFromMaster(memberId, cls, master, state)` を呼び出し
   - 内部で `state.players[cls].push({...})` を実行
   - member_id を player に紐付け（A-3 のサジェスト経由と同じ）
   - member.member / member.grade を player.member / player.grade にコピー
4. **DOM 更新**：renderRegList、renderPastParticipantsPanel
5. **showMsg**：`[山田 太郎]（Aクラス）を登録しました` の形式で確認

#### 3.1.4 既存タップ動作の扱い

- 行全体のタップで「フォームに反映」する既存挙動は **削除**（混乱回避のため）
- A/B ボタン経由のみが追加経路となる
- ただし、マスタにない**新規参加者の追加**は引き続き登録フォームの直接入力で行う

---

### 3.2 サジェストリストの各行 UI 変更（F11-b）

#### 3.2.1 現状の UI（推定）

```
┌─────────────────────────┐
│ 山田 太郎  やまだたろう │ ← タップでフォーム反映
│ 山本 花子  やまもとはなこ│
└─────────────────────────┘
```

#### 3.2.2 新 UI

```
┌──────────────────────────────────┐
│ 山田 太郎  やまだたろう  [A][B*] │
│ 山本 花子  やまもとはなこ [A*][B]│
└──────────────────────────────────┘
```

- 各候補行に A/B 両方のボタン
- `last_class` のボタンを強調表示（太字＋アクセント色）
- 既存のタップ→フォーム反映動作は **A/B ボタンタップに置き換え**

#### 3.2.3 ボタンタップ時の動作

1. **氏名欄からの IME 自動取得（A-4 §3.1.2）はリセット**：`_yomiAutoBuffer=''`, `_yomiManuallyEdited=false`
2. **`addPlayerFromMaster(memberId, cls, master, state)` を呼ぶ**（過去参加者パネルと同じ関数）
3. **氏名欄・ふりがな欄をクリア**（addPlayer 成功時の既存挙動）
4. **`_pendingNewYomi` のクリーンアップ**（既存参加者追加なので不要だが念のため）

---

### 3.3 純粋関数 `addPlayerFromMaster` の切り出し（F11-c）

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

#### 3.3.2 戻り値

```javascript
{success: true, player: {id, name, cls, member, grade, member_id}}
// または
{success: false, error: 'invalid_member' | 'invalid_class' | 'invalid_master' | 'invalid_state' | 'not_found' | 'deleted' | 'duplicate_name'}
```

#### 3.3.3 処理フロー

1. 引数バリデーション（master.members 配列・cls が 'A' or 'B'・state.players が存在）
2. master.members から memberId 探索
3. `member.deleted === true` なら `error: 'deleted'`
4. `state.players.A.concat(state.players.B)` で同名 player 検索 → 重複なら `error: 'duplicate_name'`
5. player ID 生成（既存の `genPlayerId()` を再利用）
6. `state.players[cls].push({id, name: member.name, cls, member: member.member||'member', grade: member.grade||'ippan', member_id: member.id})`
7. 戻り値で player を返す

**禁止事項**：
- 関数内で `save()` / `renderRegList()` を呼ばない（純粋関数として保つ。UI 側で呼ぶ）
- 関数内で `master.yomi` を変更しない（A-4.2 ではクラス変更のみ、yomi 同期は既存 saveData→syncBranchMasterOnSave に任せる）
- A-4 で実装した `_pendingNewYomi` は触らない（マスタにいる member の追加なので関係ない）

---

### 3.4 last_class ボタン強調表示（F11-d）

#### 3.4.1 強調ルール

`member.last_class` の値で：
- `'A'` の場合 → A ボタンを強調表示（太字 + 背景色 `#FFD580` or アクセント）
- `'B'` の場合 → B ボタンを強調
- 不明 / null の場合 → どちらも通常表示

#### 3.4.2 「前回:Xクラス」テキストの併記

ボタン強調だけだと誤クリックを誘発しやすいので、行に**「前回:Aクラス」**等を明記。

---

## 4. 実装フェーズ（Stage 構成）

| Stage | 内容 | 想定差分 |
|-------|------|---------|
| 1 | 純粋関数 `addPlayerFromMaster` の追加と単体テスト | 中 |
| 2 | 過去参加者パネルの A/B ボタン UI と動作 | 中 |
| 3 | サジェストリストの A/B ボタン UI と動作 | 小 |
| 4 | last_class 強調表示と「前回:Xクラス」表記 | 小 |
| 5 | 全体テスト・PR | — |

---

## 5. テスト戦略

### 5.1 単体テスト追加項目（`test/test_branch_master.js`）

`addPlayerFromMaster` 純粋関数：

| ID | 内容 |
|----|------|
| A4-2-S1-add-01 | A クラスに正常追加 → success=true、state.players.A に追加される |
| A4-2-S1-add-02 | B クラスに正常追加 → success=true、state.players.B に追加される |
| A4-2-S1-add-03 | last_class='A' の member を B に追加 → success=true、player.cls='B'（強制 last_class にしない） |
| A4-2-S1-add-04 | invalid_class（'C'）→ error='invalid_class' |
| A4-2-S1-add-05 | invalid_master（null）→ error='invalid_master' |
| A4-2-S1-add-06 | invalid_state（null）→ error='invalid_state' |
| A4-2-S1-add-07 | not_found（存在しない id）→ error='not_found' |
| A4-2-S1-add-08 | deleted member → error='deleted' |
| A4-2-S1-add-09 | duplicate_name（A or B クラスに同名 player）→ error='duplicate_name' |
| A4-2-S1-add-10 | member.member='other', grade='chu' → player に正しくコピーされる |
| A4-2-S1-add-11 | member.member 不在 → player.member='member'（既定値） |
| A4-2-S1-add-12 | player.member_id=member.id でリンクされる |

### 5.2 e2e テスト追加項目（`test/e2e/shogi_app_a4_2.spec.js`）

#### Stage 2（過去参加者パネル）
1. 過去参加者パネルの各行に A/B ボタン両方が表示される
2. last_class='A' の行で A ボタンが強調表示される
3. last_class='B' の行で B ボタンが強調表示される
4. A ボタン → state.players.A に追加、registered list 更新
5. B ボタン → state.players.B に追加
6. last_class='A' でも B ボタンを押せば B クラスに追加される（`last_class` 拘束なし）
7. 既に A に追加済みの player を B ボタンで追加 → エラーメッセージ
8. 削除済み member の行は表示されない

#### Stage 3（サジェストリスト）
1. サジェストリストの各候補行に A/B ボタン両方が表示される
2. A ボタン → state.players.A に追加 + 氏名欄・ふりがな欄クリア
3. B ボタン → state.players.B に追加 + 同上
4. A/B どちらでも `_pendingNewYomi`（A-4 §3.1.4）に入らない（マスタにいる member だから）
5. last_class 強調表示
6. サジェスト経由で追加した後、マスタ yomi に DOM 値が反映されない（既存 yomi を上書きしない）

#### Stage 4（last_class 表示）
1. 「前回:Aクラス」「前回:Bクラス」の文言が出る
2. last_class=null の場合は文言なし、両ボタン通常表示

---

## 6. iPhone Safari 対応

- A/B ボタンは **min 44px × 44px** のタップターゲット（A-2.6 ガイドライン継承）
- ボタン間の間隔は **min 8px**
- font-size は **14px 以上**（読みやすさ）
- A/B ボタンを横並びにすると幅を食うため、**長い氏名 + 長い yomi の行で折返しが起きないか**確認

---

## 7. 実装禁止事項

### A-4 から継承

1. schema_version を変更しない
2. 新規スキーマフィールドを追加しない
3. **player.yomi フィールドを追加しない**（一時的にも）
4. 既存 A-4 機能を破壊しない（既存テスト 604+182 件を維持）
5. **applyMasterMemberEdit シグネチャを変更しない**（A-4.2 では別関数 addPlayerFromMaster を新規追加）
6. A-3 のサジェスト・member_id 連携を破壊しない
7. A-3 の F8 branch master インポート仕様を変更しない

### A-4.2 固有

8. **マスタに「主クラス（regular_class）」を追加しない**（last_class は記録用のまま）
9. **マスタ編集モーダルにクラス編集 UI を追加しない**
10. **`addPlayerFromMaster` 内で `save()` / `renderRegList()` を呼ばない**（純粋関数として保つ）
11. **`_pendingNewYomi` を触らない**（マスタにいる member の追加経路では関係ない）
12. **`last_class` をボタンタップで上書きしない**（last_class はあくまで「前回参加クラスの記録」）
13. **既存の登録フォーム経由 addPlayer ロジックを破壊しない**（手動入力時のフォールバックとして維持）

---

## 8. A-4.2 完結条件

- [ ] 過去参加者パネルの各行に A/B 両方のボタンが表示される
- [ ] サジェストリストの各候補行に A/B 両方のボタンが表示される
- [ ] last_class が強調表示される
- [ ] A/B どちらのボタンを押しても、その指定クラスに player が追加される
- [ ] last_class と異なるクラスへの追加が成功する
- [ ] 重複名・削除済み・不正 ID の各エラーが正しく出る
- [ ] 既存テスト 604+182 件すべて緑
- [ ] 新規テスト追加（単体 12+ / e2e 14+）すべて緑
- [ ] iPhone Safari 実機でボタンが押しやすい（44px 以上）

---

## 9. レビュー観点（ChatGPT 向け）

1. **設計判断の妥当性**：マスタに主クラスを持たせないのは妥当か？ 過去参加者パネル/サジェストに A/B ボタンを並べるのが最適解か？
2. **`addPlayerFromMaster` シグネチャ**：`(memberId, cls, master, state)` で過不足ないか？ tournamentMeta は不要か？
3. **既存の登録フォーム経由 addPlayer との重複ロジック**：純粋関数化で共通化できるはずだが、A-4.2 でリファクタリングするのは適切か（リスクが大きいなら新規関数のみ追加）？
4. **last_class の扱い**：強調表示のみで「拘束しない」設計は妥当か？（ユーザーが意図せず last_class クラスに追加してしまうリスクは？）
5. **サジェストの動作変更**：既存の「タップ→フォーム反映」を破壊して「タップで A or B ボタン UI 表示→直接追加」にするのは妥当か？ 互換性で問題ないか？
6. **Stage 構成**：Stage 1〜5 の順序と粒度は妥当か？
7. **実装禁止事項の漏れ**：先取りリスクのある項目はないか？
8. **テスト戦略**：単体 12 / e2e 14 でカバレッジは十分か？
