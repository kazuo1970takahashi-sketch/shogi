# PAIRING-UX-DISPLAY-HELPER-DESIGN — 参加者表示 helper 設計方針

**Task ID**: `PAIRING-UX-DISPLAY-HELPER-DESIGN`
**作業種別**: docs-only / design check / UI display helper design
**前提**:
- PR #99（`PAIRING-UX-INVENTORY`、merge `244106099327b1fda4e2d1f45eeeb8ba9cf44a0a`）— 手動組み合わせ UX 課題棚卸し、§3.7 警告と判断材料の画面距離
- PR #100（`PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`、merge `5490714cba52196c684ead6463b6e0d3baddfee8`）— Phase 1〜4 段階化、§8 第一候補として本 `DISPLAY-HELPER-DESIGN` を推奨

**HEAD**: `5490714`（PR #100 squash merge 後の main）

---

## 1. 目的と非目的

### 1.1 目的

- **参加者表示 helper** の設計方針を整理する
- `PAIRING-UX-DISPLAY-LABELS` と `PAIRING-UX-WARNING-DECISION-SUPPORT` の **共通基盤** を作る
- 手動組み合わせ時の **見間違い・迷い・スクロール往復** を減らす
- **スマホ表示でも破綻しにくい** 表示形式を整理する
- **個人情報の表示範囲** を明確にする（運営者向け / 参加者向け / 印刷物の境界）
- 実装段階で「どのモードでどの情報を出すか」が即決まる状態にする

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- helper 関数を実装しない / シグネチャを **確定** しない（候補として整理）
- `shogi_v4.html` / CSS / `test/` を変更しない
- `warning object`（`evaluatePairingQuality()` 戻り値）を変更しない
- 自動組み合わせロジックに触れない
- `PAIRING-UX-DISPLAY-LABELS` / `PAIRING-UX-WARNING-DECISION-SUPPORT` の実装に着手しない
- `detail mode` / `print mode` の最終 UX 確定はしない
- 参加者向け出力（公開 PDF・配布物）の仕様確定はしない（運営者向けと分離する原則だけ整理）

---

## 2. 現状コードの確認

### 2.1 参加者データ shape — **単一支部前提**

本アプリは **「沼津支部 月例将棋大会 運営ツール」**（タイトル [shogi_v4.html:6](shogi_v4.html:6) / [91](shogi_v4.html:91)）= **単一支部運営**。

`normalizeState()` ([342](shogi_v4.html:342)) で参加者は以下の shape に正規化される:

| field | 型 / 値域 | 用途 | 表示利用 |
|---|---|---|---|
| `id` | string | 内部識別（unique）| **表示しない** |
| `name` | string | 氏名 | 必須表示 |
| `cls` | `'A'` / `'B'` | クラス | 暗黙（クラス別タブ）|
| `entry_no` | number > 0 | クラス内番号（**欠番維持**、再採番禁止 — A-5.1 §11.8 / [237-242](shogi_v4.html:237)）| `entryNoOf()` で 2 桁 0 埋め |
| `member` | `'member'` / `'other'` | **支部員区分**（`'member'`=沼津支部員 / `'other'`=他）| 現状 master list ([2068](shogi_v4.html:2068)) と F7 編集モーダル ([2132](shogi_v4.html:2132)) のみ表示 |
| `grade` | `'ippan'` / `'chu'` | 年齢区分（一般 / 中学生以下）| 現状 master list ([2069](shogi_v4.html:2069)) のみ表示 |
| `member_id` | string optional | 支部マスタとの紐付け key（F2 / [358](shogi_v4.html:358)）| 表示しない |

**重要な前提（過去の inventory / design check の修正）**:
- 本アプリには **「支部名」フィールドは存在しない**（単一支部運営のため）
- 過去 PR #99 / #100 の docs で「支部」と書かれていた情報は、**正しくは「支部員区分（支部員 / 他）」**（`member` field）を指す
- 「同姓識別補助に支部名を表示」は本アプリでは適用不可。代わりに使えるのは **クラス + entry_no + 氏名 + 支部員区分（任意）**
- 住所 / 電話 / 連絡先などの個人情報は **`state.players[cls]` には保持されていない**（master 側でも参照していない範囲）

### 2.2 既存の表示 helper

