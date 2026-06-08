# SHOGI-TOUR-APPHQ-003H-2-D — members 形式 参加者候補マスタ読込 検証 & 6/14 運用手順

対象: `shogi_v4.html`（将棋大会運営アプリ本体）
目的: 人間側が用意済みの **members 形式 参加者候補マスタ JSON** を「当日参加者一覧」ではなく
**「参加者候補マスタ」** として安全に読み込めるかを確認し、必要最小限の整備を行う。

> **重要方針（本ドキュメント・PR 全体）**
> 実名・実参加者名・実マスタ JSON は commit / PR 本文 / docs / test / fixture / コメントに**一切含めない**。
> 本書の例はすべて完全架空（`架空 …` / `Dummy …` / `example.invalid`）。

---

## 1. 結論

- **members 形式の参加者候補マスタ読込は既に実装済み**で、読込先は **候補マスタ**
  （localStorage `shogi_branch_master`）。当日参加者一覧（`shogi_v4` の `state.players`）ではない。
- 読込で **pairings / results / round / started / class started を変更しない**
  （別 localStorage キーで完全分離。インポート経路は大会 state に触れない）。
- 読込結果は **localStorage に保存され、翌日 URL を開いても残る**。
- **既存大会データを上書きする危険はない**（大会 state は非接触）。マスタ自体の上書きには既存の `confirm()` ガードあり。
- 必要だった最小修正は **`member` 真偽値（true/false）の正規化対応 1 点のみ**。その他は検証テスト・文言・安全策の追加。

→ **停止条件（当日参加者自動登録になる構造しか取れない等）には該当せず、最小整備で完了。**

---

## 2. 確認結果（依頼「まず確認してほしいこと」1〜10）

| # | 確認項目 | 結果 | 根拠（`shogi_v4.html`） |
|---|---|---|---|
| 1 | マスタ JSON 読込機能はあるか | **あり**（「マスタをインポート」モーダル / ファイル・貼付 / 上書き・マージ） | `buildMasterImportModalHtml` / `runMasterImport` / `processMasterImportText` |
| 2 | 読込先は候補マスタか当日参加者一覧か | **候補マスタ**（`shogi_branch_master`） | `BRANCH_MASTER_KEY='shogi_branch_master'`、当日参加者は `STORAGE_KEY='shogi_v4'` の `state.players` |
| 3 | members 形式をそのまま読めるか | **読める**（`{schema_version,updated_at,members}` → `branch_master` 判定） | `detectImportFormat` / `normalizeBranchMaster` |
| 4 | 読めない場合の最小改修 | 構造は対応済み。`member` 真偽値のみ要対応 → **1 行修正で対応** | `normalizeBranchMaster` の member 変換 |
| 5 | pairings/results/round/started/class started を変更するか | **変更しない**（インポート経路は大会 state 非接触） | `processMasterImportText` は `saveBranchMaster`+`renderMasterTab` のみ |
| 6 | localStorage に保存されるか | **される** | `saveBranchMaster` → `localStorage.setItem('shogi_branch_master', …)` |
| 7 | 翌日 URL を開いて残るか | **残る**（localStorage 永続。実ブラウザ再読込 e2e で確認） | e2e `shogi_members_candidate_master.spec.js` |
| 8 | 既存大会データ上書きの危険 | **大会データはゼロリスク**。マスタ上書きには `confirm()` ガード、マージは非破壊 | `processMasterImportText` の overwrite 分岐 `confirm(...)` |
| 9 | name/yomi/last_class/member/grade/city/note 保持 | name/yomi/last_class/city/note/deleted は**保持**。member は修正で対応。grade は §5 参照 | `normalizeBranchMaster` |
| 10 | deleted=true を候補から除外できるか | **できる**（墓石は保持・候補に非表示） | `findMemberCandidates` が `m.deleted` を除外 |

### プライバシー上の好材料（禁止項目）
`normalizeBranchMaster` は **固定ホワイトリスト**で member を再構築する。
`address / 住所 / phone / tel / 電話番号 / email / mail / メール / birthday / birthdate / 生年月日 /
paymentHistory / 支払履歴 / pastResults / 過去成績` 等が入力 JSON にあっても**一切コピーされず、保存時に落ちる**。
（架空データで混入させても保存 JSON に残らないことを単体テスト G7 で確認。）

---

## 3. データ分離（なぜ大会進行を壊さないか）

