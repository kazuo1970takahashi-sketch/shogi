# 業務モデル：沼津支部月例将棋大会管理（shogi_v4）

**配置先**: `docs/specs/_business_model.md`(永続文書・タイムスタンプ無し)
**最終更新**: 2026-05-06 07:12 JST
**準拠**: DevSecOps 運用方針 v1.2.5 §13.4(業務モデル文書の常駐義務)
**位置づけ**: 本リポジトリの**真実の源(Source of Truth)**。仕様書・テスト・実装の前提となるドメイン定義。フェーズ仕様書 §0 のユーザーストーリーは本文書のジャーニーから派生する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1.0 | 2026-05-06 01:27 | 初版起草。Stage 2a 着手前条件(v1.2.5 §13.4)として整備 | Claude.ai |
| v1.1 | 2026-05-06 07:12 | ChatGPT B+ レビュー反映: Must Fix 2 件(state スキーマ実装ズレ修正、§1.4 操作カタログ拡充)+ Should Fix 7 件(参加費 INV、ヘッダー分離、BYE 統一、マスタフロー、更新トリガー拡張等)+ Nice to Have 主要 3 件(§1.4 P0/P1/P2、§7 検証方法列、member_id 欠損扱い)。実装根拠は shogi_v4.html の grep 出力で確定 | Claude.ai |

---

## 1. 業務目的とユーザー

### 1.1 業務目的

沼津支部月例将棋大会の**運営作業を最小化**し、**事故ゼロでの大会運営**を実現する。具体的には:

1. 参加者の受付・登録・参加費徴収を 30 分以内に完了させる
2. スイス式ペアリングを自動生成し、運営者の判断負荷を排除する
3. 対局結果の入力・集計・最終順位算出を機械化する
4. 大会後の報告書(参加者一覧 + 結果 + 会計)を自動生成する
5. 月例間でデータを引き継ぎ可能にする(保存・復元)

### 1.2 ユーザー

| ロール | 役割 | 操作主体 |
|---|---|---|
| 大会主幹事(髙橋一雄) | 大会全体の運営、ペアリング確認、結果確定、報告書作成 | shogi_v4 全機能 |
| 副幹事 | 受付係、対局結果入力補助 | 参加者登録・対局管理 |
| 参加者 | 対局カード提出、結果報告 | 直接操作なし(運営者経由) |

### 1.3 運用前提

- 端末:副幹事のスマートフォン(受付)+ 主幹事の PC または iPad(運営)
- ネットワーク:会場 Wi-Fi 不安定前提 → **完全オフライン動作**
- データ保存:LocalStorage のみ(サーバー無し)
- バックアップ:「大会データをコピー」ボタンで JSON 文字列をクリップボード経由で他媒体(メール下書き等)に退避
- 開催頻度:毎月 1 回、参加者 16〜32 名、A/B 2 クラス、5〜6 ラウンド

### 1.4 参加費体系

`shogi_v4.html` line 235 `getFee(member, grade)` 実装に基づく確定仕様:

|  | `grade='ippan'`(一般) | `grade='chu'`(中学生) |
|---|---|---|
| `member='member'`(支部員) | 500 円 | **0 円(無料)** |
| `member='other'`(他支部) | 1,000 円 | 500 円 |

合計参加費は `calcTotal()`(line 240)で A クラス + B クラス全参加者の合計として算出。`#fee-summary`(line 145)に表示。中学生支部員無料は支部の青少年育成方針による恒久ルール。

### 1.5 UI 重要操作カタログ(v1.2.5 §1.4 適用範囲)

「クリックしたら状態または表示が変わるべき」操作。Stage 2a で実装する `clickAndExpectChange` ヘルパは、これらに primary semantic assertion を強制する。**通知のみで完了とする実装は禁止**(A-4.2 リグレッションの根本原因)。

#### P0:業務停止・データ破壊に直結する操作(Stage 2a 必須)

