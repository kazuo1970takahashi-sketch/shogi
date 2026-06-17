# POST-225-FRP-REBASE-INVENTORY-001: FRP #222/#223 棚卸しと再設計方針

| 項目 | 値 |
|---|---|
| ID | POST-225-FRP-REBASE-INVENTORY-001 |
| 種別 | 棚卸し方針（docs-only） |
| 日付 | 2026-06-17 |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（`67e0b81`） |
| 前提 | PR #225（START-UX-CONSOLIDATE-001 実装）squash merge 済 |
| 状態 | Draft（本書は棚卸し方針のみ。実装は後続 FRP-DESIGN-002 / FRP-IMPL-002 で行う） |

> 本書は **docs-only**。`shogi_v4.html` / `index.html` / test / workflow は変更しない。
> PR #222 / #223 はこの PR で操作しない（close / Ready化 / merge / rebase は行わない）。

---

## 1. 背景: PR #225 が変えたもの

PR #225（START-UX-CONSOLIDATE-001）は 2026-06-17 に squash merge（`67e0b81`）した。  
主要変更点を整理する。

### #225 で撤去したもの（START-003 由来、受付タブの開始導線）

| 要素 | 変更 |
|---|---|
| `describeClassStartButton` | 撤去（kind → ボタン表示マッピング） |
| `buildClassStartConfirmMessage` | 撤去（受付タブ誤押下防止確認文言） |
| `renderClassStartButton` | 撤去（受付タブ クラス別開始ボタン描画） |
| `onClickClassStart` | 撤去（受付タブ開始 click ハンドラ） |
| `bindClassStartHandlers` | 撤去（受付タブ開始ボタン bind） |
| `regClassStartBtnId` | 撤去（受付タブ開始ボタン id 生成） |
| HTML `a-start-btn` / `b-start-btn` | 撤去（静的 DOM） |
| CSS `.reg-class-start*` | 撤去 |
| `renderRegList` 内の bind / render 呼出 | 撤去 |

### #225 で変更したもの（対局管理タブの開始導線強化）

| 要素 | 変更 |
|---|---|
| `#startBtn` click bind | `startTournament` → `goToTournamentFromReg`（ナビ専用化） |
| `#startBtn` 文言 | 「登録完了・対局開始」→「登録内容を確認して対局管理へ」 |
| `buildClassActionBarHtml` 一括開始ボタン文言 | 「を開始」→「全員で1局目を開始」 |
| 同ヘルプテキスト | 「※このクラスのみ後追い開始します」→「※このクラス内の全員で開始します（他クラスは開始しません）」 |
| `goToTournamentFromReg` | 新設（save() → showTab('tournament') のみ） |

### #225 で不変のもの（FRP に直接関係する要素）

- `validateStartableClass`（2名以上・偶数・未開始）：シグネチャ・条件・本体 **無改変**
- `startTournamentForClass(cls)`：無改変（`startBtnClass_{cls}` → この関数の経路が正規の開始導線）
- `generatePairing(cls)`：無改変
- `submitRound(cls)`：無改変（全員在籍 missing チェック維持）
- `state.pairings[cls]` / `state.results[cls]` / match オブジェクトスキーマ：無改変
- `renderTournament(cls)` 本体：FRP-IMPL-001 部分は非混入（#225 では触っていない）

---

## 2. PR #222（FRP-DESIGN-001）棚卸し

### 2.1 #225 後も有効な設計