| 関数 | 行 | 戻り値 | 用途 |
|---|---|---|---|
| `getName(id, cls)` | [231](shogi_v4.html:231) | `'山田太郎'`（氏名のみ）| 印刷 `printResults` ([5464](shogi_v4.html:5464)) / RANK-PRINT-001 |
| `entryNoOf(cls, id)` | [243](shogi_v4.html:243) | `'01'`（2 桁 0 埋め、`entry_no` 優先、欠番時 index+1 fallback）| 内部 helper |
| `getNameWithNo(id, cls)` | [277](shogi_v4.html:277) | `'01｜山田太郎'`（entryNo + 全角縦線 + 氏名）| **画面表示の主軸**（pairing-card / score-card / 変更モーダル / 対戦履歴 / 過去結果）|
| `getWins(cls)` | [293](shogi_v4.html:293) | `{playerId: N}` map | score-card / 警告判定 |
| `getFee(member, grade)` | [281](shogi_v4.html:281) | 円（fee）| 受付金額計算（表示用ではない）|

**観察**:
- **クラス文字（A/B）は表示文字列に入らない**（タブ切替で暗黙）
- ただし bulk edit modal ([3727](shogi_v4.html:3727)) は `cls + entryNoOf(cls, id)` = `'A07'`（区切り無し）の独自フォーマット
- 印刷物は `getName()` 単体（番号なし、A-4 §2 / RANK-PRINT-001）

### 2.3 表示利用箇所の整理

| 表示場所 | 使用 helper | 含まれる情報 | 行 |
|---|---|---|---|
| pairing-card | `getNameWithNo()` | entryNo + 氏名 | [4892](shogi_v4.html:4892) |
| score-card（暫定成績）| `getNameWithNo()` + `getWins()` | entryNo + 氏名 + **勝数 + N勝M敗** | [4827](shogi_v4.html:4827) |
| 対戦履歴リスト | `getNameWithNo()` | entryNo + 氏名 | [4838-4839](shogi_v4.html:4838) |
| 過去結果（クリックで修正）| `getNameWithNo()` | entryNo + 氏名 + 勝者 | [4852-4853](shogi_v4.html:4852) |
| 「対戦相手の変更」モーダル option | `entryNo｜name` 直書き | entryNo + 氏名 | [4644 / 4650](shogi_v4.html:4644) |
| 一括編集モーダル | `cls + entryNoOf()` + 氏名（input）| クラス + entryNo + 氏名 | [3727](shogi_v4.html:3727) |
| マスタ一覧 | `m.name` + `memberLabel` + `gradeLabel` | 氏名 + 支部員区分 + 年齢区分 | [2073-2077](shogi_v4.html:2073) |
| 印刷（結果表）| `getName()` | 氏名のみ | [5464+](shogi_v4.html:5464) |

**重要なギャップ**:
- **score-card と pairing-card の非対称**: score-card には `N勝M敗` があるが pairing-card にはない（PR #100 §2.4 で既出）
- **クラス文字を表示文字列に含めるパターンが少ない**: 一括編集モーダルが唯一の例（`A07`、ただし `A-07` ではない）
- **支部員区分・年齢区分は master 側のみ表示**: 手動組み合わせ画面 / score-card / pairing-card には出ていない
- **同姓識別のための情報源は entry_no のみ**（支部名がないため）

### 2.4 まとめ — helper 設計の出発点

- 「画面表示の主軸」は既に `getNameWithNo()` = `'01｜氏名'` で確立されている
- **これを破壊しない発展形** として helper を設計するのが安全
- クラス文字を入れるか（`A-01` 形式）/ 入れないか（`01` 形式、現状）は **画面コンテキスト依存** で options 化が妥当
- 勝敗数併記は **score-card で既に確立済み** のパターン → pairing-card 側に拡張すれば対称化できる
- 支部員区分・年齢区分は **master 側でしか表示していない** → 手動組み合わせ画面に出す場合は **新規露出** として個人情報配慮が必要

---

## 3. 表示対象情報の整理

helper で扱う可能性のある情報を、**現状の取得経路** と **個人情報レベル** と合わせて整理する。

| ID | 情報 | 例 | 取得経路 | 個人情報レベル | 用途 |
|---|---|---|---|---|---|
| 1 | クラス | `'A'` / `'B'` | `player.cls` | 低 | pairing-card / 印刷物識別 |
| 2 | クラス内番号 | `'01'` / `'12'` | `entryNoOf(cls, id)` | 低 | 同姓識別 |
| 3 | 氏名 | `'山田太郎'` | `getName(id, cls)` | **個人情報基本単位** | 必須表示 |
| 4 | 支部員区分 | `'支部員'` / `'他'` | `player.member` | 中（個人と紐づく）| 同姓識別補助 / 会費照合 |
| 5 | 年齢区分 | `'一般'` / `'中学'` | `player.grade` | 中 | 会費照合 / 大会区分 |
| 6 | 勝敗数 | `'2勝0敗'` | `getWins(cls)` + `state.results[cls].length` | 低（公開前提）| 異勝数ペア警告判断 |
| 7 | 対戦済み相手 | `'A-03, A-08'` | `state.results[cls]` 走査 | 中（誰と当たったか）| 再戦回避判断 |
| 8 | 全勝マーカー | `'★全勝'` | `wins === currentRound - 1` 判定 | 低（公開前提）| 警告 / 注目強調 |
| 9 | 対戦済み annotate | `'(済)'` | `pairHasRematch()` | 中 | 手動組み合わせ候補表示 |
| 10 | 卓番号 | `'第3卓'` | pairing-card index + 1 | 低 | 物理配置 |
| 11 | 備考 / correction | freeform | 現状未保持 | 中〜高 | **初期 helper では扱わない** |
| 12 | 住所 / 連絡先 | — | **現状 state に無い** | 高 | **初期 helper では扱わない** |
| 13 | 会費 | `'500円'` | `getFee()` | 中（金銭情報）| **手動組み合わせ画面では原則表示しない** |