| 操作 | DOM | primary assertion 例 |
|---|---|---|
| 参加者追加 | `#addBtn` | `state.players[cls].length` 増加 |
| クラス選択 A/B(過去参加者) | `.pp-add-btn[data-cls]` | `state.players[lastIndex].cls === 'A' or 'B'` |
| クラス選択 A/B(サジェスト) | `.suggest-add-btn[data-cls]` | 同上 |
| 対局開始 | `#startBtn` | タブ遷移 `#tab-tournament` active + `state.started === true` |
| 勝者ボタン | `#wb_{cls}_{i}_p{1,2}` | `state.results[cls][round][i].winner === playerId` |
| ラウンド確定 | `#submitBtn_{cls}` | `state.results[cls].length` 増加(次ラウンド組み合わせ生成) |
| ペアリング再生成 | `#repairBtn_{cls}` | `state.pairings[cls]` 内容変化 |
| 対戦相手変更保存 | `#chg-save` | `state.pairings[cls][i].p1/p2` 変化 |
| 過去対局勝者変更 | モーダル内勝者ボタン | `state.results[cls][rr][mm].winner` 変化 |
| 名前一括編集保存 | `#bulk-save` | `state.players[cls][i].name` 変化 |
| マスタ追加 | `#me-save`(新規時) | `master.members.length` 増加 |
| マスタ編集 | `#me-save`(既存 `data-mid` 付き) | `master.members[id]` の `name`/`yomi` 変化 |
| マスタ論理削除 | マスタ画面の削除ボタン | `master.members[id].deleted === true` + `deleted_at` 記録 |
| マスタインポート実行 | `#mi-run` | `master.members.length` 変化(マージ結果) |
| 大会データコピー | `#saveBtn` | クリップボード内容に `STORAGE_KEY` の JSON を含む |
| 読み込み実行(貼付) | `#load-from-paste` | `state` が読み込み内容で置換される |
| 読み込み実行(ファイル) | `#load-pick-file` | 同上 |
| リセット | `#resetBtn` | `state.players.A.length === 0 && B.length === 0 && started === false`、`shogi_v4` / `shogi_v3` キー削除 |
| 報告書ダウンロード | `#downloadReportBtn` | PDF Blob URL 生成または anchor download 属性発火 |

#### P1:表示状態・モーダル開閉の変化を検証すべき操作(Stage 2b 以降可)

| 操作 | DOM | primary assertion 例 |
|---|---|---|
| 過去参加者パネル開閉 | `#ppToggleBtn` | パネル DOM の display 変化 |
| 読み込みモーダル起動 | `#loadBtn` | `#load-paste-area` が visible |
| 読み込みモーダルキャンセル | `#load-cancel` | モーダル非表示 |
| 名前一括編集モーダル起動 | `#bulkEditA` / `#bulkEditB` | bulk edit modal 表示 |
| 対戦相手変更モーダル起動 | `#chgbtn_{cls}_{i}` | `#chg-p1` / `#chg-p2` が対象組の値で表示 |
| 過去対局編集モーダル起動 | `#editpast_{cls}_{rr}_{mm}` | `#ep-p1` / `#ep-p2` が対象対局の値で表示 |
| マスタインポートモーダル起動 | `#masterImportBtn` | `#mi-paste-area` 表示 |
| 削除済み一覧表示切替 | `#masterShowDeletedBtn` | 削除済み行の表示状態変化 |
| マスタ編集モーダル起動 | マスタ画面の行クリック | `#me-name` / `#me-yomi` が対象値で表示、`data-mid` セット |
| モーダルキャンセル各種 | `#me-cancel` / `#mi-cancel` / `#mig-cancel` / `#yomi-cancel` / `#ep-cancel` / `#bulk-cancel` / `#chg-cancel` 等 | 対象モーダル非表示 |
| マスタエクスポート | `#masterExportBtn` | クリップボード内容に `schema_version` と `members` を含む JSON |

#### P2:自動検証困難または環境依存(Stage 2a で stub/spy 方針明記)

| 操作 | DOM | 検証方針 |
|---|---|---|
| 印刷/PDF 保存 | `printResults()` 呼出ボタン | `window.print` を spy 化、または PDF Blob 生成検証 |
| ファイル選択ダイアログ | `#mi-file` / `#load-pick-file` | Playwright `setInputFiles` で代替 |
| クリップボード書き込み | `#saveBtn` / `#masterExportBtn` | browser permission を context で grant、`navigator.clipboard.readText()` で検証 |

---

## 2. ユーザージャーニー

### 2.1 ジャーニー A:受付〜対局開始(大会当日 09:00〜09:30)

```
[副幹事の端末]
  参加者登録タブを開く
    ↓
  ① 過去参加者パネル開く(#ppToggleBtn)
    → master.members から候補表示
    → 該当者の .pp-add-btn[data-cls="A"or"B"] クリック
    → state.players[cls] に追加、UI に表示
    ↓
  ② 新規参加者は #inp-name + #inp-yomi + #inp-class 入力 → #addBtn
    → ふりがな未入力時は yomi-add モーダル経由でマスタ登録(A-3.5)
    ↓
  ③ 各 player 行の member/grade セレクトを実情に合わせて変更
    → member: 'member'(支部員) / 'other'(他支部)、デフォルト 'member'
    → grade : 'ippan'(一般) / 'chu'(中学生)、デフォルト 'ippan'
    ↓
  ④ 参加費確認(#fee-summary)
    → calcTotal() が A/B 全参加者の合計を表示
    → 受付係が徴収金額を確認、参加者から徴収
    ↓
  ⑤ A/B 各クラスが偶数人かつ最低 2 名揃ったら #startBtn
    → 奇数人のクラスがあれば showMsg で警告表示、開始拒否
       (運営者を追加して偶数化する運用)
    → 偶数なら第 1 ラウンドのペアリング自動生成
    → 対局管理タブへ自動遷移
```

