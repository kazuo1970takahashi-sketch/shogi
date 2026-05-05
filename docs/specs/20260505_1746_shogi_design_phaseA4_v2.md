# 沼津支部 月例将棋大会アプリ Phase A-4 設計仕様書 v2

**作成日時**: 2026-05-05 17:46 JST（v2: ChatGPT B+ Must Fix 2件 + Should Fix 6件 + Nice to Have 反映）
**作成**: 髙橋一雄 × Claude（設計）
**前 Phase**: Phase A-3（main マージ済み、commit `9929ac4`、e2e追加 commit `bdd1e65`）
**根拠仕様書**: A-3 仕様書 v7.3（`docs/specs/20260505_1800_shogi_design_phaseA3_v7_3.md`）
**前バージョン**: v1.1（`docs/specs/20260505_1740_shogi_design_phaseA4_v1_1.md`）
**ChatGPTメタレビュー**: B+ / Conditional Go（`docs/reviews/` 参照）
**レビュー予定**: ChatGPT 設計メタレビュー（v2 で再判定）→ Claude Code 実装 → Codex 実装レビュー
**v1.2 Slim 6.2節「フルサイクル」5周目開始**

### 改訂履歴

| バージョン | 日時 | 変更点 |
|---|---|---|
| v1 | 2026-05-05 17:37 | 初版（5項目）|
| v1.1 | 2026-05-05 17:40 | スマホレイアウト揺れ修正（項目6）追加 |
| **v2** | **2026-05-05 17:46** | **ChatGPT B+ レビュー反映：Must Fix 2件 + Should Fix 6件 + Nice to Have 3件** |

---

## 0. 背景

A-3完了後の実機運用テスト（iPhone 16 Plus）で以下が判明した。

1. **ふりがな空振り問題**：登録画面に氏名（漢字）入力欄しかなく、ふりがなはマスタタブからしか入力できない。結果、運用でふりがなが入らず50音タブが機能しない。
2. **member/grade不可視問題**：マスタにmember/grade（支部員区分・中学生以下区分）を持たせているが、マスタ編集画面で表示・編集できない。
3. **削除済み member 復元手段なし**：A-3で「A-4以降」と先送りした項目。
4. **ふりがな未入力者の可視化なし**：自動取得を導入しても全員に入る保証はないため、未入力者を可視化する仕組みが必要。
5. **タブ切替時のレイアウト揺れ**：iPhone 16 Plus でタブ切替時に左右マージンが微妙に揺れる。

A-4 はこれら実運用上の穴を塞ぎ、月例大会運営でアプリが「使い物になる」状態を完成させる。

---

## 1. スコープ（A-4最大版・6項目）

| # | 項目 | 概要 |
|---|------|------|
| 1 | 登録画面ふりがな入力欄＋IME自動取得 | 氏名入力時にIMEからふりがなを**補助的に**自動取得。手動入力欄が主機能。 |
| 2 | マスタ一覧に区分列追加 | member/grade を一覧に表示（読み取り専用）。 |
| 3 | マスタ編集モーダルに区分追加 | name + yomi に加えて member/grade も編集可能に。 |
| 4 | 削除済みmember復元UI | tombstoneを表示・復元できる。 |
| 5 | ふりがな未入力者可視化 | マスタタブで未入力者数を表示、未入力フラグで絞り込み。 |
| 6 | スマホレイアウト揺れ修正 | iPhoneでタブ切替時に左右が微妙に揺れる問題を解消。 |

**スコープ外（永続見送り）**：
- ふりがな自動「推定」（kuromoji.js等の形態素解析）
- ローマ字検索
- 異体字自動統合
- 半角カナ対応

**A-4 設計思想（v2追記）**：
- IME自動取得は **補助機能**。100%の自動入力を保証しない。
- 手動入力欄が主機能。自動取得できなくても運用可能であれば完了条件を満たす。
- ふりがな未入力者を**登録不可にしない**。未入力者可視化で運用カバー。