| 設計要素 | 評価 | 理由 |
|---|---|---|
| §2 背景「同じ失敗を繰り返さないために」 | **有効**（ただし文言更新推奨） | #225 完了で「受付タブに開始導線を置かない」が実装レベルで確定した。背景に記載する反省は成立している |
| §3 スコープ（1局目のみ・対局管理タブ・クラス単位・append） | **有効** | #225 は開始UXの整理であり、FRP のスコープ定義に変更はない |
| §4 コード構造の整理 | **ほぼ有効**（注記追加推奨） | `startTournamentForClass` の文言が変わり「全員で1局目を開始」が正規導線になった。これは §4 の「`startTournamentForClass`＝全員一括開始」の記述と整合する。ただし旧文言参照は更新必要 |
| §5 採用方針（generatePairing 不使用・append専用 helper・startTournamentForClass 不流用） | **有効** | #225 後もこの方針は正しい |
| §6 推奨データフロー | **有効** | フロー自体（startClassPartial → started=true → 未割当表示 → append → submitRound）は不変。対局管理タブへの配置も #225 で確定した |
| §7 helper 設計案 | **有効** | `validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialPairs` / `appendFirstRoundPairs` / `buildFirstRoundPartialSectionHtml` のシグネチャ・責務・guard はすべて有効 |
| §8 UI 案「対局管理タブ内・受付タブには置かない」 | **有効かつ強化確定** | #225 により「受付タブに開始操作を置かない」が実装レベルで保証された。§8 の配置方針は完全に一致 |
| §9 奇数時（末尾1人待機）| **有効** | 変更なし |
| §10 再生成ボタン制御 | **有効** | `generatePairing` の振る舞いは不変。奇数で空になる危険も不変 |
| §11 保存検証作法 | **有効** | `notifySaveWarning` / `aggregateKey:'save-verify:core'` の作法は不変 |
| §12 テスト方針 | **有効** | 基本方針は変わらないが、run_tests.sh の baseline が `3b86edb` 時の 62/1/35 → #225 後は同じ 62/1/35（#225 は test_start_003 を stub 化し test_start_ux_consolidate_001 を追加。ファイル数は変わるがスコアは同じ） |
| §13 PR 分割案（IMPL-001/002/003）| **スライス構造は有効。番号は更新推奨** | 本棚卸し後に FRP-DESIGN-002 / FRP-IMPL-002/003/004 等へ番号を振り直す想定 |
| §14 受け入れ条件 | **有効** | 条件自体は不変 |

### 2.2 #225 後に更新が必要な設計

| 要素 | 問題 | 推奨対処 |
|---|---|---|
| §2 背景「現アプリ運用」の記述 | #222 執筆時点では受付タブに `#startBtn`（一括開始）+ `reg-class-start`（クラス別開始）が残存していたが、#225 で撤去済み | 新設計書では「#225 で解決済み」として文脈を更新 |
| `base` 参照（`3b86edb`） | #222 の base は `3b86edb`（#225 前）。現 orphan HEAD は `67e0b81` | 新設計書は **#226 merge 後の orphan HEAD** を base として作成する。`67e0b81` は #226 作成時点の HEAD であり、#226 squash merge 後は orphan HEAD が前進するため、次 PR の固定 base として `67e0b81` をそのまま使わない |
| `buildClassActionBarHtml` の文言参照 | 設計内でボタン文言を例示している箇所に「を開始」等の旧文言が残る可能性 | 新設計書で「全員で1局目を開始」に合わせる |
| HANDOFF.md | #222 は HANDOFF.md を新規作成する差分を持つ。現 orphan HEAD `67e0b81` にはすでに HANDOFF.md が存在（#225 が追加）。rebase すると conflict | 新 PR では HANDOFF.md を「新規作成」ではなく「追記」として扱う |

### 2.3 #222 のまま rebase して使うべきか

**No。新設計書（FRP-DESIGN-002）として作り直しを推奨する。**

理由：
1. docs-only のためコード差分はない。ファイルを更新してコピーすれば済む。
2. base が `3b86edb`（2 commits stale）のままでは新 orphan HEAD との系譜が混乱する。
3. HANDOFF.md の conflict は "新規作成 vs. 既存への追記" という構造的な違いがあり、rebase で解消しにくい。
4. 設計書の内容を更新する機会として新 PR を切る方が、設計の質・読みやすさが向上する。

---

## 3. PR #223（FRP-IMPL-001）棚卸し

### 3.1 再利用できる実装

以下の関数は **純追加（他関数に依存せず・#225 と衝突しない）** ため、コードをそのまま次 PR に持ち込める。