**異常系**:
- 同一名重複 → `#reg-msg` にエラー表示(不変条件 INV-PL-1)
- 各クラス 2 名未満で `#startBtn` → エラー
- A or B が奇数人 → `showMsg('Aクラスが奇数です。運営者を追加してください', 'warn')` (line 2709-2710)、`state.started` は false のまま
- LocalStorage 容量超過 → `#saveBtn` 失敗時に `notifyError` 表示

### 2.2 ジャーニー B:対局結果入力〜次ラウンド(各ラウンド 30〜45 分)

```
[主幹事 or 副幹事の端末]
  対局管理タブ
    ↓
  ① 各組の勝者を #wb_{cls}_{i}_p1 or _p2 でクリック
    → ボタンに ▲勝 表示
    → state.results[cls][round][i].winner 確定
    ↓
  ② 全組の勝者入力完了後、#submitBtn_{cls} で確定
    → 次ラウンドのペアリング自動生成(バックトラッキング)
    → state.results[cls].length が現在ラウンド数を表す
    ↓
  ③ ペアリングが意図と合わない場合 #repairBtn_{cls}
    → 同一勝ち数グループ内シャッフル + バックトラッキング再試行
```

**前提**: 対局フェーズに入った時点で A/B 各クラスは偶数人保証(§2.1 ⑤ で前段ブロック)。BYE / 不戦勝の自動ロジックは**実装しない**(§8.2 永続見送り)。

**異常系**:
- 全組勝者未入力で確定 → 確定不可
- 同じ相手と複数回対戦 → バックトラッキングが回避(INV-PA-1)

### 2.3 ジャーニー C:過去対局結果の修正

```
対局管理タブの過去ラウンド表示
  ↓
#editpast_{cls}_{rr}_{mm} クリック
  → 勝者変更モーダル(#ep-p1 / #ep-p2 表示)
  → 勝者を変更(未入力に戻す機能は永続見送り、§8.2)
```

### 2.4 ジャーニー D:大会終了〜報告書出力(大会終了後 30 分)

```
最終結果タブ
  ↓
① 順位表示(PC: 表 / スマホ: カード形式)
  ↓
② 報告書フィールド入力
  #rep-date / #rep-place / #rep-start / #rep-end / #rep-sei / #rep-fuku / #rep-note
  → state.report オブジェクトに反映
  ↓
③ #downloadReportBtn
  → PDF 生成(jsPDF)
  → 月例運営報告書として支部へ提出
```

`state.report` 初期値は `{date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:''}` (normalizeState 内 base 定義より)。

### 2.5 ジャーニー E:マスタメンテナンス(不定期)

```
マスタタブ(#tab-master)
  ↓
① 検索(#pp-search)→ 表示中マスタ絞込
② 追加 → #me-name / #me-yomi / #me-save(新規)
③ 編集 → 既存行クリック → モーダル → #me-save(data-mid 付き)
④ 削除 → tombstone 化(master.members[id].deleted = true、deleted_at 記録)
⑤ #masterShowDeletedBtn → 削除済み一覧表示切替
⑥ #masterExportBtn → JSON 文字列クリップボードコピー
⑦ #masterImportBtn → 貼り付けマージ(既存側優先・tombstone OR ルール、A-3 実装済)
⑧ #masterMigrateBtn → 旧形式からの移行(永続見送り予定、現状はテキスト貼り付け方式)
```

### 2.6 ジャーニー F:中断・復旧

```
[中断時]
  #saveBtn → クリップボードに state JSON コピー → メール下書き等に退避
  
[復旧時]
  #loadBtn → 読み込みモーダル表示
    ↓
  ① ファイル経由:#load-pick-file
  ② テキスト貼り付け:#load-paste-area + #load-from-paste
    ↓
  state = normalizeState(parsed) で正規化済み state を復元
  自動的に適切なタブへ遷移(参加者登録 / 対局管理 / 最終結果)
  
[リセット時(注意)]
  #resetBtn → STORAGE_KEY('shogi_v4') + LEGACY_STORAGE_KEYS('shogi_v3') を削除
  → BRANCH_MASTER_KEY('shogi_branch_master') は温存(マスタは消えない)
```

---

## 3. 画面構成

`shogi_v4.html` は単一 HTML / 単一画面アプリ。共通ヘッダー + タブバー + 4 タブ構成。タブ切替は `showTab(name)` で実現。

| 領域 | DOM | 内容 |
|---|---|---|
| 共通ヘッダー | `.header`(line 89) | `<h1>` タイトル + 共通アクション 3 ボタン(`#saveBtn`/`#loadBtn`/`#resetBtn`)+ 隠し `#loadFile` input |
| タブバー | `.tab-bar.no-print`(line 100-103) | 4 タブボタン |
| タブ本体 | `#pane-{reg,tournament,result,master}` | 各タブの表示内容 |