---

## 2. データ構造の変更

### 2.1 schema_version

**変更なし。** branch master の schema_version は `1` のまま。member/grade は A-3 で既に追加済み。

### 2.2 新規フィールド

なし。既存の `member`, `grade`, `deleted`, `deleted_at`, `yomi` を使う。

### 2.3 player オブジェクトの構造保持（v2強調）

state.players.A/B の構造は変更しない。
**player に yomi フィールドを追加しない**（一時的にも追加しない）。
登録画面のふりがな入力欄の値は、DOM上の入力値として保持し、addPlayer 時にマスタ反映する（後述§3.1.4）。

---

## 3. 機能仕様

### 3.1 登録画面ふりがな入力欄＋IME自動取得（F9）

#### 3.1.1 UI

```
氏名:       [山田太郎          ]   クラス: [A▼]   [追加]
ふりがな:   [やまだたろう       ]
            （自動入力されない場合は手入力してください）
```

- 氏名欄の下にふりがな入力欄を配置
- 入力欄は font-size: 16px（A-2.6 iPhone Safari ガイドライン準拠）
- placeholder: `ふりがな`
- 補助文（小さい文字、グレー）：`自動入力されない場合は手入力してください`
- 既存のサジェスト機能とは独立（サジェスト選択時はマスタの yomi が反映される）

#### 3.1.2 IME自動取得ロジック（v2全面改訂）

**状態管理（純粋に追跡する変数）**：

| 変数名 | 役割 |
|--------|------|
| `_yomiAutoBuffer` | 直近のIMEひらがな状態（compositionupdate中の最新値） |
| `_yomiManuallyEdited` | yomi欄をユーザーが直接編集したかどうか（boolean） |
| `_suggestState.selectedMemberId` | サジェスト由来か判定（A-3で既存） |

**動作ルール（Must Fix 1反映、優先順位順）**：

1. **手動編集判定**：
   - ユーザーが yomi 欄に直接 `input` イベントを発生させた場合 → `_yomiManuallyEdited = true`
   - サジェスト選択で yomi 欄に値が入った場合 → `_yomiManuallyEdited = false`（サジェスト由来は手動編集扱いにしない）
   - サジェスト選択後に yomi 欄をユーザーが直接編集した場合 → `_yomiManuallyEdited = true`
   - 氏名欄をクリア（addPlayer成功 / 手動全消去）した場合 → `_yomiManuallyEdited = false` にリセット

2. **IME取得**：
   - 氏名欄での `compositionstart` → `_yomiAutoBuffer = ''` リセット
   - `compositionupdate` → `event.data` がひらがな（U+3040〜U+309F）のみで構成されていれば `_yomiAutoBuffer` を更新
   - `compositionend` → `_yomiManuallyEdited === false` の場合のみ、`_yomiAutoBuffer` を yomi 欄末尾に追記（追加前に既に値があれば連結）

3. **苗字・名前の連続変換対応**：
   - 「やまだ」確定（compositionend）→ yomi 欄に「やまだ」追記
   - 続けて「たろう」入力中の compositionupdate → buffer = 「たろう」
   - 「たろう」確定（compositionend）→ yomi 欄に「たろう」追記 → 結果「やまだたろう」
   - **手動編集していない限り、追記は継続される**

4. **追加ボタン押下後**：
   - addPlayer 成功時、氏名欄・ふりがな欄をクリア
   - `_yomiManuallyEdited`, `_yomiAutoBuffer`, `_suggestState` を初期状態にリセット

#### 3.1.3 サジェスト選択時の挙動

- A-3で実装済みの onSuggestTap で氏名・クラスがフォームに反映される
- v2追加：マスタの yomi が yomi 欄にも反映される
- `_yomiManuallyEdited = false` のまま（サジェスト由来は手動扱いにしない）
- ユーザーがその後 yomi 欄を直接編集した場合のみ `_yomiManuallyEdited = true`