| 関数 | 評価 | 備考 |
|---|---|---|
| `validatePartialStartableClass(classInfo, playersForClass)` | **そのまま再利用可** | pure・state 非参照・偶数不要の部分開始判定。#225 の `validateStartableClass` 不変と整合 |
| `startClassPartial(cls)` | **そのまま再利用可** | `generatePairing` を呼ばない・`SAVE-FRP-001` 保存検証・unknown class 拒否。#225 で触れた関数と衝突しない |
| `getUnassignedFirstRoundPlayers(cls)` | **そのまま再利用可** | 派生・非保存。`results[cls].length===0` ゲート。entry_no 昇順。#225 では不存在 |
| `buildFirstRoundPartialSectionHtml(cls)` | **実装ロジックは再利用可（文言・コメント要更新）** | 表示専用・副作用なし。started かつ results 空 かつ 未割当>0 のときのみ中身を返す。escapeHtml 適用済み。ただし disabled ボタンの `title` / コメントに残る旧 PR 番号参照（「次PR（FRP-IMPL-002）」等）は、新しいスライス体系（FRP-IMPL-003 または「次スライス」等）に合わせて更新必須 |
| `bindClassActionBarEvents` 追加部分（`startBtnPartial_` bind） | **そのまま再利用可** | `bindClassActionBarEvents` 本体の末尾に追加するだけ。#225 は本体を変更していない |
| `renderTournament` 追加部分（`buildFirstRoundPartialSectionHtml` 呼び出し） | **そのまま再利用可** | `renderTournament` 本体に1行追加。#225 は `renderTournament` 本体を変更していない |
| `test/test_first_round_partial_001.js` | **大部分再利用可** | pure 関数（`validatePartialStartableClass` / `getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialSectionHtml`）のテストが主体。#225 で削除された関数を参照していない |

**再利用可能なテスト分類（test_first_round_partial_001.js 40 assert の想定内訳）：**

- V 系（`validatePartialStartableClass`）：純粋 pure テスト → **100% 再利用可**
- U 系（`getUnassignedFirstRoundPlayers`）：純粋 pure テスト → **100% 再利用可**
- P 系（`startClassPartial`）：mutate テスト。`generatePairing` 非呼び出しの検証は #225 後も成立 → **再利用可**
- D 系（`buildFirstRoundPartialSectionHtml` / 表示）：表示テスト。#225 で削除された関数（`renderClassStartButton` 等）を参照するテストがあれば要確認 → **要検証**
- S 系（`#startBtn` の既存挙動不変の回帰）：`#startBtn` の挙動は #225 で変わった（`startTournament` → `goToTournamentFromReg`）。旧挙動を assert するテストがあれば要修正 → **要確認・一部修正の可能性**

### 3.2 破棄または作り直し推奨の実装

| 要素 | 問題 | 対処 |
|---|---|---|
| `buildClassActionBarHtml` への `startBtnPartial_` 追加差分 | #223 の git patch は `"を開始"` / `"※このクラスのみ後追い開始します"` というコンテキスト行を参照する。#225 でこれらの文言が変更されたため、**そのまま rebase すると conflict** になる | 新 PR では #225 後の文言（`"全員で1局目を開始"` / `"※このクラス内の全員で開始します"`）を文脈として追加する。コード内容自体は同じ |
| `HANDOFF.md` 新規作成差分 | #222 と同様。#225 が HANDOFF.md を新規作成済みのため、#223 の「新規作成」差分が conflict | 新 PR では HANDOFF.md を追記として扱う |
| `test/run_tests.sh` 変更差分 | #225 は `test_start_003.js` を登録解除し `test_start_ux_consolidate_001.js` を登録した（+10/-7）。#223 は `test_first_round_partial_001.js` を追加する（+2行程度）。両方が run_tests.sh を変更するため、#225 後の run_tests.sh を土台にした追加が必要 | 新 PR では `67e0b81` 時点の run_tests.sh（#225 適用済み）の構成を確認した上で、該当セクションへ追加する。単純な「1行追加」と決め打ちしない |
| `docs/notes/20260617_frp_impl_001_result.md` | 結果メモ。内容的に問題ないが、PR 番号・base 参照が #223 のもの | 新 PR では不要（棚卸し文書が代替する）または更新して含める |

### 3.3 #223 のまま rebase して使うべきか

**No。新実装 PR（FRP-IMPL-002 相当）として作り直しを推奨する。**

