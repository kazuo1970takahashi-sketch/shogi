# SAVE-UX-STATUS-INDICATOR 設計書

- 作成日: 2026-05-13
- Task ID: `SAVE-UX-STATUS-INDICATOR-DESIGN`
- 対象 main HEAD: `2789fa2`（PR #66 squash 後）
- 種別: **docs-only**。本タスクで実装は行わない。
- 後続実装タスク: `SAVE-UX-STATUS-INDICATOR-IMPL`

---

## 1. 目的とスコープ

SAVE-UX-DESIGN §3.3 で定義した **Level 2 保存状態 indicator** の設計方針を確定する。

### 本タスクの位置づけ

- 本タスクは **docs-only**。indicator UI / state / helper はすべて未実装
- 実装は次タスク **`SAVE-UX-STATUS-INDICATOR-IMPL`** で扱う
- 本書は IMPL の仕様前提となるため `docs/specs/` 配下に配置（STATUS-MAP が `docs/notes/` 配下なのと対称的）

### 本タスクで変更しないファイル

- `shogi_v4.html`
- `test/` 配下すべて（`test/run_tests.sh` 含む）
- `docs/specs/20260513_shogi_save_ux_design.md`（SAVE-UX-DESIGN 本体）
- `docs/notes/20260513_shogi_save_ux_status_map.md`（STATUS-MAP）
- `.github/workflows/`
- `package.json` / `package-lock.json`

### 参照済 PR