#### 3.1.4 yomi の一時保持と反映タイミング（Should Fix 3反映）

**player に yomi を保存しない**ことを守るための実装方針：

1. ふりがな入力欄の値は **DOM 上のみで保持**（`document.getElementById('inp-yomi').value`）
2. addPlayer 実行時：
   - DOM から氏名と yomi を読み取る
   - 通常通り `state.players[cls].push({...})` で参加者を追加（**player.yomi は追加しない**）
   - サジェスト由来（member_id あり）の場合：
     - 既存マスタの yomi を上書きする条件で、現在の yomi 欄の値が空でなく、かつ既存マスタ yomi と異なれば、その時点で `master.members[i].yomi` を更新（saveBranchMaster）
   - 新規参加者（member_id なし、初登場）の場合：
     - `_pendingNewYomi[normalizeName(name)] = yomi欄の値` のような一時マップに保持
     - `updateBranchMasterFromTournament` で新規 member 作成時に、この一時マップから yomi を取得して反映
3. 大会データ（`shogi_v4`）には **yomi を保存しない**

**禁止事項**：player オブジェクトには yomi を一時的にも追加しない。

#### 3.1.5 マスタ更新時の扱い

- 既存の `updateBranchMasterFromTournament` を拡張：
  - 第3引数（meta）に `yomiMap`（オプショナル）を追加
  - 新規 member 作成時、`yomiMap[normalizeName(player.name)]` があればそれを yomi に設定
  - 既存 member の yomi は、空のときのみ yomiMap から補完（既存値があれば触らない）

---

### 3.2 マスタ一覧に区分列追加（F7-c）

#### 3.2.1 UI変更

新テーブル：
```
氏名 | ふりがな | 区分 | 最終参加 | 回数 | 操作
```

「区分」列の表示形式（2段表示）：
```
山田 太郎  | やまだたろう  | 支部員        | 2026-04-01 | 12 | [編集][削除]
            |                | 中学          |
```

#### 3.2.2 ふりがな未入力バッジ

ふりがな列で `isNoYomiMember(m) === true` の場合：
```
| ⚠️ 未入力 |
```
を黄色背景（薄）で表示。

#### 3.2.3 削除日時の表示（Nice to Have 3反映）

削除済み表示モード（§3.4.2）では、操作列の上に削除日時を表示：
```
削除日: 2026-05-05
```

---

### 3.3 マスタ編集モーダルに区分追加（F7-d）

#### 3.3.1 UI（Nice to Have 1反映）

```
┌─ マスタ編集 ─────────────────────────┐
│ 氏名:     [山田 太郎          ]      │
│ ふりがな: [やまだ たろう       ]      │
│                                      │
│ 支部員区分: ◉ 支部員  ○ 他           │
│ 中学生以下: ◉ 一般    ○ 中学         │
│                                      │
│ ─ 履歴情報（読み取り専用）─          │
│ 初回参加: 2025-04-01                 │
│ 最終参加: 2026-04-01                 │
│ 参加回数: 12回                       │
│                                      │
│              [キャンセル] [保存]     │
└──────────────────────────────────────┘
```

#### 3.3.2 ロジック変更（Must Fix 2反映 - シグネチャ一本化）

**採用シグネチャ（唯一）**：
```javascript
applyMasterMemberEdit(memberId, newName, newYomi, master, options)
```

**options の型**：
```javascript
{
  member?: 'member' | 'other',
  grade?: 'ippan' | 'chu'
}
```

**仕様**：
- options 省略時：member / grade を**変更しない**（既存挙動維持）
- options.member 指定時のみ：member を更新
- options.grade 指定時のみ：grade を更新
- options.member が不正値（'foo' 等）→ エラー（`invalid_member_value`）
- options.grade が不正値 → エラー（`invalid_grade_value`）
- A3-S2-edit-01〜29 既存テストは **options 省略で既存挙動を完全維持**