**設計原則**:
- ID 1〜3 は **常に表示**（クラスは context 暗黙化可、entry_no と氏名は必須）
- ID 4〜5 は **オプション**（同姓識別が必要な場合のみ表示）
- ID 6〜9 は **コンテキスト依存**（警告判断 / 手動組み合わせモーダルでは有用、印刷物では不要）
- ID 10〜11 は **特定 view 専用**
- ID 12〜13 は **手動組み合わせ UX では扱わない**

---

## 4. 表示モード案

helper の **mode** として 4 種類を提示する。**確定仕様ではなく候補**。

### 4.1 compact mode

- **用途**: スマホ画面 / 候補一覧（変更モーダルの `<select>` option）/ 警告本文内の短い表示 / 対局行の横並び表示
- **表示例**:
  - `01｜山田太郎`（現状 `getNameWithNo()` の出力、クラス文字なし）
  - `01｜山田太郎 (2-0)`（勝敗数併記、`includeRecord` オプション ON）
  - `A-01 山田太郎`（クラス文字あり、`includeClass` オプション ON）
- **含める情報**: クラス番号（entryNo）+ 氏名、`includeRecord` で勝敗数 optional
- **含めない情報**: 支部員区分 / 年齢区分 / 対戦済み / 住所 / 会費
- **設計優先**: **既存 `getNameWithNo()` の出力を破壊しない**（互換性最優先）
- **文字数目安**: 12〜18 全角文字（スマホ 1 行収まり）

### 4.2 standard mode

- **用途**: 手動組み合わせ画面の pairing-card / WARNING-DECISION-SUPPORT の警告本文 / 運営者向け通常表示
- **表示例**:
  - `A-01 山田太郎 (2勝0敗)`（クラス + 番号 + 氏名 + 勝敗数）
  - `01｜山田太郎 (2勝0敗) [支部員]`（支部員区分込み、`includeMemberKind` ON）
- **含める情報**: クラス番号 + 氏名、**勝敗数（デフォルト ON）**、`includeMemberKind` で支部員区分 optional
- **注意**:
  - 情報が長くなりすぎる場合は折り返しや省略を検討
  - `includeMemberKind` ON は同姓識別が必要な場合のみ推奨（個人情報配慮）
- **文字数目安**: 18〜30 全角文字（スマホで折り返し許容）

### 4.3 detail mode

- **用途**: 参加者詳細 / 受付確認 / 管理者向け確認 / 将来的なモーダル表示 / 対戦履歴一覧
- **表示例**（複数行可）:
  ```
  A-01 山田太郎
  支部員区分: 支部員
  年齢区分: 一般
  成績: 2勝0敗
  対戦済み: A-03, A-08
  ```
- **含める情報**: クラス + 番号 + 氏名 + 支部員区分 + 年齢区分 + 勝敗数 + 対戦済みリスト
- **注意**:
  - 手動組み合わせ画面の **一覧に detail mode を常時出すと情報過多**
  - **モーダル / 詳細パネル / hover tooltip 専用**
  - 個人情報配慮レベル高（支部員区分 + 年齢区分が同時に出る）
- **本 helper-design では実装範囲外**（後続タスクで扱う）

### 4.4 print/card mode

- **用途**: 対局カード / 印刷 / PDF / **参加者に見える可能性がある表示**
- **表示例**:
  - `山田太郎`（氏名のみ、現状 `printResults` ([5464](shogi_v4.html:5464)) の方針）
  - `A-01 山田太郎`（クラス + 番号 + 氏名、配布カードの最低限）
- **原則**:
  - **必要最小限**
  - 住所 / 会費 / 支部員区分 / 年齢区分 / 対戦済み詳細は出さない
  - 参加者向け表示 / 運営者向け表示の境界は **運用者判断**（helper 側は `audience` で切替可能にしておく）
- **本 helper-design では実装範囲外**（後続タスクで扱う、`PAIRING-UX-CARD-PUBLISH-CHECK` 系と接続）