| タブ | DOM ID | 関数引数 | 主目的 |
|---|---|---|---|
| 参加者登録 | `#tab-reg` | `'reg'` | 受付・参加者管理・大会開始 |
| 対局管理 | `#tab-tournament` | `'tournament'` | ペアリング表示・結果入力・確定・修正 |
| 最終結果 | `#tab-result` | `'result'` | 順位表示・報告書フィールド・PDF 出力 |
| マスタ | `#tab-master` | `'master'` | 過去参加者マスタの CRUD・エクスポート/インポート |

タブ切替実装:
- 関数定義:`shogi_v4.html:2131` `function showTab(t){...}`
- イベント登録:`shogi_v4.html:3736-3740`(tab-master のみ条件分岐)
- 自動遷移箇所:`startBtn` クリック後(→tournament)、読み込み完了時(state に応じて分岐)、リセット後(→reg)

ヘッダー・タブバーは `.no-print` クラスで印刷時に非表示。

---

## 4. データモデル

### 4.1 LocalStorage キー一覧

| キー | 定数名 | 内容 | 永続性 | リセット時 |
|---|---|---|---|---|
| `shogi_v4` | `STORAGE_KEY`(line 213) | 大会の全状態(参加者・ペアリング・結果・報告書) | 大会単位、`#saveBtn` でコピー退避 | **削除** |
| `shogi_v3` | `LEGACY_STORAGE_KEYS[0]`(line 214) | 旧版 state(レガシー、読み込みフォールバックのみ) | 復元時参照のみ、書き込み無し | **削除** |
| `shogi_branch_master` | `BRANCH_MASTER_KEY`(line 364) | 過去参加者マスタ | 永続(月例を跨ぐ) | **温存** |

復元順序:`STORAGE_KEY` → `LEGACY_STORAGE_KEYS[i]`(line 341)。
リセット動作:line 3636-3637 で `STORAGE_KEY` + `LEGACY_STORAGE_KEYS` を全削除、`BRANCH_MASTER_KEY` は手付かず。

`window._pendingNewYomi` / `_yomiManuallyEdited` 等の作業用 globals は永続化対象外。

### 4.2 state スキーマ(`shogi_v4` キー、normalizeState 通過後の保証構造)

`shogi_v4.html` line 204 で初期化、line 286 `normalizeState()` で常に正規化される。**state グローバル変数は normalizeState を通過した正規化済みオブジェクトであることが保証**(復元・読み込み・マイグレ全経路で適用)。

```javascript
state = {
  players: {
    A: [{ id, name, cls: 'A', member, grade, member_id? }],
    B: [{ id, name, cls: 'B', member, grade, member_id? }],
  },
  rounds: 4,                         // 予定ラウンド数(初期値)
  pairings: {
    A: [{ p1, p2, winner? }, ...],   // 現在ラウンドのペアリング(配列)
    B: [{ p1, p2, winner? }, ...],
  },
  results: {
    A: [[{ p1, p2, winner }, ...], ...],   // results[round][match]、確定済みラウンドのみ
    B: [[{ p1, p2, winner }, ...], ...],
  },
  started: false,                    // #startBtn で true
  report: {                          // 最終結果タブの報告書フィールド
    date: '',
    place: '労政会館',               // normalizeState 内 base のデフォルト
    start: '',
    end: '',
    sei: '',
    fuku: '',
    note: ''
  },
  tournament_id?: string             // 任意、マスタ統合時の鍵
}
```

**player 正規化の確定仕様**(normalizeState L286 内):
```javascript
var pp = {
  id: p.id || ('restored_' + cls + '_' + idx + '_' + Date.now()),
  name: String(p.name || ''),
  cls: cls,                          // 関数引数の cls を強制(外部入力無視)
  member: p.member === 'other' ? 'other' : 'member',  // 既定 'member'
  grade:  p.grade  === 'chu'   ? 'chu'   : 'ippan'    // 既定 'ippan'
};
if (typeof p.member_id === 'string' && p.member_id) pp.member_id = p.member_id;
```

特性:
- `cls` は配置先クラスから自動付与(`state.players.A[]` の要素は cls='A' 強制)
- `member` は 'member' / 'other' の 2 値のみ、'other' 以外は全て 'member' に正規化
- `grade` は 'ippan' / 'chu' の 2 値のみ、'chu' 以外は全て 'ippan' に正規化
- `member_id` は文字列かつ非空の場合のみ保持(欠損許容)
- `name` 空の player は `.filter(p => p.name)` で除外
- `id` 欠損時は `restored_{cls}_{idx}_{timestamp}` パターンで自動生成
- **player に `yomi` フィールドは保持しない**(yomi は master 側のみのフィールド)
- **`currentRound` フィールドは存在しない**(現在ラウンドは `state.results[cls].length` から導出)

**pairings / results の sanitize**:
`sanitizeMatch` 内で「実在 player id のみ許可、winner は p1/p2 のいずれかでなければ null」と厳格化される。これは INV-PA / INV-RE の根拠。