```
localStorage
├─ shogi_v4            ← 大会 state（当日参加者 players / pairings / results / round / started / classes / report）
│                         ＝ 当日その場の進行データ。マスタ読込は触れない。
└─ shogi_branch_master ← 参加者候補マスタ（members[]）  ← members 形式 JSON はここに入る
                          ＝ 過去参加者の候補。受付で「過去参加者から選ぶ」の元データ。
```

- マスタ読込 = `shogi_branch_master` への書込のみ。
- **当日参加者になるのは別操作**：受付で運営者が候補パネルから 1 名ずつ選び、クラスを指定して
  `addPlayerFromMaster` で `state.players` に入れたときだけ。
  → **読込しただけでは誰も当日参加者にならない**（自動登録なし）。

---

## 4. members 形式 → 内部 member フィールドマッピング

入力（外部 members JSON、完全架空例）:

```json
{
  "schema_version": 1,
  "updated_at": "任意",
  "members": [
    { "id":"架空ID001","name":"架空 太郎","yomi":"かくう たろう","last_class":"A",
      "member":true,"grade":"二段","city":"架空市","note":"","deleted":false }
  ]
}
```

| 入力フィールド | 取込 | 内部表現 / 備考 |
|---|---|---|
| `id` | ✅ | 内部識別子として保持（マージは id 基準・既存側優先） |
| `name` | ✅ 必須 | 空 or 非文字列は取込まない（member ごと skip） |
| `yomi` | ✅ | そのまま保持（検索・50音タブ用） |
| `last_class` | ✅ | `'A'`/`'B'` のみ採用、他は `null`。受付でクラス選択時の初期候補 |
| `member` | ✅（**本PRで対応**） | `true`→`'member'`（支部員）/ `false`→`'other'`（一般）/ 未知→既定 `'member'` |
| `grade` | △ | アプリの `grade` は**会費区分**（`'ippan'`一般 / `'chu'`中学生以下）。段位（"二段"等）は別概念のため取込まず既定 `'ippan'`。段位を残すなら入力 `note` に入れる運用（§5） |
| `city` | ✅ | trim + 最大20文字（住所ではない地域補助情報） |
| `note` | ✅ | そのまま保持（補助情報） |
| `deleted` | ✅ | `true` は墓石として保持・候補に非表示 |
| `first_attended` / `last_attended` | △ | 入力にあれば保持（任意の受付フィルタ用）。**無ければ安全既定（本日）** |
| `attendance_count` | ❌（再計算） | 入力値は採らず `tournament_ids.length` で再計算 |
| `tournament_ids` | △ | 入力にあれば dedup 保持、無ければ `[]` |
| `deleted_at` | △ | 削除済みのみ文字列保持、非削除は `null` |
| `address`/`phone`/`email`/`birthday`/`paymentHistory`/`pastResults` 等 | ❌ | **ホワイトリスト外＝保存時に必ず落ちる** |

---

## 5. 既知の論点 / follow-up 候補（本PRでは未実施・要判断）

意味論上の論点が 2 点あり、いずれも**ソフトな好み**かつ後方互換/運用への影響があるため、
本PR（最小整備）では実装せず、判断を仰ぐ follow-up として明記する。

1. **`grade`（段位）の保持**
   アプリの `grade` は会費区分（一般/中学生）であり、段位（"二段"等）を入れる先がない。
   - 推奨運用: 段位を残したい場合は**外部 JSON の `note` に段位を入れる**（`note` はそのまま保持される）。
   - もし「段位専用フィールド」を新設するなら支部マスタのスキーマ拡張（スコープ外: 全面再設計）になるため別タスク。

2. **履歴項目（first_attended/last_attended/tournament_ids/deleted_at）の取込抑止**
   現状の共通 `normalizeBranchMaster` は、入力にあれば last/first_attended と tournament_ids を保持する
   （任意の受付フィルタ「前回参加」「3ヶ月以内」「常連」を支える / 無害）。
   - これを**候補マスタ取込時のみ強制ストリップ**したい場合、native のマスタ・バックアップ復元
     （端末移行で履歴を保持したいケース）と区別する必要があり、専用取込経路の追加になる。
   - 簡便な代替: **当日マスタ JSON 側で履歴欄を省く**だけで、アプリは安全既定（本日 / 0 / `[]`）で補完する。
     （履歴欄を持たない member が安全既定になることは単体テスト G5 で確認済み。）

> どちらも実装可能。必要なら follow-up PR として対応します。

---