### 4.5 mode 比較

| mode | クラス | 番号 | 氏名 | 勝敗数 | 支部員区分 | 年齢区分 | 対戦済み | 文字数目安 | 実装優先度 |
|---|---|---|---|---|---|---|---|---|---|
| **compact** | optional | 必須 | 必須 | optional | × | × | × | 12〜18 | **最高**（IMPL-LIGHT 対象）|
| **standard** | optional | 必須 | 必須 | デフォルト ON | optional | × | × | 18〜30 | **高**（IMPL-LIGHT 対象）|
| detail | 必須 | 必須 | 必須 | 必須 | optional | optional | optional | 複数行 | 中（後続タスク）|
| print/card | optional | optional | 必須 | × | × | × | × | 6〜12 | 低（別タスク）|

---

## 5. 運営者向け表示 / 参加者向け表示の分離

### 5.1 audience による情報切替

| 情報 | `audience: operator` | `audience: participant` | `audience: print` |
|---|---|---|---|
| クラス | ○ | ○ | ○（カード用）|
| 番号（entry_no）| ○ | ○ | ○（任意）|
| 氏名 | ○ | ○ | ○ |
| 支部員区分 | ○（同姓識別時）| × | × |
| 年齢区分 | ○（運営判断時）| × | × |
| 勝敗数 | ○ | △（場合による）| ×（個別カードでは出さない）|
| 対戦済み相手 | ○ | × | × |
| 卓番号 | ○ | ○ | ○ |

### 5.2 重要な原則

- **大会運営アプリでは、同じ「参加者表示」でも誰が見る画面かによって出してよい情報が変わる**
- helper には **`audience` フラグ** を持たせ、運営者向け / 参加者向け / 印刷物向けで切り替える
- デフォルトは `audience: 'operator'`（運営者向け）
- `audience: 'participant'` / `'print'` を選んだ場合は **個人情報を慎重に絞る**
- 「公開可能な情報」と「運営者専用情報」の境界は **運用ルールで明文化**（後続タスクで運用ガイドへ）

### 5.3 設計上の含意

- 既存 `getNameWithNo()` の出力は **`audience: 'operator'` の compact mode** に相当する
- 既存挙動を変えずに helper を導入する場合、**operator + compact がデフォルト** であるべき
- `audience: 'participant'` / `'print'` は **明示的に opt-in**

---

## 6. 個人情報・プライバシー観点

### 6.1 表示範囲の原則

- **氏名だけでも個人情報扱い**（PR #99 §3.5 と整合）
- **クラス番号 + 氏名は個人情報**
- **支部員区分は、個人と紐づくとさらに注意が必要**（属性情報の追加）
- **年齢区分（中学以下）は未成年情報を含み得る** ため特別注意
- **住所** は手動組み合わせ UX では **表示しない**（state にも保持されていない）
- **会費情報** は手動組み合わせ UX では **原則表示しない**（`getFee()` の結果は会計目的のみ）

### 6.2 表示場所別の注意

| 表示場所 | 注意レベル | 配慮事項 |
|---|---|---|
| 運営者専用画面（手動組み合わせ）| 中 | 支部員区分・年齢区分は同姓識別目的でのみ |
| 共有画面（運営者間で共有）| 中〜高 | 年齢区分は要再検討 |
| 印刷物（運営者保持）| 中 | 氏名 + クラス番号まで、その他は別表 |
| 印刷物（参加者配布）| **高** | **氏名 + 卓番号のみ** が原則、その他は出さない |
| PDF（共有・配布）| **高** | 印刷物（参加者配布）に準じる |
| HP 掲載（公開）| **最高** | 氏名 + クラス + 結果のみ。年齢区分・支部員区分は出さない |

### 6.3 localStorage / JSON export との接続

- helper の表示 mode は **データ保持 / export** とは別レイヤー
- ただし `JSON export` で生成されるファイルが運営者外に渡る場合、**helper が表示する以上の情報** が export に含まれる可能性がある（master 側の個人情報など）
- これは別タスク（SAVE-UX / export 系設計）の論点であり、本 helper-design では **「表示」レベルのみ** を扱う
- 将来的に `audience: 'participant'` モードで PDF を生成する場合、export の個人情報フィルタと整合する必要がある

### 6.4 デフォルト値の安全側設計

- helper のデフォルトは **「最小情報」**:
  - `mode: 'compact'`
  - `audience: 'operator'`
  - `includeRecord: false`
  - `includeMemberKind: false`
  - `includeGrade: false`
  - `includeOpponentHistory: false`
- 必要な情報を **明示的に opt-in** する設計にすると、過剰表示事故を防げる

---

## 7. helper API 案（候補、確定しない）

### 7.1 関数シグネチャ候補