理由：
1. `buildClassActionBarHtml` の conflict は1箇所・内容は自明だが、rebase で解消した履歴は「何を修正したか」が追いにくい。
2. run_tests.sh の変更は #225 後の状態を土台にした新しい差分を作る方が整合性が高い。
3. HANDOFF.md は「新規作成」から「追記」に変わるため、差分の性格が変わる。
4. `test/test_first_round_partial_001.js` の S 系テスト（`#startBtn` 挙動）を確認・修正するなら、新 PR で clean な状態から作るほうが安全。
5. #223 は「#225 前の受付タブ開始ボタンが残存する前提」で書かれたコメントが一部残る可能性がある（`buildClassActionBarHtml` 内のコメント等）。

**ただし**、`validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` の実装コードはそのままコピーして使える質にある（テスト 40 PASS、構造ガード完備）。`buildFirstRoundPartialSectionHtml` は構造・表示ロジックの多くを再利用できるが、disabled ボタンの `title` / コメント内の旧 PR 番号参照は新スライス体系に合わせた更新が必要であり、「そのまま」コピーでは文言が不正確になる。

---

## 4. 5択の検討: rebase / close / supersede / 保留 / 採用

| 選択肢 | 評価 |
|---|---|
| **A: rebase して再利用** | 各 conflict（HANDOFF.md・buildClassActionBarHtml・run_tests.sh）は解消可能だが、rebase 後の PR が「#225 前提のコメント混入」リスクを持つ。orphan 系統の clean な線形履歴を保つためには推奨しない |
| **B: close → 新 PR で作り直し（推奨）** | #222 の設計知見・#223 の実装コードをそれぞれ新 PR にコピー・更新して使う。clean base `67e0b81` から始まる新しい系譜になり、TOCTOU・conflict リスクが消える |
| **C: superseded コメントのみ・Draft 放置** | 後から見たとき混乱する（「この PR は使えるのか」が不明）。推奨しない |
| **D: close しない・保留継続** | 現在の状態。棚卸し結果が出た後も保留を続けることは「作り直し判断を先送りにしているだけ」になる |
| **E: そのまま Ready化・merge** | base が stale・conflict あり・前提ズレのため、そのまま merge は **禁止** |

**結論: B（close → 新 PR で作り直し）を推奨する。**

---

## 5. #222/#223 の処置案（結論）

### 5.1 PR #222（FRP-DESIGN-001）

**close 推奨**。以下の手順・条件を守ること：
1. **#226 merge 直後に即 close しない**。FRP-DESIGN-002 PR を作成してから close する。
2. close は **人間の明示指示後に実施**する（Claude が自律的に close しない）。
3. close コメントには **FRP-DESIGN-002 PR のリンクを含める**。後継 PR が存在しない段階では close しない。
4. 設計内容は FRP-DESIGN-002 に引き継ぐ（95% 再利用可）。

### 5.2 PR #223（FRP-IMPL-001）

**close 推奨**。以下の手順・条件を守ること：
1. **#226 merge 直後に即 close しない**。FRP-IMPL-002 PR を作成してから close する。
2. close は **人間の明示指示後に実施**する（Claude が自律的に close しない）。
3. close コメントには **FRP-IMPL-002 PR のリンクを含める**。後継 PR が存在しない段階では close しない。
4. `validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` の実装はそのまま FRP-IMPL-002 にコピーして利用する。`buildFirstRoundPartialSectionHtml` は構造・ロジックを再利用するが、disabled ボタンの旧 PR 番号参照（`title`・コメント）は新スライス体系に合わせて更新する。
5. test_first_round_partial_001.js の V 系・U 系・P 系は再利用。S 系は `#startBtn` の挙動変更に合わせて修正する。

---

## 6. 次に実装する場合の最小スコープ

**FRP-DESIGN-002**（docs-only 設計更新）と **FRP-IMPL-002**（部分開始 + 未割当一覧表示）に分割することを推奨する。

### FRP-DESIGN-002 の最小スコープ

- FRP-DESIGN-001 の設計内容を **#226 merge 後の orphan HEAD** を起点に更新した設計書（`67e0b81` は #226 作成時点の HEAD。#226 merge 後に orphan HEAD が前進するため、FRP-DESIGN-002 作成時に最新の orphan HEAD を確認する）
- 差分: §2 背景更新 / base 参照更新 / `buildClassActionBarHtml` 文言更新 / HANDOFF.md 追記
- 変更ファイル: `docs/specs/20260617_frp_design_002_first_round_partial.md`（新規）+ `HANDOFF.md`（追記）

### FRP-IMPL-002 の最小スコープ