**禁止事項（Must Fix 2反映）**：
- 旧案 `applyMasterMemberEdit(memberId, newName, newYomi, newMember, newGrade, master)` は採用しない
- 第4引数 master の位置は変更しない
- 新しい関数名は作らない（applyMasterMemberEditV2 等は禁止）

---

### 3.4 削除済みmember復元UI（F7-e）

#### 3.4.1 UI

マスタタブに「削除済みを表示」トグルボタンを追加：

```
[📥 統合] [📤 エクスポート] [📂 インポート] [🗑️ 削除済みを表示]
```

#### 3.4.2 削除済みモード時の表示

トグルON時：
- 一覧に削除済みmemberも表示
- 削除済み行は**薄いグレー背景＋取り消し線**
- 操作列に「**復元**」ボタンを表示（編集・削除ボタンは非表示）
- 削除日時を表示

#### 3.4.3 復元ロジック

新規純粋関数 `applyMasterMemberRestore(memberId, master)`：

| 項目 | 内容 |
|------|------|
| 戻り値 | `{success, error?}` |
| エラー | `not_found` / `not_deleted` / `invalid_master` / `invalid_id` |
| 処理 | deleted を false に、deleted_at を null に |

UI から呼び出し時：
- confirm で「『山田太郎』を復元します。続けますか？」
- 成功時 showMsg('OK') → renderMasterTab

**復元後の再反映確認（Should Fix 6反映）**：
完了条件で以下を検証：
- 通常マスタ一覧に再表示される
- 過去参加者パネルに再表示される
- 登録画面サジェストの候補に再表示される
- yomi 未入力なら未入力サマリー・バッジ・フィルタにも反映される

**禁止事項**：
- 復元時に物理削除を実装しない
- 復元時に member_id を変更しない

---

### 3.5 ふりがな未入力者可視化（F7-f）

#### 3.5.1 共通判定関数（Should Fix 4反映）

```javascript
function isNoYomiMember(member) {
  if (!member) return true;
  return !normalizeYomi(member.yomi || '');
}
```

サマリー・バッジ・フィルタ・e2eテストすべてでこの関数を使う。

#### 3.5.2 マスタタブのサマリー

```
登録: 12名（うちふりがな未入力: 3名）
```

#### 3.5.3 一覧での可視化

`isNoYomiMember(m) === true` の行：
- ふりがな列に **⚠️ 未入力** バッジ表示（薄い黄色背景）

#### 3.5.4 過去参加者パネルのフィルタ追加

クイックフィルタに「ふりがな未入力」を追加（4種目）：
- 前回参加 / 3ヶ月以内 / 常連 / **ふりがな未入力**（NEW）
- 排他選択は維持
- 検索・50音タブと AND 条件

純粋関数 `applyQuickFilter` に新キー `QUICK_FILTER_NO_YOMI` 追加：
```javascript
if(filterKey === QUICK_FILTER_NO_YOMI){
  return members.filter(isNoYomiMember);
}
```

---

### 3.6 スマホレイアウト揺れ修正（F10）

#### 3.6.1 現象

iPhone 16 Plus（論理幅 430px）でタブを切り替えると、各タブの左右マージンが微妙に異なって見える。

#### 3.6.2 想定原因（v2拡張）

1. コンテンツ幅の不揃い
2. 横スクロール発生
3. box-sizing の不整合
4. viewport meta の設定漏れ
5. Safari セーフエリア
6. **table / flex item の min-width**（v2追加）
7. **button group の white-space: nowrap**（v2追加）
8. **100vw と scrollbar / safe-area の相性**（v2追加）
9. **transform / position fixed の影響**（v2追加）
10. **モーダルや非表示タブの display 切替による幅計算**（v2追加）

#### 3.6.3 調査・修正方針