```
formatParticipantLabel(player, options) → string | object
```

または

```
formatParticipantLabel(playerId, cls, options) → string | object
```

**両方の選択肢を残す**（実装時に決める）:
- 第 1 案は `player` オブジェクトを直接渡す → 呼出側で `state.players[cls][i]` を取得済みのコンテキストに自然
- 第 2 案は `playerId` + `cls` を渡す → 既存 `getName()` / `getNameWithNo()` のシグネチャに沿う、内部で id→player 解決

### 7.2 options 候補

```
options = {
  mode: 'compact' | 'standard' | 'detail' | 'print',         // 表示モード（§4）
  audience: 'operator' | 'participant' | 'print',            // 想定読み手（§5）
  includeClass: boolean,                                     // 'A-' / 'B-' プレフィックス
  includeEntryNo: boolean,                                   // デフォルト true（compact/standard）
  includeRecord: boolean,                                    // 勝敗数併記
  includeMemberKind: boolean,                                // 支部員区分（同姓識別）
  includeGrade: boolean,                                     // 年齢区分（detail のみ推奨）
  includeOpponentHistory: boolean,                           // 対戦済み相手（detail のみ）
  recordContext: {                                           // 勝敗数情報源
    wins: {[playerId]: number},                              // 既存 getWins(cls) を渡す
    totalRounds: number                                       // state.results[cls].length 等
  },
  maxLength: number,                                         // 文字数上限（折り返し / 省略）
  mobileCompact: boolean                                     // スマホ最適化（短縮形）
}
```

### 7.3 戻り値候補

```
// String 形式（最小、既存 helper 互換）
'A-01 山田太郎 (2勝0敗)'

// Object 形式（拡張、aria 等）
{
  text: 'A-01 山田太郎 (2勝0敗)',
  parts: {
    classLabel: 'A-01',
    name: '山田太郎',
    record: '2勝0敗',
    memberKind: undefined
  },
  ariaLabel: 'Aクラス1番 山田太郎 2勝0敗',
  privacyLevel: 'operator',     // 'operator' | 'participant' | 'print'
  warnings: []                  // 'name-only-collision-risk' 等の表示警告
}
```

### 7.4 確定しないポイント（実装時に決める）

- 戻り値: string 形式のみ / object 形式のみ / 両対応（オーバーロード）
- `audience` がデフォルトで何になるか（推奨: `'operator'`）
- `includeRecord` のデフォルト（mode ごとに変える: compact=false, standard=true）
- `parts` フィールドの粒度（個別レンダリング用に細かく分けるか）
- `privacyLevel` の判定ロジック
- アクセシビリティ（aria-label）の必要範囲
- パフォーマンス（pairing-card 30 件 × 2 名で 60 回呼出しても問題ないか）

### 7.5 互換性の方針

- **既存 `getName()` / `getNameWithNo()` を残す**（直接 callsite が多いため、即削除はリスク）
- 新 helper は **既存 helper の super-set** として導入
- 段階移行: 新 callsite から新 helper、既存 callsite は触らない or 必要に応じて少しずつ移行

---

## 8. DISPLAY-LABELS との接続

### 8.1 期待する効果

- **苗字重複・同姓同名** の見間違い軽減 — `includeMemberKind` で支部員区分を追加（PR #99 §3.1）
- **大人数クラス（A22 名等）での選択負荷軽減** — モーダル候補 `<select>` の option label に `compact mode` を適用、検索・絞り込みと組み合わせる
- **クラス番号 + 氏名の標準表示** — `compact` / `standard` で一貫
- **スマホでも短く見える** — `mobileCompact: true` で `01｜山田 (2-0)` のような短縮形
- **対戦済みマーカー** — `includeOpponentHistory` で `(済 vs A-03)` annotate（detail mode）
- **全勝マーカー** — `includeRecord` の派生として `★全勝` ラベル付与（standard / compact）

### 8.2 次タスク候補