FRP-DESIGN-001 §13 の「FRP-IMPL-001」相当。**選択者での append（FRP-IMPL-001 では disabled）はこの PR でもまだ行わない。**

追加する実装：
- `validatePartialStartableClass(classInfo, playersForClass)` — pure（#223 からコピー）
- `startClassPartial(cls)` — mutate（#223 からコピー）
- `getUnassignedFirstRoundPlayers(cls)` — 派生 pure（#223 からコピー）
- `buildFirstRoundPartialSectionHtml(cls)` — 表示専用（#223 から構造・ロジックを再利用。disabled ボタンの `title`・コメント内の旧 PR 番号参照は新スライス体系に合わせて更新する）
- `buildClassActionBarHtml` に `startBtnPartial_` 追加（#225 後の文脈で追加）
- `bindClassActionBarEvents` に `startBtnPartial_` bind 追加
- `renderTournament` に `buildFirstRoundPartialSectionHtml` 挿入

変更ファイル：
- `shogi_v4.html`（純追加、約 +130 行）
- `test/test_first_round_partial_002.js`（新規、#223 の test_first_round_partial_001.js を S 系修正して使用）
- `test/run_tests.sh`（#225 後の構成に合わせて、該当セクションへテストを登録する。単純な「1行追加」と決め打ちしない）
- `HANDOFF.md`（追記）

### やらないこと（FRP-IMPL-002 スコープ外）

- `appendFirstRoundPairs` の実装（append 作成は次スライス FRP-IMPL-003）
- `buildFirstRoundPartialPairs` の実装（同上）
- `buildCurrentPairingsHtml` の再生成ボタン制御（FRP-IMPL-003 以降）
- 2 局目以降の逐次手合い

#### 一時 UX について（FRP-IMPL-002 で意図的に許容するスライス状態）

部分開始ボタン（`startBtnPartial_`）を押した直後は `started=true` かつ `pairings[cls]=[]` の状態になる。このとき「1局目 未割当参加者」一覧には全クラス員が表示される（まだ誰も対局に割り当てられていないため）。この一時 UX は FRP-IMPL-002 の意図したスライスであり許容するが、以下の点に注意する：

- 運営者に「全員が未割当の部分開始中」であることが伝わる表示文言が必要
- 「選択者で1局目に追加」ボタンは FRP-IMPL-002 の段階では disabled のまま（FRP-IMPL-003 で対応）
- disabled ボタンの文言（「次 PR 対応」等）はリリース時に使用可能なアクションを示す文言へ更新する

---

## 7. 実装順序案

```
[現在] PR #225 MERGED (67e0b81) = 開始導線集約完了
  │
  ├── A: POST-225-FRP-REBASE-INVENTORY-001（本 PR / docs-only）
  │
  ├── B: FRP-DESIGN-002（docs-only 設計更新）
  │       設計書 docs/specs/20260617_frp_design_002_first_round_partial.md を新規作成
  │       base = #226 merge 後の orphan HEAD（#226 squash merge で orphan HEAD が前進する）
  │         ※ 67e0b81 は #226 作成時点の base HEAD。次 PR 作成時に
  │           `git rev-parse origin/chore/shogi-tour-apphq-003h-2d-orphan-clean-base` で確認する
  │
  └── C: FRP-IMPL-002（部分開始 + 未割当表示 土台）
          shogi_v4.html 純追加
          test_first_round_partial_002.js 新規
          base = FRP-DESIGN-002 merge 後の新 HEAD
            │
            └── D: FRP-IMPL-003（append 作成）
                    appendFirstRoundPairs / buildFirstRoundPartialPairs
                    base = FRP-IMPL-002 merge 後の新 HEAD
                      │
                      └── E: FRP-IMPL-004（再生成ボタン制御・エッジ整理）
                              未割当>0 で再生成非表示
                              base = FRP-IMPL-003 merge 後の新 HEAD
                                │
                                └── F: release PR（production 反映）
                                        base = production
```

なお、FRP-DESIGN-002 と FRP-IMPL-002 は設計の軽微な更新であれば 1 PR に統合することも可（ただし orphan 運用原則 docs-only / impl 分離を優先する）。

---

## 8. テスト観点

### 8.1 新規 FRP-IMPL-002 テストで確認すること