### 4.3 master スキーマ(`shogi_branch_master` キー)

```javascript
master = {
  schema_version: 1,
  updated_at: '2026-05-06T...',
  members: [
    {
      id,                         // 主キー
      name,                       // 表示名
      yomi,                       // ふりがな(A-2 で必須化)
      last_class,                 // 直近参加クラス('A' or 'B')
      last_attended_at,           // 直近参加日(ISO)
      attend_count,               // 累計参加回数
      deleted: false,             // tombstone フラグ
      deleted_at: null,           // tombstone 日時(A-3 で追加)
    },
    ...
  ],
}
```

**マージルール**(A-3 で確定):
- 既存側優先(`updated_at` 比較ではない)
- `deleted` は OR ルール(どちらか true なら削除扱い)

### 4.4 player ⇄ master の連携

- 参加者登録時、過去参加者パネル / サジェストから追加すると `players[].member_id` がセットされる
- 新規入力時は `member_id` 無し → 大会終了後に手動でマスタ登録される(A-3 のサジェスト未登録扱い)

**member_id 欠損時の扱い**(Contract Testing 設計指針):
- `member_id` は player の任意フィールド(normalizeState で必須化されていない)
- `member_id` がある場合、`master.members` に対応 id が存在することが望ましいが、**欠損は許容**(過去データ・新規入力・他端末から復元した state では常態)
- `member_id` 欠損を **merge blocker にしない**(大会運営中に master 整合性の厳格チェックで運営停止することを避ける)
- 厳格チェックが必要な場合は別フェーズ(マスタクリーンアップ機能等)で扱う

---

## 5. フィールド・コンポーネント一覧

### 5.0 共通ヘッダー(`.header`、line 89)

| ID | 種別 | 役割 |
|---|---|---|
| `#saveBtn` | button | 大会データをコピー(クリップボード退避) |
| `#loadBtn` | button | 読み込みモーダル起動 |
| `#loadFile` | input file (hidden) | ファイル選択ダイアログ用 |
| `#resetBtn` | button | 大会データ全消去(`shogi_v4` + `shogi_v3` 削除、`shogi_branch_master` 温存) |

ヘッダーはタブ切替に依存せず常時表示。`.no-print` クラスで印刷除外。

### 5.1 参加者登録タブ(`#pane-reg`)

| ID | 種別 | 役割 |
|---|---|---|
| `#ppToggleBtn` | button | 過去参加者パネル開閉 |
| `#pp-search` | input text | 過去参加者検索 |
| `#pp-hint` | div | サジェスト件数等のヒント表示 |
| `#inp-name` | input text | 参加者名 |
| `#inp-yomi` | input text | ふりがな |
| `#inp-class` | select | A / B クラス選択 |
| `#addBtn` | button | 参加者追加実行 |
| `#bulkEditA` / `#bulkEditB` | button | クラス別の名前一括編集モーダル起動 |
| `#startBtn` | button | 登録完了・対局開始 |
| `#a-list` / `#b-list` | tbody | 登録済み参加者表 |
| `#a-count` / `#b-count` | span | クラス別人数表示 |
| `#reg-msg` | div | エラー / 成功メッセージ |
| `#fee-summary` | div(line 145) | 参加費合計表示(`calcTotal()` の結果) |

**動的生成(class)**:
- `.pp-row`:過去参加者パネルの行
- `.pp-add-btn[data-cls="A"|"B"]`:パネル内の A/B クラス追加ボタン
- `.pp-last-class`:直近クラス表示
- `.suggest-item` / `.suggest-add-btn[data-cls]` / `.si-info` / `.si-meta`:入力中サジェスト
- `.player-row` / `.player-name`:登録済み参加者の行

**player 行の member/grade UI(暗黙の位置依存規約)**:
- 各 player 行に 2 つの `<select>` 要素が動的生成される
- **id / class なし**(grep で `sel-member` / `sel-grade` / `class="member"` / `class="grade"` 0 件確認)
- **位置依存セレクタ**:`row.locator('select').nth(0)` = member、`.nth(1)` = grade(Stage 1 偽陽性レポートの spec パターンと整合)
- Stage 2a 以降で `data-testid="player-member-select"` / `data-testid="player-grade-select"` への移行候補(A-T 仕様書 §4.3.7 で検討対象)

### 5.2 対局管理タブ(`#pane-tournament`、すべて動的生成)

| ID テンプレ | 役割 |
|---|---|
| `#wb_{cls}_{i}_p1` / `#wb_{cls}_{i}_p2` | 勝者ボタン(i = 組番号) |
| `#chgbtn_{cls}_{i}` | 対戦相手変更ボタン |
| `#chg-p1` / `#chg-p2` / `#chg-save` | 対戦相手変更モーダル |
| `#submitBtn_{cls}` | ラウンド確定ボタン |
| `#repairBtn_{cls}` | ペアリング再生成 |
| `#editpast_{cls}_{rr}_{mm}` | 過去対局編集 |
| `#ep-p1` / `#ep-p2` / `#ep-cancel` | 過去対局編集モーダル |
| `#bulk-name-{playerId}` / `#bulk-cancel` / `#bulk-save` | 名前一括編集モーダル |