## 6. 変更ファイル一覧（本PR）

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `shogi_v4.html` | 改修 | (a) `normalizeBranchMaster`：`member` 真偽値（true/false）正規化対応・後方互換。grade 段位非取込のコメント明記。(b) 上書き/マージ完了メッセージに「これは候補マスタです。受付時に『過去参加者から選ぶ』で当日参加者を選択してください。」を追記 |
| `.gitignore` | 安全策 | `data/`（実参加者マスタ置き場）を追加し、実データの誤コミットを防止 |
| `test/fixtures/import/branch_master_candidate_synthetic.json` | 新規 | 完全架空の members 形式候補マスタ fixture（5名・member true/false・deleted・grade段位・禁止項目注入を含む） |
| `test/test_members_candidate_master_import.js` | 新規 | Node 単体テスト（45 assert）。形式判定/読込先/フィールド保持/deleted除外/履歴非取込/マージ非破壊/禁止項目排除/架空のみ/confirmガード |
| `test/e2e/shogi_members_candidate_master.spec.js` | 新規 | 実ブラウザ e2e（2件）。候補マスタ保存・大会state不変・**再読込後も残る**・deleted候補非表示 |
| `test/run_tests.sh` | 結線 | 上記 Node 単体テストをスイートに追加 |
| `docs/operations/shogi_tour_apphq_003h2d_members_candidate_master_verification.md` | 新規 | 本書 |

---

## 7. テスト結果

- 既存スイート（`bash test/run_tests.sh shogi_v4.html`）：**PASS=96 / FAIL=0 / WARN=0**（新規単体テスト結線後）
- 新規 Node 単体テスト：**PASS 45 / FAIL 0**
- 既存 tracked e2e（`shogi_phase2_import_synthetic.spec.js`）：**3 passed**（本PRの変更後も維持）
- 新規 e2e（`shogi_members_candidate_master.spec.js`）：**2 passed**

---

## 8. 6/14 大会向け 人間側手順（runbook）

> 前提: 担当幹事の端末に、事前に候補マスタを読み込ませ、localStorage に保存された状態で当日を迎える。
> 実マスタ JSON は端末ローカル（`data/` 配下・gitignore 済み）に置き、リポジトリには入れない。

### A. 事前準備（前日まで・担当幹事の端末で 1 回）
1. 担当幹事の端末ブラウザで運営アプリ（`shogi_v4.html`）を開く。
2. 「マスタ」タブ →「マスタをインポート」を開く。
3. 用意済みの **members 形式 参加者候補マスタ JSON** を「① ファイル選択」または「② テキスト貼り付け」で投入。
4. インポート方式：
   - 端末が**初回（マスタ空）**なら **「このデータで上書き」** を選択（確認ダイアログで「OK」）。
   - 既にマスタがある端末なら **「既存マスタに追加（マージ）」**（id 一致は既存優先・非破壊）。
5. 「実行」→ 完了メッセージ
   「**参加者マスタを読み込みました（N名）。これは候補マスタです。受付時に『過去参加者から選ぶ』で当日参加者を選択してください。**」を確認。
6. （任意確認）一度アプリを閉じて開き直し、「マスタ」タブに人数が残っていること＝**翌日も残る**ことを確認。

> この時点では**まだ誰も当日参加者になっていない**。pairings/結果/ラウンドも生成されない。

### B. 当日（受付）
1. 「参加者登録」タブ →「過去参加者から選ぶ」を展開。
2. 来場した参加者を検索（漢字・ふりがな）/ 50音タブで絞り、**1 名ずつ選んでクラスを指定**して当日参加者に追加。
   - ここで初めて `state.players`（当日参加者）に入る。会費区分（支部員/一般・中学生以下）は候補マスタの値が初期値。
3. 新規（マスタに無い）参加者のみ手入力。
4. 偶数を確認し「登録完了・対局開始」。以降は通常運用（1回戦ペアリング自動生成 →…）。

### C. 注意
- 候補マスタの `member`（支部員/一般）は受付で当日参加者にコピーされ会費計算の初期値になる。
  当日その場で変更も可能。
- 候補マスタの読込は**大会データ（pairings/results/round/started）を一切作らない・変えない**。

---

## 9. 実名・実データ非混入の確認

- 本PRの差分（コード/テスト/fixture/docs/コメント/PR本文）は**完全架空データのみ**。
- 実マスタ `data/import/*.json` は `.gitignore` に追加済みで追跡対象外。
- 単体テスト G8 / e2e で「保存 member 名はすべて架空命名（`架空 …`）」「禁止項目の値が保存 JSON に残らない」を機械的に検証。
- 実名・実データが必要になる作業は本PRに含めない（停止条件遵守）。