**純粋関数（V/U 系）**
- `validatePartialStartableClass`: 未開始1名→ok / 0名→skip-empty / 開始済み→skip-already-started / **偶数を要求しない**
- `getUnassignedFirstRoundPlayers`: pairings 在籍者を除外 / results 非空 → 空配列 / entry_no 昇順 / 削除者を返さない

**mutate（P 系）**
- `startClassPartial` 後: `started=true` / `pairings[cls]=[]` / `results[cls]=[]`
- `startClassPartial` が `generatePairing` を呼ばないこと（started 後も pairings 空のまま）
- 保存検証 warn が **persisted 側で `started=true` が確認できない場合に発火すること**（初期状態 `started=false` 自体を warn と混同しない。save が成功すれば persisted で `started=true` が確認できるため warn は発火しない。stub localStorage で save が届かない状態を作って検証する）
- unknown class では mutate しないこと

**表示（D 系）**
- 未開始クラスの action bar に `startBtnPartial_{cls}` が表示されること
- started かつ results 空 かつ 未割当>0 のとき `frp-partial-section` が表示されること
- started かつ results 空 かつ 未割当=0 のとき `frp-partial-section` が非表示であること
- started かつ results 非空のとき `frp-partial-section` が非表示であること
- 未割当リストの氏名が escapeHtml を通していること（XSS ガード）

**回帰（S 系）: #225 後の挙動に合わせて更新**

#223 の S 系テストには「旧 `#startBtn` 文言・旧 `startTournament` 経路の構造ガード」が含まれる。以下の方向で置き換える：

- **旧前提（#225 前）**: `#startBtn` → `startTournament()` → `generatePairing()` → round 作成・`started` 更新
- **新前提（#225 後）**: `#startBtn` → `goToTournamentFromReg()` → `save()` + タブ移動のみ（round 作成なし・`started` 更新なし）

更新後の検証項目：
- `#startBtn` 押下後、`state.pairings` / `state.results` / `classes[].started` / 互換 `state.started` が **変化しないこと**（開始系 state 不変）
- `#startBtn` 押下後、`generatePairing()` / `startTournament()` / `startTournamentForClass()` が **呼ばれないこと**
- `startBtnClass_A` の click が `startTournamentForClass('A')` を呼ぶこと（正規の開始導線は対局管理タブに集約）
- `submitRound` の missing チェックが不変であること（全員在籍まで次ラウンドへ進めない）
- `startBtnPartial_` を押しても `generatePairing` が呼ばれないこと

「`goToTournamentFromReg` を呼ぶこと」だけでなく、**参加者登録タブ側で round 作成・`started` 更新が起きないこと**を確認する検証に置き換える。

### 8.2 再利用可能なテスト（#223 から）

`test/test_first_round_partial_001.js` の以下グループは修正不要で再利用可能：
- V 系全体（`validatePartialStartableClass` pure）
- U 系全体（`getUnassignedFirstRoundPlayers` pure）
- P 系の大部分（`startClassPartial` mutate・`generatePairing` 非呼び出し検証）

修正が必要なもの：
- S 系の `#startBtn` 挙動チェック: 旧「`startTournament` を呼ぶ」→ 新「nav-only / state 不変（`startTournamentForClass` / `generatePairing` を呼ばない・`pairings` / `results` / `started` が変化しない）」の検証へ置換
- `buildClassActionBarHtml` の assert で旧文言（「を開始」等）を参照しているもの → 新文言（「全員で1局目を開始」等）に更新

---

## 9. 本番運営中に触ってはいけない危険箇所

FRP 実装時に特に注意が必要な危険箇所を列挙する。

### 9.1 `generatePairing(cls)` の奇数挙動

- **問題**: `generatePairing(cls)` は奇数人数で呼ぶと backtracking が最上位で失敗し `state.pairings[cls]` が **空配列**になる。
- **現状のガード**: `validateStartableClass` の偶数チェックにより `startTournamentForClass` 経路では未到達。
- **FRP での危険**: 部分開始状態（pairings に部分的な対局が入っている）で `generatePairing` を呼ぶと、**入力済み勝敗を含む既存対局が全部消える**。
- **FRP-IMPL-002/003/004 での必須ガード**: `startClassPartial` / `appendFirstRoundPairs` の経路で `generatePairing` を呼ばない。「組み合わせを再生成」ボタンを未割当>0 の部分手合い状態で非表示にする（FRP-IMPL-004 で対処）。