### 5.3 最終結果タブ(`#pane-result`)

| ID | 役割 |
|---|---|
| `#rep-date` | 開催日 |
| `#rep-place` | 開催場所(初期値 '労政会館') |
| `#rep-start` / `#rep-end` | 開始・終了時刻 |
| `#rep-sei` / `#rep-fuku` | 主幹事・副幹事氏名 |
| `#rep-note` | 備考 |
| `#downloadReportBtn` | PDF 生成 |

順位表示は PC(表)・スマホ(カード)で切替(CSS media query)。

### 5.4 マスタタブ(`#pane-master`)

| ID | 役割 |
|---|---|
| `#masterMigrateBtn` | 旧形式マイグレ(永続見送り) |
| `#masterExportBtn` | JSON エクスポート |
| `#masterImportBtn` | 貼り付けマージインポート |
| `#masterShowDeletedBtn` | 削除済み一覧表示切替 |

**マスタ編集モーダル**:
- `#me-name` / `#me-yomi` / `#me-cancel` / `#me-save`(`data-mid` 属性で対象 ID 識別)

**マスタ取込モーダル**:
- `#mi-file` / `#mi-paste-area` / `#mi-cancel` / `#mi-run`
- `#mig-paste-area` / `#mig-cancel` / `#mig-run`

### 5.5 共通モーダル

**ふりがな未入力時**:`#yomi-cancel` / `#yomi-add`
**読み込み**:`#load-pick-file` / `#load-paste-area` / `#load-cancel` / `#load-from-paste`

---

## 6. データフロー

### 6.1 参加者追加(過去参加者経由)

```
[ユーザー] .pp-add-btn[data-cls="A"] クリック
  ↓
[ハンドラ] data-mid から master.members 検索
  ↓
state.players.A.push({id, name, cls:'A', member, grade, member_id})
  ↓
save() → localStorage.setItem('shogi_v4', JSON.stringify(state))
  ↓
renderRegList() → #a-list 再描画、#a-count 更新、#fee-summary 更新
```

### 6.2 ラウンド確定

```
[ユーザー] #submitBtn_A クリック
  ↓
state.pairings.A の全組の winner 検証
  ↓
state.results.A.push(state.pairings.A の確定スナップショット)
  → state.results.A.length が現在ラウンド数を表す
  ↓
generatePairing('A')  // バックトラッキングで次ラウンド生成
  ↓
state.pairings.A = 新ラウンドのペアリング配列
  ↓
save() → renderTournament()
```

### 6.3 大会データコピー(`#saveBtn`)

```
[ユーザー] #saveBtn クリック
  ↓
JSON.stringify(state)
  ↓
navigator.clipboard.writeText(...)
  ↓
notifySuccess('コピーしました')
```

### 6.4 読み込み(`#load-from-paste`)

```
[ユーザー] テキスト貼付 → #load-from-paste クリック
  ↓
JSON.parse(textareaValue) → loaded
  ↓
state = normalizeState(loaded)   // 常に正規化を通す(L3354)
  ↓
save()
  ↓
state.started かつ全ラウンド完了 → showTab('result')
state.started かつ進行中     → showTab('tournament')
それ以外                      → showTab('reg')
```

### 6.5 マスタ更新フロー(追加・編集・削除・インポート)

```
[追加]
#me-save(新規時) クリック
  ↓
normalizePersonName(#me-name) / normalizeYomi(#me-yomi)
  ↓
master.members.push({id, name, yomi, deleted:false, deleted_at:null, ...})
  ↓
master.updated_at = new Date().toISOString()
  ↓
saveBranchMaster() → localStorage.setItem('shogi_branch_master', ...)
  ↓
renderMaster() → マスタ一覧再描画

[編集]
既存行クリック → モーダル表示(data-mid セット)
  ↓
#me-save(既存時) → 対象 master.members[id] の name/yomi 更新
  ↓
master.updated_at 更新 → saveBranchMaster

[削除(論理)]
削除ボタン → master.members[id].deleted = true、deleted_at = ISO
  ↓
saveBranchMaster → renderMaster
  → 通常表示からは消える、#masterShowDeletedBtn で表示可能

[インポート]
#masterImportBtn → モーダル表示
  ↓
#mi-paste-area 入力 → #mi-run
  ↓
JSON.parse → 既存 master とマージ
  → 既存側優先(updated_at 比較ではない)
  → tombstone は OR ルール(どちらか true なら削除扱い)
  ↓
saveBranchMaster → renderMaster
```

---

## 7. 不変条件 / Contract

実装・テストの両方で守るべき制約。**Contract Testing で明文化**(v1.2.5 §13.4 推奨)。