- `PAIRING-UX-DISPLAY-LABELS-DESIGN`（モーダル候補 list / 行内表示 / マーカーの design check、helper 着地後）
- または小さく進めるなら `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（helper 着地後、変更モーダルの option label を `compact` 化 + 行内表示を `standard` 化、`includeMemberKind` は同姓識別 opt-in）
- ただし **今回の PR では着手しない**

### 8.3 設計依存

- DISPLAY-LABELS 側は helper の `mode: 'compact' | 'standard'` と `audience: 'operator'` を主に使う
- `includeMemberKind` の opt-in 規則（同姓識別が必要なクラスのみ ON）は DISPLAY-LABELS-DESIGN で確定

---

## 9. WARNING-DECISION-SUPPORT との接続

### 9.1 期待する効果

- **pairing-card に勝敗数を併記** できる — `mode: 'standard'` + `includeRecord: true` を pairing-card で使う
- **警告近くに該当ペアの表示** ができる — `mode: 'compact'` + `includeRecord: true` を警告本文で使う
- **警告判断材料として compact / standard label を使える** — helper があれば呼出側は 1 行で書ける
- **score-card と pairing-card の表示非対称を解消** できる — score-card 側も将来的に helper 経由に統一可能（ただし急がない）

### 9.2 次タスク候補

- `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`（PR #100 §8.2、Phase 1 のみ実装）
- **条件**:
  - `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT` で helper が着地済み
  - **warning object 不変** / `evaluatePairingQuality()` 不変
  - pairing-card に勝敗数を出す（`includeRecord: true`）
  - 警告近くに **短い理由補足** を固定文言で出す（PR #100 §4.6 候補 F）
- ただし **今回の PR では着手しない**

### 9.3 設計依存

- WARNING Phase 1 は helper の `mode: 'standard'` + `includeRecord: true` のみで実装可能
- Phase 2 以降（該当ペア特定 / ハイライト / 候補名表示）は別タスクで warning object 拡張と合わせて設計

---

## 10. 推奨 Next Action

### 10.1 第一候補: `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT`

- **目的**: `formatParticipantLabel` 相当の **軽量 helper** を実装し、内部表示整形を統一する出発点を作る
- **想定スコープ**:
  - 関数 1 つ追加（`formatParticipantLabel(player, options)` または `formatParticipantLabel(id, cls, options)`）
  - 最初は **`mode: 'compact'` と `'standard'` のみ** 実装
  - `audience` / `privacyLevel` / `warnings` などは docs に留め、実装では **過剰に作り込まない**
  - `warning object` / `evaluatePairingQuality()` は変更しない
  - 既存 `getName()` / `getNameWithNo()` を破壊しない（並存 → 段階移行）
  - 新 callsite で使い始め、既存 callsite は最小限の移行（or 触らない）
- **想定テスト**: 新規 `test/test_format_participant_label.js`（compact / standard / クラス文字 ON/OFF / 勝敗数 ON/OFF / 不正な player の扱い）
- **規模**: 小〜中（+50〜100 行 helper + テスト 50〜100 行）
- **理由**:
  - DISPLAY-LABELS と WARNING-DECISION-SUPPORT の **両方の前提** になる
  - 1 つの helper を先に固めると、後続 IMPL-LIGHT が薄い実装で済む
  - SAVE-UX 系で踏襲した **design check → IMPL-LIGHT** パターンに乗る

### 10.2 第二候補: `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`

- **目的**: pairing-card に勝敗数を併記 + 警告近くに理由補足
- **条件**:
  - `DISPLAY-HELPER-IMPL-LIGHT` 着地済み
  - **Phase 1 のみ**（PR #100 §5.1）
  - warning object / `evaluatePairingQuality()` 不変
- **規模**: 小（+20〜40 行 + テスト）

### 10.3 第三候補: `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`

- **目的**: 変更モーダルの option label を `compact` 化 + 行内表示を `standard` 化
- **条件**:
  - `DISPLAY-HELPER-IMPL-LIGHT` 着地済み
  - `compact` / `standard` 表示方針が確定
  - `includeMemberKind` の opt-in 規則が docs で固まっている
- **規模**: 小（+30〜60 行 + テスト）

### 10.4 優先順位の根拠

- 第一候補 `DISPLAY-HELPER-IMPL-LIGHT` は **両タスクの共通基盤**、helper 着地後は両方が薄い実装で済む
- 第二候補 `WARNING-DECISION-SUPPORT-IMPL-LIGHT` は **現場ストレスの即解消**（PR #100 §3 で観察済み）
- 第三候補 `DISPLAY-LABELS-IMPL-LIGHT` は **広い改善範囲**、helper 着地後に進める

→ **第一候補で helper を実装 → 第二候補で警告判断材料を近接表示 → 第三候補で全面的に label を改善** という順序が安全

---

## 11. 当面やらないこと

- 今回（本 design check PR）は **実装しない**
- helper API を **確定しすぎない**（§7 は候補、実装時に決める）
- `detail mode` を最初から実装しない（IMPL-LIGHT 範囲外、§4.3）
- `print/card mode` を最初から実装しない（IMPL-LIGHT 範囲外、§4.4）
- `privacyLevel` / `ariaLabel` / `warnings` などのフィールドを **過剰実装しない**（最初は string 戻り値で十分）
- `warning object` を変更しない（PR #100 §1.2 と整合）
- `evaluatePairingQuality()` を変更しない
- 同勝数候補名表示に進まない（PR #100 §5.4 Phase 4、要 design check）
- デッドロック検知に進まない（`PAIRING-UX-DEADLOCK-INVENTORY` の別タスク）
- CSS 大改修をしない（表示テキストの整形のみ）
- 参加者向け出力（公開 PDF・配布物）の仕様確定に広げない（運営者向けと分離の原則のみ整理）
- 既存 `getName()` / `getNameWithNo()` を即削除しない（並存 → 段階移行）
- master / branch master 側の表示には触れない（手動組み合わせ UX に限定）

---

## 12. 完了条件

本 docs-only PR の完了条件:

- **参加者表示 helper の目的** が §1 で整理されている
- **現状コードの確認結果** が §2 で関数名 + 行番号付きに整理されている（**単一支部前提の修正** を含む）
- **表示対象情報** が §3 で個人情報レベル付きに整理されている
- **compact / standard / detail / print mode** が §4 で整理されている
- **運営者向け / 参加者向け表示の分離**（audience）が §5 で整理されている
- **個人情報・プライバシー観点** が §6 で明記されている
- **helper API 候補** が §7 で「候補」として整理されている（確定しすぎていない）
- **DISPLAY-LABELS / WARNING-DECISION-SUPPORT との接続** が §8 / §9 で整理されている
- **推奨 Next Action** が §10 で提示されている（第一 = `DISPLAY-HELPER-IMPL-LIGHT`、第二 = `WARNING-DECISION-SUPPORT-IMPL-LIGHT`、第三 = `DISPLAY-LABELS-IMPL-LIGHT`）
- **実装変更なし** / **テスト変更なし** / **CI 設定変更なし**
- 変更ファイルは `docs/notes/20260514_shogi_pairing_ux_display_helper_design.md` と `HANDOFF.md` のみ
- `shogi_v4.html` / `test/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js` は変更しない
- `PAIRING-UX-INVENTORY`（PR #99）/ `WARNING-DECISION-SUPPORT-DESIGN`（PR #100）と矛盾しない記述

---

## 13. 関連 PR / docs

- 起源 inventory PR: PR #99（`PAIRING-UX-INVENTORY`、merge `244106099327b1fda4e2d1f45eeeb8ba9cf44a0a`）
- 直前 design check PR: PR #100（`PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`、merge `5490714cba52196c684ead6463b6e0d3baddfee8`）
- 既存 inventory: [docs/notes/20260514_shogi_pairing_ux_inventory.md](docs/notes/20260514_shogi_pairing_ux_inventory.md)
- 既存 design check: [docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md](docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md)
- 既存 pairing 仕様: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)
- SAVE-UX 系の段階パターン参照: [docs/notes/20260513_shogi_save_ux_status_map.md](docs/notes/20260513_shogi_save_ux_status_map.md)（§22〜§26、inventory → design check → IMPL-LIGHT → observation）
- 本 design check PR: `docs(pairing-ux): 参加者表示helperの設計方針を整理`
- 変更ファイル:
  - `docs/notes/20260514_shogi_pairing_ux_display_helper_design.md`（本ファイル、新規）
  - `HANDOFF.md`（PAIRING-UX-DISPLAY-HELPER-DESIGN ポインタ追加）
- 変更しないファイル: `shogi_v4.html` / `test/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`

---

## 14. IMPL-LIGHT 着地（2026-05-15 追補）

`PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT` を実装し、main 反映を予定する。

### 14.1 実装した helper

- **関数名**: `formatParticipantLabel(player, options)` — §7.1 第一案（`player` オブジェクトを直接渡す形）を採用
- **追加場所**: [shogi_v4.html:281-321 周辺](shogi_v4.html:281)（既存 `getNameWithNo()` ([277](shogi_v4.html:277)) と `getFee()` の間）
- **戻り値**: 文字列のみ（object 戻り値 / `parts` / `ariaLabel` / `privacyLevel` / `warnings` は **実装しない** — §7.4 確定しないポイントを尊重）

### 14.2 採用した options（最小版）

```
options = {
  mode: 'compact' | 'standard',   // default 'compact'
  includeRecord: boolean,         // 勝敗数を併記
  record: { wins: number, losses: number },
  includeCategory: boolean        // standard モードのみ有効
}
```

- `audience` / `includeClass` / `includeEntryNo` / `includeGrade` / `includeOpponentHistory` / `recordContext` / `maxLength` / `mobileCompact` は **今回は実装しない**（後続タスクで追加余地を残す）
- `mode: 'detail'` / `'print'` は **今回は実装しない**（§4.3 / §4.4、IMPL-LIGHT 範囲外）

### 14.3 採用した表示フォーマット

| パターン | 出力例 |
|---|---|
| compact | `A-12 山田太郎` |
| compact + record | `A-12 山田太郎（2勝0敗）` |
| standard | `A-12 山田太郎` |
| standard + category(member) | `A-12 山田太郎（沼津支部員）` |
| standard + category(other) | `A-03 鈴木一郎（他）` |
| standard + record | `A-12 山田太郎（2勝0敗）` |
| standard + category + record | `A-12 山田太郎（沼津支部員 / 2勝0敗）` |

- **category の表記**:
  - `player.member === 'member'` → `沼津支部員`
  - `player.member === 'other'` → `他`
  - 未設定 / 不明 → category 部を **出さない**（`undefined` / `null` が文字列に混入しないことをテストで保証）
- **「支部名」は出さない** — 単一支部運営前提（§2.1 / §2.4）。`player.branch` 等の存在しないフィールドは一切参照しない（テストで保証）

### 14.4 安全側の挙動

- 不正な `player`（`null` / `undefined` / string）→ **空文字** を返す（throw しない）
- `entry_no` 未設定 → `'--'` フォールバック（`entryNoOf()` と同様の安全網）
- `mode` 省略 → `compact` 扱い
- `compact` で `includeCategory: true` を渡しても category は **出ない**（compact 仕様、§4.1）
- `record.wins` / `record.losses` が型不正 → record 部を **出さない**
- 戻り値は **HTML escape 前のプレーン文字列**。callsite で `escapeHtml()` を通す前提（既存 `getName()` / `getNameWithNo()` と同じ流儀）

### 14.5 UI 適用範囲

- **A 案を採用**: helper 追加 + テスト追加のみ。**既存 UI への適用は今回行わない**
- 既存 `getName()` / `getNameWithNo()` / `entryNoOf()` / `getWins()` は **未変更**（並存）
- pairing-card / score-card / 「対戦相手の変更」モーダル / 印刷経路 などへの helper 配線は **後続タスク** で個別に判断

### 14.6 追加テスト

- 新規ファイル: `test/test_pairing_ux_display_helper.js`
- `test/run_tests.sh` に起動 stanza 追加
- 23 アサート（構造 5 + 振る舞い 18）全 PASS:
  1. `formatParticipantLabel` が 1 件だけ定義されている
  2. 既存 `getName()` / `getNameWithNo()` が維持されている
  3. `player.branch` を参照していない（単一支部前提）
  4. helper 定義近傍に `沼津支部員` 表記が含まれる
  5. helper が関数として取り出せる
  6〜10. compact / standard の基本表示と各 option 組合せ
  11. category 未設定時に `undefined` / `null` が混入しない
  12. compact では `includeCategory:true` でも category が出ない
  13〜14. `record` 型不正時のフォールバック
  15〜17. 不正な `player`（`null` / `undefined` / string）→ 空文字
  18. `entry_no` 未設定 → `--` フォールバック
  19. `mode` 省略 → compact
  20〜23. その他境界ケース

### 14.7 不変項目（IMPL-LIGHT で守ったこと）

- `warning object` / `evaluatePairingQuality()` ([4384](shogi_v4.html:4384)) **未変更**
- 既存 `getName()` ([231](shogi_v4.html:231)) / `getNameWithNo()` ([277](shogi_v4.html:277)) / `entryNoOf()` ([243](shogi_v4.html:243)) **未変更**（並存）
- 既存テスト 46 件すべて PASS（69 件中、新規 23 を除く）
- forbidden files 未変更: `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`
- 自動組み合わせロジック / 対戦履歴ロジック / SAVE-UX 関連ロジック 未変更
- `detail` / `print/card` モード 未実装
- `audience` / `privacyLevel` / `warnings` フィールド 未実装

### 14.8 次タスク候補

§10 の優先順位は維持。helper 着地後の次の選択肢:

| 順位 | 候補 | 想定スコープ |
|---|---|---|
| 第一 | `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT` | Phase 1（PR #100 §5.1）— pairing-card に `formatParticipantLabel(player, {mode:'standard', includeRecord:true, record:{...}})` を配線、警告本文に理由補足 |
| 第二 | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 「対戦相手の変更」モーダルの option label を `compact` 化、行内表示を `standard` 化（`includeCategory` は同姓識別 opt-in） |

両者とも helper 関数を 1 行呼び出す形で配線でき、warning object / `evaluatePairingQuality()` を改修せずに進められる。

### 14.9 変更ファイル（本 IMPL-LIGHT PR）

- `shogi_v4.html` — `formatParticipantLabel` helper 追加（+45 行 / -0、既存 helper は未変更）
- `test/test_pairing_ux_display_helper.js`（新規）
- `test/run_tests.sh` — 起動 stanza 追加
- `docs/notes/20260514_shogi_pairing_ux_display_helper_design.md` — 本 §14
- `HANDOFF.md` — IMPL-LIGHT ポインタ追加