### 9.2 `submitRound(cls)` の missing チェック

- **挙動**: 登録者全員が `pairings` のどこかに在籍していないと 2 回戦へ進めない。
- **FRP での影響**: 奇数で1人待機中のままだと `submitRound` が通らない。運営者は最終的に全員を割り当てる必要がある。
- **ガード方針**: この動作は変えない。1 局目の部分手合い後に「まだ未割当者がいます」と表示して次の append を促す UI（FRP-IMPL-003/004）が必要。

### 9.3 `state.pairings[cls]` の上書き経路

- 既存で pairings を上書きする経路: `generatePairing`・`startTournamentForClass`・`resetClassForClass`。
- **FRP-IMPL では append のみ**。これら既存の上書き経路を FRP 状態で呼んではならない。
- `resetClassForClass(cls)` は pairings/results/started をリセットする。部分手合い状態でリセットを実行すると入力済み勝敗が消える（既存動作・FRP 追加のリスクではないが、UI の誤操作に注意）。

### 9.4 `normalizeState` の `lastModifiedBy` 処理

- `normalizeState` は `lastModifiedBy` を `'manual'` 以外は `'auto'` に補完する。
- append ペアの `lastModifiedBy='auto'` はこの補完で生き残る（独自値 `'partial'` 等は `'auto'` に潰れる）。
- **FRP 実装での注意**: append 時に `lastModifiedBy` に `'auto'` 以外の独自値を使わない。

### 9.5 `save-verify` の正引き比較

- `pairingsMatchSnapshot` は `p1/p2/winner` を比較し、両側存在時のみ `lastModifiedBy` も比較する。
- append 後の save-verify には `state.pairings[cls]` の snapshot（append 前後の全対局配列）を使う。
- `length` 一致だけでは stale を見逃す。

---

## 10. PR #222/#223 への処置方針（結論まとめ）

| PR | 推奨処置 | タイミング | コメント文言（案） |
|---|---|---|---|
| **#222 FRP-DESIGN-001** | **close** | FRP-DESIGN-002 PR 作成後（後継 PR リンクが確定してから） | 「POST-225-FRP-REBASE-INVENTORY-001（PR #226）による棚卸し結果、#226 merge 後の orphan HEAD を起点に FRP-DESIGN-002 として新 PR を作成しました: [FRP-DESIGN-002 PR リンク]。本 PR の設計内容（§3-§14）は 95% 有効で引き継ぎ済みです。」 |
| **#223 FRP-IMPL-001** | **close** | FRP-IMPL-002 PR 作成後（後継 PR リンクが確定してから） | 「POST-225-FRP-REBASE-INVENTORY-001（PR #226）による棚卸し結果、#226 merge 後の orphan HEAD を起点に FRP-IMPL-002 として新 PR を作成しました: [FRP-IMPL-002 PR リンク]。validatePartialStartableClass/startClassPartial/getUnassignedFirstRoundPlayers は再利用済み。buildFirstRoundPartialSectionHtml は構造再利用・旧 PR 番号参照を更新済み。」 |

**close を「そのまま」ではなく「superseded コメント付き close」とする理由**：
- 後から見たとき、なぜ close したかが分かる（design decision の透明性）。
- FRP-IMPL-002 の PR で「#223 から関数をコピー」と書けるため、知識の継承が明確になる。

**close の前提条件（共通）**：
- 後継 PR（FRP-DESIGN-002 / FRP-IMPL-002）が実際に存在すること
- close コメントに後継 PR の番号とリンクを含めること
- 後継 PR が存在しない段階では close しない（「後で作る予定」では不十分）
- close は人間の明示指示後に実施する（Claude が自律的に close しない）

---

## 付記

本書は **docs-only**。`shogi_v4.html` / `index.html` / `test/` / `.github/`（workflow）/ `package*.json` は変更しない。  
PR #222 / #223 はこの PR で操作していない（close / comment / Ready化 / merge / rebase 未実施）。  
実装は後続 FRP-DESIGN-002 / FRP-IMPL-002/003/004 で行う。production 反映はさらに別の release PR で行う。