### 7.1 参加者登録(INV-PL)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-PL-1 | 同一クラス内で同名(trim 後一致)の参加者は登録不可 | 登録試行後、`state.players[cls]` 内の `name` 重複が無いこと |
| INV-PL-2 | `state.players[cls][i].id` は一意 | 全 player の id を Set 化、サイズが配列長と一致 |
| INV-PL-3 | `state.players[cls][i].cls === cls`(自己整合性、normalizeState で強制) | クラス配列の全要素の `cls` が配列名と一致 |
| INV-PL-4 | 対局開始後(`state.started === true`)、参加者の追加・削除は不可 | started 後に `players[cls].length` が変化しないこと |
| INV-PL-5 | `member` は 'member' / 'other' の 2 値のみ(normalizeState 強制) | 全 player の `member` が 2 値のいずれか |
| INV-PL-6 | `grade` は 'ippan' / 'chu' の 2 値のみ(normalizeState 強制) | 全 player の `grade` が 2 値のいずれか |
| INV-PL-7 | `name` 空 player は filter で除外される | normalizeState 通過後、`players[cls].some(p => !p.name)` が false |

### 7.2 ペアリング(INV-PA)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-PA-1 | 同じ対戦カードはトーナメント内で重複不可(バックトラッキングで回避) | 全ラウンドの (p1, p2) ペアを正規化(順序無視)して Set 化、重複無し |
| INV-PA-2 | 自分自身との対戦は不可 | 全 match で `p1 !== p2` |
| INV-PA-3 | 対局フェーズに入った時点で A/B 各クラスは偶数人保証(§2.1 ⑤ で前段ブロック、BYE は実装しない) | started 後の `players[cls].length % 2 === 0` |
| INV-PA-4 | `state.pairings[cls]` の長さ × 2 === `state.players[cls].length` | 偶数人保証下で組数 × 2 が人数と一致 |
| INV-PA-5 | 全 match の `p1` / `p2` は実在する `state.players[cls][*].id` のいずれか(sanitizeMatch 強制) | 全 match の p1/p2 が players の id Set に含まれる |

### 7.3 マスタ(INV-MA)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-MA-1 | `master.members[].id` は一意 | id を Set 化、サイズが配列長と一致 |
| INV-MA-2 | 削除は論理削除のみ(`deleted: true` + `deleted_at` 記録、物理削除しない) | `deleted === true` の member は配列から消えていない、`deleted_at` 必須 |
| INV-MA-3 | マージ時は既存側優先 + tombstone は OR ルール | インポート前後で既存 member は変化しない、tombstone は片方 true で true |
| INV-MA-4 | `name` と `yomi` は必須(A-2 以降) | 全 member の name/yomi が非空文字列 |

### 7.4 結果データ(INV-RE)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-RE-1 | `state.results[cls][round][i].winner` は `null` または `state.players[cls][*].id` のいずれか(sanitizeMatch 強制) | winner が null または players id Set 内 |
| INV-RE-2 | `winner` は同じ match の `p1` / `p2` のいずれかでなければ null 化される(sanitizeMatch 強制) | winner が p1/p2 のいずれか、または null |
| INV-RE-3 | ラウンド確定後(`results[cls].length > round`)、`results[cls][round]` の全要素に winner が入っている | 確定済みラウンドの全 match で winner !== null |

### 7.5 参加費・会計(INV-FE)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-FE-1 | `getFee(member, grade)` は表 §1.4 の 4 区分通り | 4 組み合わせで期待値と一致(0/500/500/1000) |
| INV-FE-2 | `calcTotal()` は `state.players.A.concat(B)` 全員の `getFee()` 合計と一致 | 手動合計と calcTotal() の戻り値が一致 |
| INV-FE-3 | `#fee-summary` の表示は `calcTotal()` の戻り値と一致 | DOM textContent と calcTotal() が一致 |

### 7.6 報告書・最終結果(INV-RP)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-RP-1 | `state.report` は `date / place / start / end / sei / fuku / note` の 7 文字列フィールドのみ | キーセットが上記 7 つと一致、全て string 型 |
| INV-RP-2 | PDF 出力時の参加者数・順位・会計合計は state から再計算した値と一致 | PDF 内容を OCR またはテキスト抽出後、state からの再計算値と一致 |

### 7.7 LocalStorage・読み込み復旧(INV-ST)

| ID | 制約 | 検証方法 |
|---|---|---|
| INV-ST-1 | 読み込み後の state は `normalizeState()` を通過している(L3354) | 読み込み後の state が §4.2 の保証スキーマに準拠 |
| INV-ST-2 | `STORAGE_KEY` 不在時は `LEGACY_STORAGE_KEYS` から読み込み試行(L341) | shogi_v4 削除 + shogi_v3 設定の状態で、shogi_v3 が読み込まれる |
| INV-ST-3 | 不正 winner(p1/p2 と一致しない値)は読み込み時に null 化される | 不正 state を投入後、normalizeState 通過後の winner 検証 |
| INV-ST-4 | `#resetBtn` は `STORAGE_KEY` + `LEGACY_STORAGE_KEYS` のみ削除、`BRANCH_MASTER_KEY` は温存(L3636-3637) | リセット後に `localStorage.getItem('shogi_branch_master')` が残存 |