**Stage 6 冒頭で実機 DevTools 検証**：
1. iPhone 16 Plus（または近似サイズ：375px / 414px / 430px）で各タブを開く
2. Safari Web Inspector で測定：
   - `document.documentElement.scrollWidth`
   - `document.body.scrollWidth`
   - `window.innerWidth`
   - 各タブコンテナの `getBoundingClientRect().width`
3. 横スクロールバーの有無を確認
4. 揺れの原因となっている要素を特定

**禁止事項（Should Fix 1反映）**：
- 既存のレスポンシブ対応（A-2.6 で確定したiPhone Safari UXガイドライン）を破壊しない
- font-size 16px ルールは維持
- **原因未特定のまま `overflow-x: hidden` だけで隠す修正をしない**
- **原因未特定のまま全体CSSを推測で大きく書き換えない**
- 影響範囲が大きいと判明した場合は、**A-4本体PRから切り出して別PR化**（A-4.1）

#### 3.6.4 e2eテスト（Should Fix 5反映）

完全一致ではなく **1px の許容誤差**を持たせる：

```javascript
const diff = Math.abs(
  document.documentElement.scrollWidth - window.innerWidth
);
expect(diff).toBeLessThanOrEqual(1);
```

各タブで以下を測定：
- `document.documentElement.scrollWidth <= window.innerWidth + 1`
- `document.body.scrollWidth <= window.innerWidth + 1`
- 参加者登録 / 対局 / 最終結果 / マスタの各タブで同じ検証
- マスタタブで削除済み表示ON時も横スクロールしない
- マスタ編集モーダル表示時も横揺れしない
- iPhone 16 Plus 相当幅 430px でも確認

---

## 4. 実装フェーズ（Stage構成）

| Stage | 内容 | 想定差分 | 中止条件 |
|-------|------|---------|---------|
| 1 | 登録画面ふりがな入力欄追加（UIのみ、自動取得なし） | 小 | — |
| 2 | IME自動取得ロジック実装 | 中 | iPhone Safari実機でCompositionEventが安定しない場合は補助扱いに下げ、手動入力＋未入力者可視化を優先 |
| 3 | マスタ一覧 + 編集モーダルに member/grade 表示・編集 | 中 | — |
| 4 | 削除済みmember復元UI（純粋関数 + UIトグル） | 中 | — |
| 5 | ふりがな未入力可視化（サマリー + バッジ + フィルタ） | 小 | — |
| 6 | スマホレイアウト揺れ修正（実機調査→修正→e2eで横スクロール検出） | 中 | 原因不特定 or 全体CSSへの大きな波及が判明したら**A-4本体から切り出してA-4.1として別PR化** |
| 7 | 全体テスト・PR | — | — |

---

## 5. テスト戦略

### 5.1 単体テスト追加項目

**Stage 1-2（ふりがな自動取得）**：
- normalizeYomi の既存テストでカバー
- yomi の一時保持マップ（`_pendingNewYomi`）のロジック単体テスト

**Stage 3（マスタ編集 - 拡張シグネチャ）**：
- options 省略時に member/grade が変わらない（既存挙動互換）
- member のみ変更できる
- grade のみ変更できる
- member/grade 両方変更できる
- 不正 member 値でエラー（`invalid_member_value`）
- 不正 grade 値でエラー（`invalid_grade_value`）
- name/yomi 正規化と member/grade 更新が同時に行える

**Stage 4（復元）**：
- `applyMasterMemberRestore` 通常成功
- 不存在id → not_found
- deleted=false → not_deleted
- 復元後の deleted=false / deleted_at=null

**Stage 5（フィルタ）**：
- `applyQuickFilter` に QUICK_FILTER_NO_YOMI 追加
- yomi 空 = 未入力扱い
- yomi 空白文字列も未入力扱い（normalizeYomi 適用後）
- isNoYomiMember 単独テスト

### 5.2 e2eテスト追加項目