| PR | Task ID | Status |
|---|---|---|
| [#59](https://github.com/kazuo1970takahashi-sketch/shogi/pull/59) | A-5.1-CLOSURE | Merged |
| [#60](https://github.com/kazuo1970takahashi-sketch/shogi/pull/60) | MASTER-V2-LASTCLASS-DESIGN | Merged |
| [#61](https://github.com/kazuo1970takahashi-sketch/shogi/pull/61) | MASTER-V2-LASTCLASS-IMPL | Merged |
| [#62](https://github.com/kazuo1970takahashi-sketch/shogi/pull/62) | SAVE-UX-DESIGN | Merged |
| [#63](https://github.com/kazuo1970takahashi-sketch/shogi/pull/63) | SAVE-UX-MIN-NOTIFY-001（S03/S05） | Merged |
| [#64](https://github.com/kazuo1970takahashi-sketch/shogi/pull/64) | SAVE-UX-STATUS-MAP | Merged |
| [#65](https://github.com/kazuo1970takahashi-sketch/shogi/pull/65) | SAVE-UX-MIN-NOTIFY-002（S22） | Merged |
| [#66](https://github.com/kazuo1970takahashi-sketch/shogi/pull/66) | SAVE-UX-WARN-HELPER | Merged |

---

## 2. Level 2 indicator の責務

### 中核原則との整合

SAVE-UX-DESIGN の中核原則:

> **「止めすぎず、見逃さず、当日は静かに、後で気づける」**

Level 2 indicator はこの原則の **「後で気づける」** 部分を担う。

### 通知レイヤの位置づけ

| Level | 役割 | 性質 |
|---|---|---|
| Level 1 `showMsg` / toast | **一時通知**（運営の集中を奪わず、その瞬間に「いま起きたよ」を出す） | 時間経過で消える / 既存 |
| **Level 2 indicator** | **累積状態表示**（後で気づける残像、N 件あるよ） | reload まで残る / 本書設計対象 |
| Level 3 persistent warning bar | 常時可視の警告（操作圧あり） | レイアウト影響あり / 後続 |
| Level 4 inline confirm / 手動 retry | 操作要求あり | 後続 |
| ~~Level 5 modal~~ | ~~運営停止~~ | **採用しない**（SAVE-UX-DESIGN §3.6） |

### indicator は「静かな残像」

- 操作を止めない
- modal / alert ではない
- warning bar ではない
- retry 導線ではない
- 「N 件あるよ」と控えめに残るだけ

### 必ず守る境界

- **Level 1 showMsg = 一時通知**（瞬間的、消える）
- **Level 2 indicator = 後で気づける累積状態表示**（残像、reload で消える）
- **Level 3 warning bar / Level 4 retry には踏み込まない**（後続タスクで扱う）

---

## 3. `#reg-msg` 可視性 limitation と解消方針

### 現状の limitation（PR #65 follow-up memo より）

S22（会員マスタ編集モーダル保存）の user-facing warn は既存 `showMsg(text, type)` 経由で `#reg-msg`（登録タブ内のメッセージエリア）に出る。

ただし:

- S22 は **master tab / master edit modal 操作中** の処理
- `#reg-msg` は登録タブ側に配置されているため、master タブ表示中は見えにくい / 即時視認しづらい可能性がある
- modal close → `renderMasterTab()` → `renderPastParticipantsPanel()` の流れの中で `#reg-msg` に書かれた warn は、運営者がそのフレームで気づかない可能性がある

### indicator による解消方針

Level 2 indicator はこの **空間的・時間的 limitation を補う**:

- **空間的**: タブ横断で見える位置に配置する（§4 参照）
- **時間的**: 一時消滅する toast と違い、reload まで残るので「あとで気づける」

### `showMsg` との関係

- `showMsg` 自体は **維持する**（その瞬間に「いま起きた」を伝える役目）
- indicator は `showMsg` の **代替ではなく補完**
- 両方を出すことで「いま気づく機会」+「あとで気づく機会」を両立する

---

## 4. UI 配置方針

### 候補

#### 第 1 候補（本命）: タブバー右端 / タブバー近くの status pill

理由:

- タブ横断で見えるため、master タブ操作中でも視界に入りやすい（`#reg-msg` limitation を補える）
- 既存 UI への影響が比較的小さい想定
- スマホ運用の主動線（タブ切替）に乗っている

#### 第 2 候補（fallback）: 画面上部固定ヘッダー領域

理由:

- 常時可視性は高い
- ただし既存ヘッダーがない場合、新規追加の影響が大きい
- スマホで画面高を圧迫する懸念

#### 第 3 候補（低優先）: footer / status area

理由:

- 邪魔にならない
- ただし視認性が下がる
- スマホ運用で画面下部が見えにくい場面もある

### 設計判断

- **本書では第 1 候補（タブバー近く status pill）を本命**、第 2 候補を fallback、第 3 候補を低優先として整理
- **実装 PR（IMPL）着手時に既存 HTML 構造を確認して最終確定する**（仮置きでなく、現コード base で配置を決める）

### 配置制約（Level 2 共通）

- **スマホ表示でタブバーを圧迫しないこと**（pill サイズ / position をスマホ幅で調整可能にする）
- **初期 Level 2 ではタップ不可 / 装飾のみ**
- 詳細展開 / クリック操作は **Level 3 / Level 4 で検討**（本書スコープ外）

---

## 5. 表示内容

### 推奨文言

```
保存確認 N件
```

### 設計理由

- 「**保存警告**」より「**保存確認**」の方が当日運営で不安を煽りにくい
- 「警告」は「何かまずいことが起きた」という強い語感、「確認」は「あとで見ておいて」という控えめな語感
- 中核原則「当日は静かに」と整合

### 表示要素

| 要素 | 出すか | 理由 |
|---|---|---|
| 件数 (`N`) | **出す** | 累積状態の唯一の指標 |
| field 名 | **出さない** | user-facing 情報過多。debug は console.warn 側に残す |
| callsiteId（S03 / S05 / S22） | **出さない** | 同上 |
| 最終発生時刻 | **出さない** | 初期 Level 2 では不要 |
| 詳細展開 | **しない** | クリック操作なし（§4 参照） |

### N=0 のときの扱い

- **N=0 のときは indicator 非表示**
- 「保存確認 0 件」は表示しない（運営者の視覚負荷を増やさない）
- DOM 上は要素を残してもよいが、CSS で非表示（`display:none` 等）にする

### アイコン

- 候補: ⚠ / ⓘ
- ⚠ は強い警告感、ⓘ は中立的・情報的
- **最終的なアイコン選択は IMPL 着手時に既存 UI との視認性を見て決める**（アイコンなしという選択肢も含む）

### 詳細表示の方針（明記）

- **初期 Level 2 では field 名 / callsiteId / 件数以外の詳細は出さない**
- 詳細表示は **SAVE-FUTURE-REPORT** または Level 3 / Level 4 の後続で検討する

---

## 6. 状態管理

### 採用方針: **memory only**

| 保存先 | 採用 | 理由 |
|---|---|---|
| memory（JS 変数） | **採用** | reload で消える、副作用が他系へ及ばない |
| `localStorage` | **不採用** | §6.1 参照 |
| `sessionStorage` | **不採用** | localStorage と同じ性質の問題を持つ |
| tournament state | **不採用** | export / import で意図しない情報混入が起きる |

### 6.1 `localStorage` 不採用理由

- **メタ問題**: 保存失敗の警告を localStorage に保存しようとすると、localStorage 自体が保存失敗の対象になり得る（warning state そのものが永続化失敗する可能性）
- **export 混入**: tournament data の export / import で warning 履歴が混ざる
- **永続ログが必要なら別設計**: それは SAVE-FUTURE-REPORT / 保存ログ系の独立タスクとして扱うべき

### 6.2 reload で消える設計判断

- これは **意図的な設計**
- 「保存確認 N 件」の状態が無期限に残るより、reload で一度リセットされたほうが運営現場の負担が少ない
- 「reload を挟むタイミングで運営者が確認する」フローを暗黙的に想定

### 6.3 想定 state

```
saveWarningIndicatorState = {
  count: 0  // number
}
```

- 初期 Level 2 では **`count: number` のみ** を基本とする
- 将来 `history` / `lastAt` / `byCallsite` を持つ可能性はあるが、本書スコープ外（Level 3 / 4 / SAVE-FUTURE-REPORT で検討）

---

## 7. `notifySaveWarning` との接続

### 採用方針: 案 C

```
notifySaveWarning(opts)
  ↓
内部で recordSaveWarningForIndicator(opts) を呼ぶ
  ↓
updateSaveWarningIndicator() で DOM 反映
```

### 責務分離

| 関数 | 責務 |
|---|---|
| `notifySaveWarning` | Level 1 の窓口（既存）。`showMsg(warn)` + 総括 `console.warn` を呼ぶ。**internal で `recordSaveWarningForIndicator(opts)` も呼ぶ**（新設） |
| `recordSaveWarningForIndicator` | indicator state（memory）を更新する |
| `updateSaveWarningIndicator` | DOM を反映する（N=0 で非表示、N>0 で「保存確認 N 件」表示） |
| callsite（S03 / S05 / S22 等） | **基本変更しない**。helper を呼ぶだけで indicator にも反映される |

### 守る制約

- **`notifySaveWarning` の既存引数 schema は変更しない**（`message` / `consoleTag` / `callsiteId` / `fields` のまま）
- **callsite 側で別途 `updateSaveIndicator` を呼ばせない**（呼び忘れ防止のため helper 経由に集約）
- **`recordSaveWarningForIndicator` は例外を投げない**（`notifySaveWarning` の「例外を投げない」契約を壊さない）
- **helper の success 制御責務は引き続き持たない**（success showMsg 抑止は callsite 側の責務のまま、PR #63 / #65 で確立した設計を保護）

### 明記

- indicator への接続は **helper 内部** で行う
- callsite からは見えない（helper を呼ぶだけで indicator にも記録される）
- 既存の S03 / S05 / S22 の helper 呼び出しは変えない（行数差分ゼロを目標）

---

## 8. 対象 warning

### 初期対象（IMPL タスクのスコープ）

`notifySaveWarning` helper 経由の warn のみ:

| ID | callsite |
|---|---|
| S03 | `handlePastParticipantClassAdd` の既登録者クラス変更分岐 |
| S05 | `handleSuggestClassAdd` の既登録者クラス変更分岐 |
| S22 | `bindMasterEditModalEvents` の me-save click ハンドラ |

### 対象外（本書スコープ外）

| 系統 | 理由 |
|---|---|
| A-5.1 / SAVE 系 | まだ helper 化されていない。helper 置換後に自然に対象化される |
| MASTER-001 系 | 同上 |
| quota exceeded（`save()` catch → `notifyError`） | helper 経由でなく `notifyError` 経由。SAVE-UX-WARN-AGGREGATION で kind 分類後に検討 |
| JSON parse / localStorage 破損 | 同上 |
| duplicate 警告（S22 の `result.duplicateCount > 0`） | 別 kind の警告。SAVE-UX-WARN-AGGREGATION で扱う |
| import / merge / migration | 別トラック。SAVE-FUTURE-IMPORT |

### 将来拡張

- A-5.1 / SAVE 系 / MASTER-001 系を helper 経由に置換する後続タスク（例: SAVE-UX-WARN-HELPER 拡張）で **自然に indicator 対象化** される
- quota / duplicate / parse / 破損系は **SAVE-UX-WARN-AGGREGATION** で「kind 分類 + どこに集約するか」が決まってから検討
- import / merge / migration は **SAVE-FUTURE-IMPORT** の独立トラック

---

## 9. クリア条件

### 採用方針

| 条件 | 採否 |
|---|---|
| 自動消去 | **なし** |
| 手動クリア UI | **なし** |
| 保存成功で消去 | **しない** |
| 一定時間で消去 | **しない** |
| reload で消去 | **する**（memory only の自然な結果） |

### 設計理由

| 案 | 不採用理由 |
|---|---|
| 保存成功で消す | 別 entity の失敗履歴まで消え得る（S03 の last_class verify 失敗が S22 の保存成功で消えるのは不適切） |
| 一定時間で消す | 「後で気づける」原則に反する。N 分後に消えると見逃しが起きる |
| 手動クリア UI | 運営者の判断負担を増やす。初期 Level 2 は「静かな状態表示」に留める |

### 不安を煽らない工夫

- 文言は「**保存確認 N 件**」（「警告」「失敗」と書かない）
- 小さな pill / icon（画面を占有しない）
- 赤ではなく控えめな色（オレンジ / グレー寄りなど、IMPL で決定）
- N=0 は非表示

### クリア / 既読化の将来検討

- Level 3 / Level 4 で再検討（「既読」「無視して続行」などの操作系）
- 初期 Level 2 では作らない

---

## 10. Level 2 / 3 / 4 の境界

| 観点 | Level 1 | **Level 2（本書）** | Level 3 | Level 4 |
|---|---|---|---|---|
| 表示要素 | showMsg / toast | 小さな pill / icon + count | persistent warning bar | inline confirm / retry button |
| 通知性質 | 一時通知 | 累積状態表示 | 常時可視警告 | 操作要求 |
| 時間性 | 時間経過で消える | reload で消える | reload で消える（or 既読化） | 操作で消える |
| 操作要求 | なし | **なし** | 確認操作 / 既読化の可能性 | あり（retry 押下、確認、無視） |
| 画面幅占有 | なし（toast 領域のみ） | **なし（pill サイズのみ）** | あり（バー幅） | あり（inline 領域） |
| レイアウト影響 | なし | **なし（既存要素を押し下げない）** | あり | あり |
| 既存実装 | あり（PR #63 / #65 で Level 1 達成） | **未実装（IMPL タスクで導入予定）** | 未実装 | 未実装 |

### 今回の Level 2 制約（守るべき境界）

- **画面幅を占有しない**（pill サイズ、タブバー近く）
- **クリック操作を要求しない**（初期は装飾のみ）
- **既存要素を押し下げない**（レイアウト影響なし）
- **強い語気を使わない**（「警告」より「確認」）
- **retry 導線を出さない**（Level 4 の領域）
- **warning bar にしない**（Level 3 の領域）

---

## 11. 実装スコープ案: `SAVE-UX-STATUS-INDICATOR-IMPL`

### 想定 Task ID

`SAVE-UX-STATUS-INDICATOR-IMPL`

### 想定変更ファイル

- `shogi_v4.html`
- `test/test_master_v2_lastclass.js`（または indicator 用の適切な既存 test ファイル）

### 実装でやること

1. **indicator DOM 追加**: タブバー近くに pill 要素を 1 個追加（HTML）。初期表示は非表示
2. **memory state 追加**: `var saveWarningIndicatorState={count:0};` のような module-level state（grep しやすい命名）
3. **`recordSaveWarningForIndicator(opts)` 追加**: state を increment する関数
4. **`updateSaveWarningIndicator()` 追加**: DOM を反映する関数（N=0 で非表示、N>0 で「保存確認 N 件」表示）
5. **`notifySaveWarning` から `recordSaveWarningForIndicator(opts)` を呼ぶ**: helper 内部に 1 行追加。callsite 側不変
6. **テスト**:
   - S03 / S05 / S22 の helper 経由 warn が indicator count に反映されることを確認
   - N=0 で非表示、N>0 で「保存確認 N 件」が表示されることを確認
   - 既存 final innerHTML テストが維持されることを確認
   - reload で消えることを明示的にテストするか（IMPL 着手時に判断）

### 実装でやらないこと

- localStorage 保存
- tournament state 保存
- sessionStorage 保存
- クリア UI
- 詳細展開（field 名、callsiteId 表示）
- warning bar 化
- retry / inline confirm
- modal / alert
- quota / duplicate / parse 対応
- A-5.1 / MASTER-001 系の helper 置換（別タスク）

---

## 12. 既存テスト・既存挙動への影響範囲

### 維持すること

- 既存 `showMsg` の挙動は変えない
- `#reg-msg` の表示は維持（indicator は補完）
- S03 / S05 / S22 の **final innerHTML テスト** は維持（PR #63 / #65 で確立）
- `notifySaveWarning` の引数 schema 不変
- `notifySaveWarning` の「例外を投げない」契約不変
- `notifySaveWarning` の戻り値 void 不変
- callsite 側の success showMsg 抑止構造不変

### 拡張する可能性

- `notifySaveWarning` の単体テスト（SECTION 8 in `test/test_master_v2_lastclass.js`）に **indicator state 更新** の確認を追加
- S03 / S05 / S22 の統合テストに **indicator count 反映** の確認を追加

### test fixture への追加

- mock document に indicator DOM 要素（仮: `#save-warn-indicator`）を最小追加する可能性
- 既存の `makeContext` の `getElementById` lazy 生成で吸収できる場合もある（IMPL 着手時に判断）

---

## 13. 未決事項：IMPL 着手時に確認すること

実装着手時に **コード上で確認** すべき事項:

1. **既存タブバー DOM 構造**: タブバーの HTML / CSS を確認し、`#save-warn-indicator` の挿入位置を決める
2. **indicator を挿入する正確な位置**: タブバーの右端か、タブバー外側の status area か
3. **スマホ表示時の最大幅**: pill が画面幅を圧迫しないか、必要なら省略表示（"N+" など）にするか
4. **アイコン選択**: ⚠ / ⓘ / なし、のいずれにするか（視認性 vs 不安喚起のバランス）
5. **色・スタイル**: 既存 CSS との整合（赤系を避ける、控えめなオレンジ or グレー寄りなど）
6. **test fixture で indicator DOM をどう表現するか**: 既存 mock の `getElementById` で吸収できるか、専用要素を追加するか
7. **`recordSaveWarningForIndicator` のテスト方法**: 単体で count を assert するか、`notifySaveWarning` 経由で間接的に assert するか
8. **helper 経由 warn が複数回発生したとき count が増えるか**: 想定通り N+1 になるテスト
9. **reload で消えることを明示的にテストするか**: テスト環境では `loadEnv` を再呼出すれば確認できる
10. **alert / modal を追加しないことの確認**: IMPL の diff で `alert(` / `confirm(` の追加がないことを grep で確認

---

## 14. Codex / cowork レビュー観点

本設計書を独立レビューする際の観点:

1. **Level 2 indicator の責務が明確か** — §2 で「静かな残像」「累積状態表示」の定義が一意に読めるか
2. **Level 1 showMsg / Level 3 warning bar / Level 4 retry と分離されているか** — §10 の境界表が網羅的か
3. **`#reg-msg` 可視性 limitation の解消方針が明確か** — §3 で「補完であり代替ではない」が読み取れるか
4. **UI 配置候補が現場運営と整合するか** — §4 第 1 候補（タブバー近く status pill）がスマホ運用 / 既存 UI 影響と矛盾しないか
5. **表示文言が不安を煽りすぎないか** — §5 「保存確認 N 件」の選択が現場運営で受容可能か
6. **N=0 非表示が明記されているか** — §5 で明記
7. **memory only の判断が妥当か** — §6.1 / §6.2 で localStorage / sessionStorage / tournament state を不採用とした理由が読み取れるか
8. **localStorage / tournament state に進んでいないか** — §6 の方針が後続タスクへの safe boundary になっているか
9. **`notifySaveWarning` との接続方針が妥当か** — §7 案 C（helper 内部で `recordSaveWarningForIndicator(opts)` を呼ぶ）が責務分離として自然か
10. **helper 引数 schema を変えない方針が妥当か** — §7 / §11 で明記、既存テストへの影響最小化
11. **対象 warning が helper 経由に限定されているか** — §8 で対象 / 対象外を分離
12. **quota / duplicate / parse / import 系に踏み込んでいないか** — §8 で SAVE-UX-WARN-AGGREGATION / SAVE-FUTURE-IMPORT に切り出し
13. **クリア条件が Level 2 として過剰でないか** — §9 で自動消去 / 手動 UI なしの判断理由が読み取れるか
14. **Level 2 / 3 / 4 の境界が明確か** — §10 の表で網羅
15. **IMPL への引き継ぎが十分か** — §11 / §13 で実装着手時の判断材料が揃っているか
16. **docs-only が守られているか** — `shogi_v4.html` / test / workflow / package 系 / 既存 SAVE-UX-DESIGN / STATUS-MAP に変更がないか

### 判定基準

- **A**: 全観点クリア。SAVE-UX-STATUS-INDICATOR-IMPL 起票に進める
- **Conditional**: 軽微な指摘あり。修正後再レビューで IMPL 起票可
- **No Go**: 設計乖離 / 中核原則違反 / 既存 PR との矛盾あり。修正必須

---

## 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | v0 作成。Level 2 保存状態 indicator の設計確定。UI 配置 / 表示内容 / 状態管理（memory only）/ `notifySaveWarning` 接続（案 C）/ 対象 warning / クリア条件 / Level 2/3/4 境界 / IMPL スコープ案 / 未決事項 / レビュー観点 を整理。実装は SAVE-UX-STATUS-INDICATOR-IMPL で別タスク。 |