---

## 8. 既知の制約と永続見送り判断

### 8.1 既知のバグ・制約

| 項目 | 状態 | バックログ |
|---|---|---|
| iPhone 16 Plus でのスマホ UI 揺れ | 未修正 | A-4.1 |
| iOS Safari 印刷警告(誤検知) | 観察継続 | A-4 バックログ |
| A-4.2 A/B クラスボタンが実機で動作しない | リグレッション混入(commit 73961d3) | A-T Stage 4 で最小再現テスト作成、後続フェーズで hotfix |
| player 行の member/grade セレクトに id/class が無い(位置依存セレクタ) | 暫定運用 | Stage 2a 以降で `data-testid` 化検討 |

### 8.2 永続見送り(実装しない)

- ローマ字検索(ふりがなで十分と判断)
- ふりがな自動推定
- 異体字自動統合
- 半角カナ対応
- 「未入力に戻す」機能(勝者変更のみで運用可能)
- ネイティブアプリ化(PWA で十分)
- **BYE / 不戦勝の自動ロジック**(奇数人数は `#startBtn` で前段ブロック + 運営者追加で偶数化、line 2709-2710)

---

## 9. 開発ガイダンス(仕様書・テスト作成者向け)

### 9.1 フェーズ仕様書 §0 ユーザーストーリーの書き方

各フェーズ仕様書 §0 では、本文書 §2 のジャーニーを参照しつつ、フェーズで変更される具体的なステップを明記する。例:

> 本フェーズで変更するのはジャーニー A(受付)のステップ ②(新規参加者入力)。`#inp-name` 入力中のサジェスト動作を強化し、過去マスタからの member_id 自動補完を実現する。

### 9.2 テスト作成時の参照点

- **primary semantic assertion**:§1.5 の P0/P1/P2 表が起点。全ての UI 重要操作のクリックは `clickAndExpectChange` 経由で primary assertion を宣言する(v1.2.5 §2.2 L4、A-T spec v1.3 §4.3)。P0 は Stage 2a で必須化、P1 は Stage 2b 以降、P2 は stub/spy 方針明記
- **不変条件**:§7 の各 INV-* を Contract Testing で検証。検証方法列を起点にテストケース作成
- **Mutation Testing**:§7 の不変条件を mutate して、テストが赤になることを確認(偽陽性テスト排除)
- **state スキーマ**:§4.2 の確定スキーマを唯一の真実とする。memory・推測で書かない

### 9.3 本文書の更新トリガー

| トリガー | 更新対象セクション |
|---|---|
| 新タブ・新画面追加 | §3, §5 |
| 共通ヘッダー要素追加 | §5.0 |
| LocalStorage キー追加・削除 | §4.1 |
| state / master スキーマ変更 | §4.2, §4.3 |
| 業務フロー変更 | §2 該当ジャーニー |
| 新しい不変条件発見 | §7 |
| **UI 重要操作を追加・削除・変更** | §1.5 |
| **primary assertion を追加・変更** | §1.5, §9.2 |
| **`clickAndExpectChange` 対象操作が増加** | §1.5 |
| **Contract Testing の対象が増加** | §7 |
| **player / master / report のフィールド追加** | §4, §5, §7 |
| **報告書出力項目変更** | §2.4, §5.3, §7 |
| **参加費体系変更** | §1.4, §7.5 |
| 永続見送り判断 | §8.2 |

仕様書 §0 で本文書のセクション参照を必須とする。**仕様書だけ更新して本文書を放置することは禁止**。本文書を修正せずに実装を変更した場合は、後続レビュー(ChatGPT / Codex)で必ず指摘されること。

### 9.4 本文書の更新プロセス

1. 実装変更が決まったタイミングで本文書のドラフト修正
2. 実装と本文書の整合性を grep で確認(memory・推測で書かない)
3. ChatGPT による独立レビュー(B+ 以下なら再修正)
4. A- 以上で commit、main マージ

---

## 10. 参照

- DevSecOps 運用方針 v1.2.5(shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`)
- A-T 仕様書 v1.3(`docs/specs/20260506_0045_shogi_at_spec_v1_3.md`、feat/phase-a-t-test-hardening ブランチ)
- A-T Stage 1 完了レポート(`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`、feat/phase-a-t-test-hardening ブランチ)
- ロードマップ v16(`docs/specs/20260505_1500_shogi_roadmap.md`、main)
- A-7/A-8/A-9 設計メモ(`docs/specs/20260505_1938_shogi_a7_a8_a9_design_memo.md`、main)

---

**END**