**Stage 1-2（ふりがな入力）**：
1. ふりがな入力欄が表示される
2. 手動入力した値が保存される（addPlayer後にマスタに反映）
3. 氏名欄に漢字をコピペした場合、ふりがな欄は空のままで手動入力できる
4. ふりがな欄を手動編集した後、IMEイベントが来ても上書きされない
5. 苗字・名前を別々に変換した場合、yomi が累積される
6. サジェスト選択時にマスタ yomi がふりがな欄へ反映される
7. サジェスト選択後、ふりがな欄を手動修正した場合、マスタ更新時に修正後 yomi が反映される

**Stage 3（member/grade 編集）**：
1. マスタ一覧に区分が表示される
2. 編集モーダルで支部員区分・中学生区分を変更できる
3. 変更が localStorage に保存される
4. 編集モーダルに履歴情報（初回・最終・回数）が読み取り専用で表示される

**Stage 4（復元）**：
1. 削除済み表示トグルOFFでは deleted=true が出ない
2. トグルONで deleted=true が出る
3. 削除日時が表示される
4. 復元 confirm cancel では復元されない
5. 復元 confirm accept で deleted=false / deleted_at=null
6. deleted=false の member に復元処理をかけると not_deleted エラー
7. 復元後、サジェスト候補に出る
8. 復元後、過去参加者パネルに出る
9. 復元後、yomi 未入力ならふりがな未入力フィルタにも反映される

**Stage 5（未入力可視化）**：
1. yomi 空文字は未入力扱い
2. yomi 空白のみは未入力扱い
3. yomi カタカナは normalize 後に入力済み扱い
4. サマリー数と一覧バッジ数が一致
5. ふりがな未入力フィルタ結果とサマリー数が一致
6. 50音タブ・検索との AND 条件

**Stage 6（レイアウト揺れ）**：
1. mobile-375 で各タブを開いて `documentElement.scrollWidth - innerWidth ≤ 1`
2. body.scrollWidth - innerWidth ≤ 1
3. 参加者登録 / 対局 / 最終結果 / マスタの各タブで同じ検証
4. マスタタブで削除済み表示ON時も横スクロールしない
5. マスタ編集モーダル表示時も横揺れしない

---

## 6. iPhone Safari 対応（A-2.6 ガイドライン継承）

新規追加するUI要素すべてに以下を適用：
- textarea / input[type=text]: `font-size: 16px` 以上
- ボタンハンドラ冒頭で `inputElement.blur()` を呼ぶ（必要な箇所のみ）
- 実機 iPhone Safari で動作確認（特にIME自動取得）

**v2追加 - blur との競合注意**：
- IME確定前（compositionend発火前）に blur すると compositionend が想定通り発火しない可能性がある
- 「追加」ボタン押下時の blur 順序は：氏名欄 blur → ふりがな欄 blur → addPlayer
- compositionend を待ってから blur する必要があるかもしれない（実機で要確認）

---

## 7. 実装禁止事項（v2拡張）

### A-3から継承

1. **schema_version を変更しない**（branch master は 1、state は 4 のまま）
2. **新規スキーマフィールドを追加しない**（既存の yomi/member/grade/deleted/deleted_at を使う）
3. **ふりがなの「自動推定」は実装しない**（kuromoji.js等は導入しない、IMEイベントのみ）
4. **player オブジェクトに yomi フィールドを追加しない**（一時的にも追加しない）
5. **既存A-3機能を破壊しない**（既存テスト547+80件すべて緑を維持）
6. **applyMasterMemberEdit のシグネチャを破壊しない**（options引数追加で既存テスト互換維持）
7. **A-4 でリリースしない機能は先取りしない**（例：ローマ字検索、自動推定）

### v2追加（ChatGPT Should Fix 反映）

8. **IME自動取得のために外部ライブラリを追加しない**
9. **CompositionEvent 非対応時に登録不能にしない**
10. **ふりがな未入力を理由に参加者登録をブロックしない**
11. **ふりがな自動取得が失敗しても、手動入力で完了できるようにする**
12. **復元UIで物理削除を実装しない**
13. **復元時に member_id を変更しない**
14. **レイアウト揺れ修正で原因未特定のまま全体CSSを大きく変更しない**
15. **`overflow-x: hidden` だけで問題を隠して完了扱いにしない**
16. **A-3 のサジェスト・member_id 連携を破壊しない**
17. **A-3 の F8 branch master インポート仕様を変更しない**

---

## 8. A-4 完結条件

### ふりがな入力（Stage 1-2）
- [ ] 登録画面にふりがな入力欄が表示される
- [ ] IME入力時に多くのケースでふりがなが自動入力される
- [ ] 自動取得できなかった場合、手動入力で補完できる
- [ ] 手動編集後、IMEイベントによる上書きが発生しない
- [ ] サジェスト選択でマスタ yomi が反映される
- [ ] player オブジェクトに yomi が追加されていない（既存structure維持）

### マスタ拡張（Stage 3）
- [ ] マスタ一覧に支部員区分・中学生区分が表示される
- [ ] マスタ編集モーダルで支部員区分・中学生区分を変更できる
- [ ] 編集モーダルに履歴情報が読み取り専用で表示される
- [ ] applyMasterMemberEdit options 省略で既存テスト互換

### 復元UI（Stage 4）
- [ ] マスタタブに「削除済みを表示」トグルがある
- [ ] 削除済みmemberを復元できる
- [ ] 復元後、通常マスタ一覧に再表示される
- [ ] 復元後、過去参加者パネルに再表示される
- [ ] 復元後、登録画面サジェストの候補に再表示される
- [ ] 復元後、yomi 未入力なら未入力サマリー・バッジ・フィルタに反映される

### 未入力可視化（Stage 5）
- [ ] マスタタブにふりがな未入力者数が表示される
- [ ] ⚠️未入力バッジで未入力者が一目で分かる
- [ ] クイックフィルタに「ふりがな未入力」が追加される
- [ ] サマリー数とフィルタ結果が一致

### レイアウト（Stage 6）
- [ ] iPhone 16 Plusで各タブ切り替え時に左右の揺れが発生しない
- [ ] mobile-375 e2eで横スクロールが発生しない（1px許容）

### 全体（Stage 7）
- [ ] 既存テスト547+80件がすべて緑
- [ ] 新規テスト追加（単体+e2e）すべて緑
- [ ] iPhone Safariでの実機動作確認

---

## 9. レビュー観点（ChatGPT v2向け）

v1.1で指摘されたMust Fix 2件 + Should Fix 6件 + Nice to Have 3件への反映状況を確認してほしい：

1. **Must Fix 1（手動編集判定仕様）**：§3.1.2 で状態管理ルールを明記。十分か？
2. **Must Fix 2（applyMasterMemberEdit シグネチャ一本化）**：§3.3.2 で旧案を排除し、唯一案に統一。十分か？
3. **Should Fix 1（Stage 6 切り出し条件）**：§4 中止条件 + §3.6.3 禁止事項で明記。十分か？
4. **Should Fix 2（補助機能としての位置付け）**：§1 設計思想で明記。十分か？
5. **Should Fix 3（yomi 一時保持）**：§3.1.4 で `_pendingNewYomi` 方式を明記。十分か？
6. **Should Fix 4（共通判定関数）**：§3.5.1 で `isNoYomiMember` を定義。十分か？
7. **Should Fix 5（e2e 1px許容）**：§3.6.4 で明記。十分か？
8. **Should Fix 6（復元後の再反映完了条件）**：§3.4.3 + §8 で明記。十分か？
9. **Nice to Have 1-3**：§3.3.1（履歴表示）/ §3.1.1（補助文）/ §3.2.3（削除日時）で反映。

A / B / C / D で再判定をお願いします。
