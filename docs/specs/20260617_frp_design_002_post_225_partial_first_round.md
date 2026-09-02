# FRP-DESIGN-002: 1局目部分手合い（未割当者選択・部分手合作成）設計 — #225 後 再設計

| 項目 | 値 |
|---|---|
| ID | FRP-DESIGN-002 |
| 種別 | 実装前設計（docs-only） |
| 日付 | 2026-06-17 |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `021faa8`（PR #226 merge 後の HEAD） |
| 前提 | PR #225（START-UX-CONSOLIDATE-001 実装、`67e0b81`）squash merge 済 / PR #226（POST-225-FRP-REBASE-INVENTORY-001、`021faa8`）squash merge 済 |
| 上位 | PAIRING-FLOW-REQ-001 / FIRST-ROUND-PARTIAL-DESIGN-001 / FRP-DESIGN-001（#222）/ POST-225-FRP-REBASE-INVENTORY-001（#226） |
| supersedes | **FRP-DESIGN-001（#222）**（#225 前提ズレのため作り直し。#222 は本 PR では操作しない） |
| 状態 | Draft（本書は設計のみ。実装・production 反映は別 PR） |

> 本書は **docs-only**。`shogi_v4.html` / `index.html` / test / workflow / package は変更しない。
> 実装は後続 FRP-IMPL-002/003/004、production 反映はさらに別の release PR で行う。
> PR #222 / #223 は本 PR では操作しない（close / comment / Ready化 / merge / rebase を行わない）。

---

## 0. 要約（TL;DR）

クラス内の参加者のうち、**運営者が選んだ未割当の人だけを先行して 1 局目の対局に入れる**機能の実装前設計。「来ている人から始める」「受付遅れの人を待たずに進める」を可能にする。

PR #225（START-UX-CONSOLIDATE-001）で **開始操作は参加者登録タブから外れ、対局管理タブへ集約済み**である。本設計はこの新しい開始 UX を前提に、FRP（First Round Partial）の操作入口を **対局管理タブのクラス別セクション**に置く。受付（参加者登録）タブには手合作成導線を一切置かない。

本書は FRP-DESIGN-001（#222）の設計知見（95% 有効）を引き継ぎ、#225 後の事実に合わせて以下を更新したものである：

- §2 背景（#225 で「受付タブに開始導線を置かない」が実装レベルで確定したことを反映）
- base 参照（`3b86edb` → `021faa8`）
- `buildClassActionBarHtml` の文言・コンテキスト（「を開始」→「全員で1局目を開始」）
- HANDOFF.md の扱い（新規作成 → 追記）
- スライス番号（FRP-IMPL-001 → FRP-IMPL-002/003/004 に再採番）

---

## 1. 目的: 1局目部分手合い（FRP）とは

### 1.1 やりたいこと

- 全員の 1 局目を一括作成するのではなく、**運営者が選んだ未割当参加者だけで 1 局目対局を append 作成**できるようにする。
- 大会運営中に「**来ている人から始める**」「**受付遅れの人を待たずに進める**」ことを可能にする。
- 奇数なら最後の 1 人は **待機**（未割当のまま残し、後で他の人と一緒に再度選んで追加できる）。

### 1.2 従来の紙運用（参照すべき現場挙動）

- 受付に来た人・準備できた人から、順次手合いを付けられた。
- 奇数なら 1 人だけ残して、2 人そろったところから対局を始められた。
- 結果として、全員がそろう前から 1 局目を回し始められた。

### 1.3 直近の反省（同じ失敗を繰り返さないために）

- START-001 / START-003（PR #218/#219、production 反映 #220）で受付画面に readiness 表示・「1 局目を作成」ボタンを追加したが、実態は **既存 `startTournamentForClass(classId)` を露出しただけ**で、「未開始クラスを丸ごと開始する導線」に過ぎず、ユーザー意図（来た人・準備できた人だけを選んで部分的に手合いを追加する）とズレた。
- #220 は #221 で production から rollback 済み。
- **#225（START-UX-CONSOLIDATE-001）で受付タブの開始導線（`reg-class-start` / `#startBtn` の開始副作用）を撤去し、開始は対局管理タブへ集約**したことで、この轍を構造的に断った。本設計は #225 が作った土台の上で、**「未割当者から対象者を選ぶ → 選択者だけで候補を作る → 手合い係が確定 → append」**という核を明確に固定する。

---

## 2. #225 後の開始 UX と FRP の関係（本書の最重要前提）

### 2.1 #225 が確定させた事実（orphan `021faa8` 実測）

| 要素 | #225 後の状態 | 行（参考・版で前後） |
|---|---|---|
| `#startBtn`（id 維持） | **ナビ専用**。click → `goToTournamentFromReg()`。文言「登録内容を確認して対局管理へ」 | `shogi_v4.html:264` / `:7895` |
| `goToTournamentFromReg()` | `save()` → `showTab('tournament')` のみ。**開始系 state（pairings/results/classes[].started/互換 state.started）を変更しない**。`generatePairing()` / `startTournament()` / `startTournamentForClass()` を呼ばない | `:5765-5768` |
| 受付タブの `reg-class-start`（#218/#219 由来）| **撤去済み**（静的ボタン・動的生成・helper 群・CSS・bind/描画呼出すべて） | — |
| readiness 表示（START-001）| **読み取り専用で残置**（`describeClassReadiness` / `renderClassReadiness` / `regClassReadinessId`、クリック可能な開始操作・handler を含まない） | — |
| 対局管理タブ `startBtnClass_{cls}` | **保持**。click → `startTournamentForClass(cls)`。文言「`<className>`全員で1局目を開始」。ヘルプ「※このクラス内の全員で開始します（他クラスは開始しません）」。**表示条件 = `!classStarted && players.length>=2 && players.length%2===0`（偶数のみ）** | `:6620-6624` / `:6634-6637` |
| `validateStartableClass` | **無改変**（2 名以上・偶数・未開始） | `:5536` 付近 |
| `startTournament()` | UI 非使用の **legacy / deprecated** helper として温存（物理削除・リネームは後続棚卸し） | `:5782` 付近 |
| `generatePairing` / `submitRound` | **無改変** | — |

### 2.2 FRP の操作入口（結論）

- **対局管理タブ / クラス別セクション内**に置く。
- **参加者登録（受付）タブには手合作成導線を置かない**。受付タブは #225 で **nav-only**（`#startBtn` = `goToTournamentFromReg` で save + タブ移動のみ）になっており、round 作成・`started` 更新・pairing 生成を一切行わない。FRP はこの方針を**完全に踏襲**する。
- 旧 `#startBtn`（全クラス一括開始）前提・旧 START-003（受付画面のクラス別開始ボタン）前提は **引き継がない**（どちらも #225 で撤去・無効化済み）。

### 2.3 既存「全員で1局目を開始」ボタンとの併置（#225 後の新事実）

`buildClassActionBarHtml(cls)` の現行ロジックは次のとおり（`021faa8` 実測）：

```
classStarted        → 「<className>をリセット」(resetBtnClass_)
else if 偶数かつ2名以上 → 「<className>全員で1局目を開始」(startBtnClass_ → startTournamentForClass)
else (奇数 / 1名 / 0名)  → ボタンなし
```

FRP の「選んだ人から1局目を開始」(部分開始ボタン `startBtnPartial_`) は、**この `else if` チェーンとは独立した別の `if(!classStarted && players.length>=1)` ブロック**として併置する（FRP-DESIGN-001 §8 / FRP-IMPL-001 の構造）。結果として #225 後は次の組み合わせになる：

| クラス状態 | 全員開始ボタン `startBtnClass_` | 部分開始ボタン `startBtnPartial_` |
|---|---|---|
| 未開始・偶数 2名以上 | 表示（全員で1局目を開始） | 表示（選んだ人から1局目を開始）＝**併置** |
| 未開始・奇数（3,5,…） | **非表示**（偶数ガード） | 表示（選んだ人から1局目を開始） |
| 未開始・1名 | 非表示 | 表示（ただし 1 名では対局を組めない＝§6.4） |
| 未開始・0名 | 非表示 | 非表示 |
| 開始済み | 非表示（リセットのみ） | 非表示（action bar には出さない。未割当一覧は別セクション §5.2） |

- **偶数クラスでは 2 ボタンが併置**される。#225 の「**全員で**1局目を開始」と FRP の「**選んだ人から**1局目を開始」は文言が明確に対比されるため誤認しにくい（#225 の文言変更が FRP にとって追い風）。
- **奇数クラスでは全員開始ボタンが偶数ガードで出ない**ため、従来は「開始できない」状態だった。FRP の部分開始ボタンが出ることで、**奇数クラスでも来た人から始められる**ようになる（FRP の主要価値の一つ）。
- **部分開始後は `classStarted=true` になり全員開始ボタンが消える**（リセットのみ）。これにより部分開始後に誤って `startTournamentForClass`（全員上書き）を呼ぶ事故が構造的に防がれる（§10.3）。

> 注意（#222 からの更新点）: FRP-IMPL-001（#223）の `buildClassActionBarHtml` 差分は `3b86edb` 時点の文脈行（`'を開始'` / `'※このクラスのみ後追い開始します'`）を参照しており、**そのまま rebase すると #225 の新文言と conflict する**。新実装（FRP-IMPL-002）では、#225 後の偶数ブロック（`'全員で1局目を開始'` / `'※このクラス内の全員で開始します（他クラスは開始しません）'`）の**後ろ**に同じ部分開始ブロックを追加する。**ブロックのコード内容自体は #223 と同一**で、囲む文脈行だけが変わる。

---

## 3. 対象スコープ

### 3.1 今回やる

- **1 局目のみ**
- **クラス単位**
- **対局管理タブ内**（クラス別セクション）
- 未割当者から対象者を選ぶ
- 選択者で候補ペアを作る
- 手合い係が確定する
- **既存 1 局目対局に対して `state.pairings[cls]` に `append`（追加）**する（基本方針）
- 奇数なら最後の 1 人は **待機**（未割当のまま残す）
- **既存の対局・結果・順位を壊さないことを最優先**にする

### 3.2 今回やらない（明示的非スコープ）

- 2 局目以降の **通常組み合わせ・順位計算・成績確定ロジック**（対象外）
- 2 局目以降の逐次手合い / 早上がり者同士の次局作成
- 完全自動手合い / 逐次手合いモードの新設
- 順位計算・勝率計算・年間集計仕様の変更
- `state.results[cls][round]` 構造の変更
- 大会履歴構造の変更 / 帳票・最終結果表の大改修
- 受付タブへの手合作成ボタン追加
- 既存 `startTournamentForClass(cls)` の流用
- 既存 `generatePairing(cls)` の全員上書き再利用

---

## 4. 現行構造の整理（orphan `021faa8` 実測）

関数名で参照する（行番号は版により前後するため指標）。

- `state.pairings[cls]` … **現在回戦の対局配列**。要素は `{p1, p2, winner, lastModifiedBy}`。1 つの同期ラウンドを表す。
- `state.results[cls]` … **確定済み回戦の配列**。各要素は対局配列。`state.results[cls].length` ＝確定済み回戦数。
- `roundNum = state.results[cls].length + 1` … 現在回戦は確定済み回戦数から導出。`done = state.results[cls].length >= state.rounds`。
- `submitRound(cls)` … **(a) 現ラウンド全対局に勝者が入っている (b) 登録者全員がどこかの対局に在籍している（missing チェック）** を満たさないと確定／次へ進めない。確定で現ラウンドを `state.results[cls]` に push し `state.pairings[cls]` を空にする。**無改変**。
- `generatePairing(cls)` … **全員を一括ペアし `state.pairings[cls]` をまるごと上書き**する。**無改変**。
  - 補足: `generatePairing` を **奇数**人数で呼ぶと backtracking が最上位で失敗し `state.pairings[cls]` が **空配列**になる。現状は `validateStartableClass` の偶数ガードで未到達だが、部分手合い状態でこれを呼ぶと危険（→ §10.1）。
- `startTournamentForClass(cls)` … `validateStartableClass`（2 名以上・偶数・未開始）を満たすクラスを **全員一括開始**（pairings/results 初期化 → started=true → `generatePairing`）。**無改変**。FRP は流用しない。
- `goToTournamentFromReg()` … #225 新設。受付タブ `#startBtn` の click。`save()` → `showTab('tournament')` のみ。開始系 state を変更しない。
- `renderTournament(cls)` … class action bar を pane 上部に常に描画し、`isClassStarted(cls)` が false なら「未開始（参加者 N 名）」表示の早期 return をしつつ action bar は出す。started なら暫定成績／対戦済み／過去結果／現ラウンド（`buildCurrentPairingsHtml`）を描画。
- `buildClassActionBarHtml(cls)` … §2.3 の通り（reset / 全員開始ボタンを出す view helper / reader）。
- `bindClassActionBarEvents(cls)` … `startBtnClass_` → `startTournamentForClass`、`resetBtnClass_` → `resetClassForClass` を bind。
- `isClassStarted(cls)` … 「そのクラスで 1 局目運用を開始したか」の述語（#224 §8.1）。クラス別全員開始だけでなく **将来の部分開始（`startClassPartial`）でも true** であるべき（`pairings[cls]` が 1 件以上あるか**だけ**で定義しない）。`setClassStarted(cls,true)` 経由で `classes[i].started` + 互換 `state.started` を同期。
- `卓番号` … 描画時に `state.pairings[cls]` の **index + 1**（`第 (i+1) 卓`、永続化なし）。append で自然に連番が続く。

> ★ **2026-09-01 追記（TABLE-NO-REMOVE-001 / #941）: 本節の卓番号に関する記述は失効**。
> 作者裁定により**卓番という概念ごと廃止**した（沼津の運用で使っていないため）。
> `buildCurrentPairingsHtml` は「第 N 卓」バッジを描かず、印刷の組み合わせ表・参加者の個人ビューからも撤去、
> `sbFindCurrentMatch` の戻り値からも `table` を落とした。**残るのは `pairings` の配列順だけ**。
> 「残り N 卓 未入力」等の**数・単位としての「卓」は据え置き**（番号ではない）。
> 他所で必要になったらそのとき「卓番を使う/使わない」の設定として足す。詳細 → `docs/REFERENCE.md`。

- `getDuplicatePlayersInPairings(cls)` … pairings 内で同一選手が複数対局に出ていないか検出。**append 後の重複 post-check に流用可能**。
- 未割当者を保存する state は存在しない（§5 で派生）。
- `save-verify` 作法 … 全 mutate 経路で `readPersistedState()` 再読込 → `pairingsMatchSnapshot(persisted, expected)`（p1/p2/winner、両側存在時のみ lastModifiedBy を比較）→ 不一致なら `notifySaveWarning({... severity:'warn', aggregateKey:'save-verify:core' ...})`。**rollback せず運営継続**。`classStartedInPersisted(persisted, cls)` で persisted 側の started を確認できる。
- `lastModifiedBy` … `normalizeState` は **'manual' のみ尊重**、それ以外は 'auto' に補完（独自値は保存後に消える）。ペアカードのラベルは `lastModifiedBy==='manual'` で `[手動変更]` を表示。
- 順位 … `calcFinal(cls)` の sort は A（勝数）/B（相手勝数和）/C（勝った相手の勝数和）/直接対決のみで決まり、対局数は順位に未使用。1 局目のみの本設計では影響なし。

---

## 5. データ設計

### 5.1 採用方針（データ構造を変えない）

- **FRP はデータ構造を変えない。** `state.pairings[cls]` / `state.results[cls]` / match オブジェクトのスキーマに新フィールドを足さない。
- **`started=true` かつ `pairings[cls]=[]`（空）または部分配列を正規状態として扱う。** これを作るのは `generatePairing` を呼ばない開始経路（§7 `startClassPartial`）。`started=false` のまま pairings を持たせる異常状態は作らない（既存 `hasOngoing` fail-safe が想定する異常データになるため禁止）。
- **未割当者は state に保存しない。** `state.players[cls]` から `state.pairings[cls]` 在籍者を引いて **派生**する（§5.3）。
- **append したペアの `lastModifiedBy` は `'auto'` とする。** 理由: (1) `normalizeState` で生き残る（独自値 'partial' は 'auto' に潰れる）、(2) 1 局目の新規生成ペアであり `[手動変更]` ラベルを出すのは誤誘導。

### 5.2 参照する state（書く / 読む）

| state | 読む | 書く | 用途 |
|---|---|---|---|
| `state.players[cls]` | ○ | × | クラス参加者の母集合（未割当判定の母数） |
| `state.classes[i].started` / 互換 `state.started` | ○ | △（`setClassStarted` 経由のみ） | 開始済み判定。部分開始で true にする |
| `state.pairings[cls]` | ○ | △（**append のみ**） | 現 1 局目対局。在籍者の除外集合。append 先 |
| `state.results[cls]` | ○ | △（部分開始時に `[]` 初期化のみ） | 確定済み回戦。`length>=1` で FRP 対象外（追加禁止ゲート） |
| `state.rounds` | ○ | × | 総回戦数（done 判定。FRP では変更しない） |

- **`started`**: 部分開始で `setClassStarted(cls,true)`。未開始では FRP の未割当セクションを出さない。
- **`pairings`**: 既存対局・既存 winner は **絶対に触らない**。FRP は **append（concat）のみ**。
- **`results`**: 部分開始時に空配列で初期化。それ以降 FRP は results を変更しない。`results[cls].length>=1` は「1 局目確定済み or 2 回戦以降」を意味し、FRP の全導線を閉じる（§5.4）。

### 5.3 「1局目未割当」の判定条件（派生）

`getUnassignedFirstRoundPlayers(cls)`（#223 からそのまま再利用可・pure 派生）：

1. `results[cls].length>=1` なら **空配列**を返す（1 局目確定後/2 回戦以降は対象外）。
2. それ以外は、`state.players[cls]` のうち、`state.pairings[cls]` のどの match の `p1`/`p2` にも現れない者を **`entry_no` 昇順**で返す。

この派生により、仕様の各除外条件が**自動的に充足**される：

- **既に 1 局目対局がある参加者を除外**: `pairings[cls]` の p1/p2 在籍者は assigned として除外される。
- **現 pairings 在籍者を除外**: 同上。
- **削除済み参加者は混入しない**: `players[cls]` を母集合とするため、削除（`removePlayer` / entry_no 欠番）された者は最初から含まれない。
- **結果入力済み対局を壊さない**: そもそも派生のみ（read-only）で pairings/results を一切変更しない。さらに `results[cls].length>=1` ゲートで、確定後は空配列。

### 5.4 既に1局目対局がある参加者・結果入力済み対局の扱い

- **既に 1 局目対局がある参加者**: §5.3 の通り、`pairings[cls]` 在籍者は未割当一覧に出ない（除外）。append でも在籍チェックで二重割当を弾く（§6.5）。
- **結果入力済み対局を壊さない条件**: FRP は append のみで既存 match を変更しないため、入力済み winner は不変。ただし安全側で、**append の guard に `results[cls].length===0` を必須化**する（1 局目確定＝`submitRound` で results に push された後は append 禁止）。`pairings[cls]` 内の特定 match に既に winner が入っていても、append は配列末尾に新規 match を足すだけなので既存 winner に触れない。

### 5.5 保存時の安全確認 / persisted 側 started 未確認時の warn

既存 SAVE 系作法（rollback せず warn・運営継続）に合わせる。

- **`startClassPartial` 後（SAVE-FRP-001）**: `save()` 後に `readPersistedState()` で再読込し、
  - `classStartedInPersisted(persisted, cls)===true`（**persisted 側で `started=true` が確認できる**）
  - `persisted.pairings[cls]` が空配列
  - `persisted.results[cls]` が空配列

  の 3 条件を確認。**いずれか満たさなければ `notifySaveWarning`**（`callsiteId:'SAVE-FRP-001-startClassPartial'`、`aggregateKey:'save-verify:core'`、`severity:'warn'`、`kind:'save-verify'`）。「保存未確認」であって「保存失敗」と断定しない。**rollback しない・運営は継続**する。
  - **warn 条件の正確な意味**: 「初期状態 `started=false`」自体を warn と混同しない。save が成功すれば persisted 側で `started=true` が確認でき warn は発火しない。**persisted 側で started=true が確認できない場合のみ** warn する（例: localStorage 書き込み失敗・別タブ上書き）。
- **`appendFirstRoundPairs` 後（SAVE-FRP-002、FRP-IMPL-003）**: `pairingsMatchSnapshot(persisted.pairings[cls], expected)` で配列全体（p1/p2/winner、両側存在時 lastModifiedBy）を照合。**length 一致だけでは stale を見逃す**ため snapshot 比較を使う。未確認は warn・継続。

---

## 6. バリデーション設計

### 6.1 `validatePartialStartableClass(classInfo, playersForClass)`（必要性と責務）

- **必要性**: 既存 `validateStartableClass`（2 名以上・**偶数**・未開始）は「全員一括開始」用で、FRP の「来た人だけで始める（奇数も可・1 名でも開始可）」とは判定意味が異なる。流用すると偶数を強制してしまうため、**別経路の専用 validator が必要**。
- **責務**: 部分開始の可否判定。**pure**（state 非参照・引数のみ・副作用なし）。
- **判定（#223 からそのまま再利用可）**:
  - 参加者 0 名 → `{kind:'skip-empty'}`（開始しない）
  - 既に開始済み（`classInfo.started===true`）→ `{kind:'skip-already-started'}`（再開始しない）
  - それ以外（1 名以上・未開始）→ `{kind:'ok'}`
- **`validateStartableClass` は無改変**（一括開始の判定意味＝2 名以上・偶数を保つ）。unknown class（classInfo 解決不能）の拒否は呼出側 `startClassPartial` で行う。

### 6.2 各条件の扱い

| 条件 | 扱い |
|---|---|
| **クラス未開始** | 部分開始の前提。`classInfo.started===true` は `skip-already-started` で拒否（再開始しない） |
| **参加者不足** | 0 名は `skip-empty`。**1 名は開始可だが対局は組めない**（§6.4。受付待ち状態として許容） |
| **未割当者不足** | 未割当 0 名 → 未割当セクション非表示（`buildFirstRoundPartialSectionHtml` が '' を返す）。append 候補も 0 |
| **奇数人数** | **許容**（偶数を要求しない）。選択者が奇数なら末尾 1 人を待機（§6.3 / §9） |
| **既存対局あり** | append は既存に追加するだけ。在籍者は未割当一覧から除外（§5.3） |
| **既存対局なし** | 部分開始直後（`started=true` かつ `pairings[cls]=[]`）。全員が未割当として一覧に出る（一時 UX、§8.5） |
| **結果入力済み対局がある場合** | `results[cls].length>=1` で FRP 全導線を閉じる（追加禁止）。`pairings[cls]` 内の個別 match に winner が入っていても append は末尾追加で既存に触れない |
| **append 可能 / 不可** | 可: 未開始でない（部分開始済み）かつ `results[cls].length===0` かつ選択者 2 名以上。不可: 上記を満たさない |

### 6.3 append 可否の条件（FRP-IMPL-003 で実装する `appendFirstRoundPairs` の guard）

1. `state.results[cls].length===0`（**1 局目のみ**）。
2. 各 pair の p1/p2 が `state.players[cls]` に存在し、現 `state.pairings[cls]` に **未在籍**。
3. pair 内 p1≠p2、新規 pairs 内に同一 id の重複なし。
4. 上記 NG なら mutate せず中断。append 後 `getDuplicatePlayersInPairings(cls)>0` なら backup から rollback して中断。

### 6.4 1名 / 0名 の扱い

- **0 名**: `validatePartialStartableClass` が `skip-empty`。部分開始ボタンも出さない（§2.3、`players.length>=1` ガード）。
- **1 名**: 部分開始は**可能**（`started=true`、`pairings=[]`）。だが 1 名では対局を組めない（`buildFirstRoundPartialPairs` は 1 名以下で空 pairs。FRP-IMPL-003）。未割当一覧にその 1 名が「待機中」として表示され、2 人目が来てから選択→追加する。これは「受付遅れの人を待つ」現場運用に一致。
  - **設計判断（FRP-IMPL-002 で確認）**: 部分開始ボタンの表示しきい値は #223 を踏襲し `players.length>=1`。1 名クラスで「開始」を押せること自体は無害（started を立てるだけ）。`>=2` に絞る案もあるが、本設計は「来た 1 人目の時点でクラスを開始状態にし、待機表示する」挙動を採る。

### 6.5 エラーメッセージ設計

| 状況 | 文言（案） | 経路 |
|---|---|---|
| クラス情報未初期化 | 「クラス情報が初期化されていません」 | `startClassPartial`（err） |
| unknown class | 「クラスが見つかりません」 | `startClassPartial`（err） |
| 既に開始済み | 「`<className>`はすでに開始されています」 | `startClassPartial`（alert） |
| 参加者 0 名 | 「`<className>`は参加者がいません」 | `startClassPartial`（warn） |
| 選択 1 名以下で追加 | 「2 名以上を選択してください」 | append（FRP-IMPL-003） |
| 保存未確認 | 「`<className>`を部分開始しましたが、保存が確認できませんでした。ブラウザを閉じる前にバックアップしてください」 | SAVE-FRP-001（warn・継続） |

- 文言は「登録完了・対局開始」「クラスを開始」「全員で1局目を開始」と **混同しない**こと。FRP の文言は「**選んだ人から**」「**選択者で**」を一貫して使う。

---

## 7. helper 設計案

新設はいずれも **追加（append）専用**。既存 `generatePairing` / `startTournamentForClass` / `submitRound` / `validateStartableClass` の本体は無改変。**§11 で #222/#223 からの再利用可否を明記**する。

### `validatePartialStartableClass(classInfo, playersForClass)`
- **責務**: 部分開始の可否判定（§6.1）。pure・state 非参照・副作用なし。偶数を要求しない。
- **返り値**: `{kind:'ok'}` / `{kind:'skip-empty'}` / `{kind:'skip-already-started'}`。

### `startClassPartial(cls)`
- **責務**: クラスを部分開始状態にする。classInfo 解決 → `validatePartialStartableClass` ok のときのみ `state.pairings[cls]=[]` / `state.results[cls]=[]` / `setClassStarted(cls,true)` → `save()` → SAVE-FRP-001 検証（§5.5）→ `renderTournament(cls)`。
- **副作用**: state 変更 + 永続化 + 再描画。**`generatePairing` を呼ばない**。**`startTournamentForClass` / `applyStartForCandidates` を使わない**。unknown class は mutate せず拒否。

### `getUnassignedFirstRoundPlayers(cls)`
- **責務**: 1 局目未割当者を派生（§5.3）。pure・非保存。`results[cls].length>=1` → 空配列。entry_no 昇順。
- **副作用**: なし。

### `buildFirstRoundPartialSectionHtml(cls)`
- **責務**: 未割当者セクションの HTML 文字列を返す（表示専用・副作用なし）。
- **表示条件**: `isClassStarted(cls)` かつ `state.results[cls].length===0` かつ未割当>0 のときのみ中身を返す（それ以外は ''）。
- **内容**: 見出し「1局目 未割当参加者」、説明文、各参加者のチェックボックス（氏名・番号は `escapeHtml`）、「選択者で1局目に追加」ボタン。
- **⚠ 文言・コメント・PR 番号参照は更新必須**: #223 の実装では disabled ボタンの `title="次のPR（FRP-IMPL-002）で対応します"` / ラベル「選択者で1局目に追加（次PRで対応）」が旧スライス番号を指す。FRP-IMPL-002 でロジックを再利用する際、これらを **新スライス体系（append は FRP-IMPL-003）**に合わせて更新する。コード中の `// FRP-IMPL-001 ...` コメントも `FRP-IMPL-002`（または「次スライス」）に更新する。

### `buildFirstRoundPartialPairs(selectedPlayers)`（FRP-IMPL-003）
- **責務**: 選択者から候補ペア配列を作る pure 関数。entry_no 昇順に整列し `(0,1),(2,3),…` で組む。1 名以下なら作成不可（空 pairs）。奇数なら末尾 1 人を `leftover` として返す。
- **返り値**: `{ pairs:[{p1,p2,winner:null,lastModifiedBy:'auto'}], leftover: playerOrNull }`。
- 1 局目は results 空のため勝数差・再戦は構造的に発生せず、entry_no 順で十分かつ安全（`generatePairing` のバックトラッキング流用は不要・過剰）。

### `appendFirstRoundPairs(cls, pairs)`（FRP-IMPL-003）
- **責務**: 候補ペアを `state.pairings[cls]` に append し永続化する mutate。
- **guard**: §6.3。
- **手順**: `backup=pairings[cls]` 退避 → `pairings[cls]=pairings[cls].concat(pairs)` → `getDuplicatePlayersInPairings(cls)>0` なら rollback して中断 → `save()` → SAVE-FRP-002 検証（§5.5）→ `renderTournament(cls)`。既存対局・既存 winner は触らない。

### `bindClassActionBarEvents(cls)` への追加（部分開始ボタン bind）
- `startBtnPartial_{cls}` の click → `startClassPartial(cls)` を bind（本体末尾に追加するだけ。#225 は本体未変更）。

### `buildFirstRoundPartialSectionHtml` のイベント bind（FRP-IMPL-003）
- 「追加」押下時に選択 id を集め、`buildFirstRoundPartialPairs` → プレビュー（インライン＋ native `confirm()` で氏名・組数を要約）→ ok なら `appendFirstRoundPairs(cls, pairs)`。
- 確認 UI は MVP では **インライン プレビュー＋ native `confirm()`** で十分（独自モーダルは過剰）。

---

## 8. UI 設計

### 8.1 配置

- **対局管理タブ** / **クラス別セクション（pane-{cls}）内**。
- **受付タブには手合作成導線を置かない**（#218/#225 の方針）。
- 部分開始ボタン `startBtnPartial_` は `buildClassActionBarHtml` で既存 action bar に併置（§2.3）。
- 未割当一覧 `buildFirstRoundPartialSectionHtml` は `renderTournament(cls)` の `buildPastResultsHtml` の後・`buildCurrentPairingsHtml` の前に挿入（#223 の挿入位置を踏襲）。

### 8.2 クラスごとの部分開始セクション（構成）

```
[pane-{cls} 未開始]
  class action bar:
    ├─ (偶数2名以上のみ) 「<className>全員で1局目を開始」… startTournamentForClass（#225 既存・温存）
    └─ (1名以上)        「選んだ人から1局目を開始」     … startClassPartial（新・generatePairing 不使用）

[pane-{cls} 部分開始済み かつ results 空]  ← 1局目のみ
  ├─ class action bar: 「<className>をリセット」のみ
  └─ frp-partial-section（buildFirstRoundPartialSectionHtml）:
       見出し「1局目 未割当参加者」
       説明「このクラスは部分開始中です。まだ1局目に入っていない参加者を表示しています。」
       ├─ □ A-1｜山田 太郎
       ├─ □ A-3｜佐藤 花子
       └─ ...（entry_no 昇順・氏名/番号は escapeHtml）
       [選択者で1局目に追加] ボタン
       （現ラウンド対局 buildCurrentPairingsHtml は下に続く）

[pane-{cls} results[cls].length>=1]  ← 1局目確定後/2回戦以降
  └─ 未割当セクション・append 導線は一切出さない（追加禁止）
```

### 8.3 未割当参加者一覧・選択チェックボックス・追加ボタン

- 各参加者に `<input type="checkbox" class="frp-unassigned-cb" data-frp-pid="...">`。
- 氏名は `getName(p.id,cls)`、番号は `cls+'-'+entryNoOf(cls,p.id)`、いずれも `escapeHtml`（XSS / 個人情報保護）。
- 追加ボタン `frpAddBtn_{cls}`「選択者で1局目に追加」。

### 8.4 作成前の確認表示 / 作成後の結果表示 / append できない条件の表示

- **作成前の確認（FRP-IMPL-003）**: インライン プレビュー（選択氏名・組数・奇数なら待機者）＋ native `confirm()`。
- **作成後の結果（FRP-IMPL-003）**: `renderTournament(cls)` 再描画で、追加した対局が現ラウンドの**末尾に配列順で**表示され、追加者が未割当一覧から消える。
  ★ 旧記述は「連番（卓番号 index+1）で表示され」。**卓番号は #941 で廃止**したので、残るのは並び順だけ。
- **append できない条件の表示**:
  - 未割当 0 名 → セクション自体を非表示（'' を返す）。
  - 選択 1 名以下 → 追加ボタン押下時に「2 名以上を選択してください」。
  - `results[cls].length>=1` → セクション非表示（追加禁止）。

### 8.5 一時 UX（FRP-IMPL-002 では「未割当者一覧表示まで」に留める）

- **FRP-IMPL-002 の段階では、選択者での append（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs`）は実装しない。**「選択者で1局目に追加」ボタンは **disabled** のまま（チェックボックスは表示のみ・イベント未登録）。append は FRP-IMPL-003。
- 部分開始ボタンを押した直後は `started=true` かつ `pairings[cls]=[]` となり、**未割当一覧に全クラス員が表示される**（まだ誰も割り当てられていないため）。この一時 UX は FRP-IMPL-002 の意図したスライス状態であり許容するが、以下に注意：
  - 運営者に「全員が未割当の部分開始中」であることが伝わる説明文言を出す（「このクラスは部分開始中です。まだ1局目に入っていない参加者を表示しています。」）。
  - disabled ボタンの文言は、リリース時に使用可能なアクションを示す文言へ更新する（「次PRで対応」のような暫定文言を残さない／更新時期は §11.3）。

### 8.6 文言案（再掲・確定）

- 未開始時ボタン: **「選んだ人から1局目を開始」**（ヘルプ「※選んだ人だけで1局目を作ります（残りは後で追加）」）
- 未割当セクション見出し: **「1局目 未割当参加者」**
- 確定ボタン: **「選択者で1局目に追加」**
- 注意文: **「既存の対局は変更せず、選択者だけを1局目に追加します」**（FRP-IMPL-003）

---

## 9. 奇数時

- 選択者が **1 人だけ**なら **作成不可**（ペアを作れない）。
- 選択者が **3 人以上の奇数**なら、entry_no 順で 2 人ずつ作り、**最後の 1 人は待機**。
- 待機者は **未割当のまま残る**（後で他の人と一緒に再度選んで追加できる）。
- **1 局目を確定して 2 回戦へ進むには、既存 `submitRound` の missing チェックにより全員が対局に入っている必要がある**（＝最終的に全クラス員が割り当て済み＝実質偶数）。これは現行モデルと一致。
- **真の奇数終了 / bye / 不戦勝は今回対象外**。現行どおり **運営者追加** または手動運用で対応する。

---

## 10. 危険箇所（本番運営中に触ってはいけない箇所）

### 10.1 `generatePairing(cls)` の奇数挙動 / 部分手合い状態での呼び出し

- **問題**: `generatePairing(cls)` は奇数で呼ぶと `state.pairings[cls]` が **空配列**になる。部分手合い状態（pairings に部分的な対局＋入力済み勝敗）で呼ぶと **既存対局が全部消える**。
- **ガード**: `startClassPartial` / `appendFirstRoundPairs` の経路で `generatePairing` を呼ばない。「組み合わせを再生成」ボタンを未割当>0 の部分手合い状態で **非表示**にする（FRP-IMPL-004。`buildCurrentPairingsHtml` の再生成ボタン出力を「未割当 0 のときのみ表示」にゲート）。

### 10.2 既存の全員開始ロジックを誤って呼ぶこと

- **`startTournamentForClass(cls)` / `startTournament()` を FRP 経路から呼ばない**。部分開始は `startClassPartial` のみ。
- 部分開始後は `classStarted=true` で全員開始ボタン（`startBtnClass_`）が action bar から消えるため、構造的に誤呼び出しが起きにくい（§2.3）。

### 10.3 `state.pairings[cls]` の上書き経路 / append のみ

- pairings を上書きする既存経路: `generatePairing`・`startTournamentForClass`・`resetClassForClass`。**FRP は append のみ**。これら上書き経路を FRP 状態で呼んではならない。
- `resetClassForClass(cls)` は pairings/results/started をリセットする（既存動作）。部分手合い状態でのリセットは入力済み勝敗が消える（FRP 追加のリスクではないが UI 誤操作に注意）。

### 10.4 参加者登録タブから round 作成すること

- 受付タブは #225 で nav-only。FRP は受付タブに **round 作成・`started` 更新・pairing 生成を一切持ち込まない**。`goToTournamentFromReg` は save + タブ移動のみ。

### 10.5 結果入力済み対局を壊すこと / started・rounds・pairings の不整合

- append は既存 match に触れず末尾追加のみ。`results[cls].length>=1` ゲートで確定後の追加を禁止。
- `started=false` のまま pairings を持つ異常状態を作らない（§5.1）。`setClassStarted` 経由でのみ started を変更し `classes[i].started` と互換 `state.started` を同期。

### 10.6 class 別開始状態の破壊 / 保存データの上書き

- 部分開始・append は **当該クラスのみ** mutate。他クラスの pairings/results/started を触らない。
- `append` の `lastModifiedBy` は `'auto'`（独自値を使わない。§5.1 / §10 `normalizeState` 補完）。
- save-verify は正引き snapshot 比較（length 一致だけで stale を見逃さない。§5.5）。

### 10.7 本番運営中に既存画面を大きく変えること

- FRP は **純追加**（既存 `startBtnClass_` / リセット / 現ラウンド描画の出力条件・id・文言を変更しない）。既存画面の見た目・操作を最小限の追加に留める。

---

## 11. 既存 PR（#222/#223）から再利用する知見

### 11.1 #222（FRP-DESIGN-001）から再利用できる設計思想

- §3 スコープ（1 局目のみ・対局管理タブ・クラス単位・append）
- §5 採用方針（generatePairing 不使用・append 専用 helper・startTournamentForClass 不流用・データ構造不変・未割当は派生）
- §6 推奨データフロー（startClassPartial → started=true → 未割当表示 → append → submitRound）
- §7 helper 設計案（validatePartialStartableClass / startClassPartial / getUnassignedFirstRoundPlayers / buildFirstRoundPartialPairs / appendFirstRoundPairs / buildFirstRoundPartialSectionHtml のシグネチャ・責務・guard）
- §8 UI 案（対局管理タブ内・受付タブには置かない）
- §9 奇数時（末尾 1 人待機）
- §10 再生成ボタン制御 / §11 保存検証作法 / §14 受け入れ条件

### 11.2 #222 から修正すべき古い前提

| #222 の記述 | 問題 | 本書での対処 |
|---|---|---|
| §2「現アプリ運用」: 受付タブに `#startBtn`（一括開始）+ `reg-class-start`（クラス別開始）が残存 | #225 で撤去済み | §1.3 / §2 で「#225 で解決済み」として文脈更新 |
| base `3b86edb` | 2 commits stale | base を `021faa8`（#226 merge 後 orphan HEAD）に更新 |
| `buildClassActionBarHtml` 文言「を開始」 | #225 で「全員で1局目を開始」に変更 | §2.3 で新文言・新コンテキスト・併置ロジックを明記 |
| HANDOFF.md 新規作成 | 現 orphan HEAD に HANDOFF.md が既存 | 本 PR では HANDOFF.md を **追記**として扱う |

### 11.3 #223（FRP-IMPL-001）から再利用できる関数案

| 関数 | 再利用可否 | 備考 |
|---|---|---|
| `validatePartialStartableClass(classInfo, playersForClass)` | **そのまま再利用可** | pure・state 非参照・偶数不要。#225 の `validateStartableClass` 不変と整合 |
| `startClassPartial(cls)` | **そのまま再利用可** | `generatePairing` 非呼出・SAVE-FRP-001 検証・unknown class 拒否。#225 で触れた関数と衝突しない |
| `getUnassignedFirstRoundPlayers(cls)` | **そのまま再利用可** | 派生・非保存・`results[cls].length>=1` ゲート・entry_no 昇順 |
| `buildFirstRoundPartialSectionHtml(cls)` | **ロジック再利用可。文言・コメント・PR 番号参照は更新必須** | 表示専用・副作用なし。escapeHtml 適用済み。**ただし disabled ボタンの `title`「次のPR（FRP-IMPL-002）で対応します」/ ラベル「選択者で1局目に追加（次PRで対応）」/ `// FRP-IMPL-001` コメントは、新スライス体系（append=FRP-IMPL-003）に合わせて更新する。そのままコピーでは文言・スライス参照が不正確になる** |
| `bindClassActionBarEvents` の `startBtnPartial_` bind 追加 | **そのまま再利用可** | 本体末尾に追加するだけ。#225 は本体未変更 |
| `renderTournament` の `buildFirstRoundPartialSectionHtml` 呼出挿入 | **そのまま再利用可** | 1 行追加。#225 は本体未変更 |
| `buildClassActionBarHtml` の `startBtnPartial_` 追加 | **ロジック再利用可。文脈行は #225 後に更新必須** | #223 patch は `'を開始'` / `'※このクラスのみ後追い開始します'` を文脈参照 → #225 後は `'全員で1局目を開始'` / `'※このクラス内の全員で開始します'` の後ろに追加。**ブロックのコード内容は同一** |
| `test/test_first_round_partial_001.js` | **大部分再利用可（V/U/P 系）。S 系は #225 後に修正** | §13 参照 |

### 11.4 #223 から破棄・作り直し推奨

- `HANDOFF.md` 新規作成差分 → **追記**として扱う。
- `test/run_tests.sh` 変更差分 → #225 後の構成（test_start_003 撤去・test_start_ux_consolidate_001 登録済み）を土台に、**該当セクションへ追加**する。単純な「1 行追加」と決め打ちしない（§13.3）。
- `docs/notes/20260617_frp_impl_001_result.md`（#223 の結果メモ）→ 本書・棚卸し文書（#226）が代替するため不要。

---

## 12. 実装スライス案

orphan base・Draft 原則。各 slice は前 slice の orphan 新 HEAD を起点に積む。スピード優先で小さく進める。

| Slice | 内容 | 受け入れの核 | base |
|---|---|---|---|
| **FRP-DESIGN-002**（本書） | docs-only 設計（#225 後 再設計） | 設計合意 | orphan `021faa8` |
| **FRP-IMPL-002** | **部分開始の土台 + 未割当者一覧表示**（`validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialSectionHtml`【表示のみ】/ action bar の「選んだ人から1局目を開始」/ nav-only・state 不変検査）。**append はまだ無し**（追加ボタン disabled） | 未割当を選べる土台 + 部分開始（generatePairing 不使用）+ 受付タブ nav-only/state 不変の回帰 | FRP-DESIGN-002 merge 後の新 HEAD |
| **FRP-IMPL-003** | **選択者だけで append 作成**（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs` / 選択チェック＋プレビュー＋確定 UI / disabled ボタン解除） | 選択者だけで append 作成・手合い係が確定 | FRP-IMPL-002 merge 後の新 HEAD |
| **FRP-IMPL-004** | **保存・復元・結果入力済み保護・警告強化**（再生成ボタン制御＝未割当>0 で非表示 / 保存復元の堅牢化 / SAVE-FRP-002 強化 / エッジ整理） | 既存対局の誤破壊防止・保存堅牢性 | FRP-IMPL-003 merge 後の新 HEAD |
| **release PR** | production 反映（base=production）。orphan slice 群 merge 後に別 PR | 既存 release 運用に従う | production |

> #226 棚卸しは「FRP-IMPL-002 = 部分開始 + 未割当表示（append は次スライス）」と整理した。本書はそれに揃える（旧 #222 §13 の FRP-IMPL-001 ≒ 新 FRP-IMPL-002、旧 FRP-IMPL-002 ≒ 新 FRP-IMPL-003、旧 FRP-IMPL-003 ≒ 新 FRP-IMPL-004）。

---

## 13. テスト観点

無改変 baseline 比較で **新規 FAIL/WARN 0**。新規 `test/test_first_round_partial_002.js` を `run_tests.sh` に配線。DOM 直読みテストが落ちた場合は最小修正ルール（assert 文言は保持・fixture を state に合わせる）に従う。baseline は #225 後 orphan の `62/1/35`（FAIL=1 は既存 `data_*` 環境要因）。

### 13.1 受付タブは nav-only / state 不変（#225 後の最重要回帰）

- **`#startBtn` 押下後、`state.pairings` / `state.results` / `classes[].started` / 互換 `state.started` が変化しないこと**（開始系 state 不変）。
- **`#startBtn` 押下で `goToTournamentFromReg` を呼ぶこと**、かつ **`generatePairing()` / `startTournament()` / `startTournamentForClass()` を呼ばないこと**（round 作成・`started` 更新なし）。
- 「`goToTournamentFromReg` を呼ぶこと」だけでなく、**受付タブ側で round 作成・`started` 更新が起きないこと**を検証する。

### 13.2 純粋 / 派生 / mutate / 表示

**純粋（V/U 系）**
- `validatePartialStartableClass`: 未開始 1 名 → ok / 0 名 → skip-empty / 開始済み → skip-already-started / **偶数を要求しない**。
- `getUnassignedFirstRoundPlayers`: pairings 在籍者を除外 / **既に 1 局目対局がある参加者の除外** / `results` 非空 → 空配列 / entry_no 昇順 / 削除者を返さない。
- 未割当者判定: 0 人 / 1 人 / 2 人以上の各ケース。
- **奇数人数**: 選択奇数 → 末尾 1 人 leftover（`buildFirstRoundPartialPairs`、FRP-IMPL-003 で追加）。

**mutate（P 系）**
- `startClassPartial` 後: `started=true` / `pairings[cls]=[]` / `results[cls]=[]`。
- `startClassPartial` が **`generatePairing` を呼ばないこと**（started 後も pairings 空のまま）。
- **保存検証 warn が persisted 側で `started=true` が確認できない場合に発火すること**（初期 `started=false` 自体を warn と混同しない。save 成功時は warn 発火しない。stub localStorage で save が届かない状態を作って検証する）。
- unknown class では mutate しないこと。

**表示（D 系）**
- 未開始クラスの action bar に `startBtnPartial_{cls}` が表示されること（**A/B クラス独立**）。
- 偶数クラスでは `startBtnClass_`（全員開始）と `startBtnPartial_`（部分開始）が併置されること。奇数クラスでは `startBtnClass_` が出ず `startBtnPartial_` のみ。
- started かつ results 空 かつ 未割当>0 のとき `frp-partial-section` が表示されること。
- started かつ results 空 かつ 未割当=0 のとき非表示。started かつ results 非空のとき非表示。
- 未割当リストの氏名が `escapeHtml` を通していること（XSS ガード）。

### 13.3 A/B クラス独立・保存復元

- 部分開始・未割当判定が **A/B クラスで独立**していること（A の部分開始が B の started/pairings に波及しない）。
- **保存復元**: `startClassPartial` → reload（再 normalize）後も started/pairings/results が保持されること。`normalizeState` で append ペアの `lastModifiedBy='auto'` が生き残ること（FRP-IMPL-003）。

### 13.4 回帰（最重要）

- `generatePairing` / `submitRound`（missing チェック不変＝全員在籍まで 2 回戦へ進めない）/ `startTournamentForClass` / `validateStartableClass` / `calcFinal` / 順位 / 大会履歴 Step1 / 帳票 が **無改変**であること。`test_b_r2_regression.js` / `test_round_class_start_004*.js` / `test_history_step1.js` / `test_start_ux_consolidate_001.js` 等を破らない。
- `startBtnClass_A` の click が `startTournamentForClass('A')` を呼ぶこと（正規の開始導線は対局管理タブに集約）。
- `startBtnPartial_` を押しても `generatePairing` が呼ばれないこと。

### 13.5 run_tests.sh への登録

- #225 後の `run_tests.sh` は `test_start_003.js` の登録を解除し `test_start_ux_consolidate_001.js`（START-UX-CONSOLIDATE-001 ブロック）を登録済み。
- 新テスト `test_first_round_partial_002.js` は **START-UX-CONSOLIDATE-001 ブロックの後・最終結果ブロックの前**に、既存ブロックと同じパターン（`[ -f ... ]` → `node ...` → `ok/ng/warn`）で **該当セクションへ追加**する。**単純な「1 行追加」と決め打ちしない**。

---

## 14. 受け入れ条件

- 「**開始ボタンを増やしただけ**」では **不合格**。
- `startTournamentForClass` を受付/対局画面に **露出しただけ**では **不合格**。
- **未割当者を選べる**こと。
- **選択者だけで 1 局目の候補を作れる**こと（FRP-IMPL-003）。
- **手合い係が確定できる**こと（FRP-IMPL-003）。
- **既存の 1 局目対局を壊さず append できる**こと（FRP-IMPL-003）。
- **奇数なら 1 人を待機に残せる**こと。
- **1 局目確定後は追加禁止できる**こと。
- **既存の順位・履歴・帳票・保存形式を壊さない**こと。
- **2 局目以降の逐次手合いに踏み込まない**こと。
- **受付タブが nav-only・state 不変であること**（#225 後の前提を破らない）。

---

## 15. #222/#223 の扱い（本 PR では操作しない）

本書（FRP-DESIGN-002）は **#222 を supersede する設計**だが、**本 PR では #222/#223 を一切操作しない**（close / comment / rebase / Ready化 / merge を行わない）。

| PR | 処置 | タイミング | 条件 |
|---|---|---|---|
| **#222 FRP-DESIGN-001** | superseded コメント付き **close** | FRP-DESIGN-002 PR（本書）のリンク確定後 | **人間の明示指示後**に別タスクで実施。後継 PR リンクを含める |
| **#223 FRP-IMPL-001** | superseded コメント付き **close** | FRP-IMPL-002 PR のリンク確定後 | **人間の明示指示後**に別タスクで実施。後継 PR リンクを含める |

### 15.1 close コメント案（placeholder。後継 PR リンク確定後に差し込む）

**#222 close コメント案**:
> POST-225-FRP-REBASE-INVENTORY-001（PR #226）の棚卸し結果に従い、#226 merge 後の orphan HEAD（`021faa8`）を起点に **FRP-DESIGN-002** として新 PR を作成しました: `<FRP-DESIGN-002 PR リンク>`。本 PR の設計内容（§3–§14）は #225 後も 95% 有効で、FRP-DESIGN-002 に引き継ぎ済みです。#225（受付タブ開始導線の撤去）後の前提に合わせて base・文言・スライス番号を更新しています。本 PR は superseded として close します。

**#223 close コメント案**:
> POST-225-FRP-REBASE-INVENTORY-001（PR #226）の棚卸し結果に従い、#226 merge 後の orphan HEAD を起点に **FRP-IMPL-002** として新 PR を作成しました: `<FRP-IMPL-002 PR リンク>`。`validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` は再利用済み。`buildFirstRoundPartialSectionHtml` は構造・ロジックを再利用し、disabled ボタンの旧 PR 番号参照・コメントを新スライス体系に更新済みです。本 PR は superseded として close します。

> いずれの close も **後継 PR が実在し、リンクが確定してから**、かつ **人間の明示指示後**に実施する（「後で作る予定」では不十分）。本 FRP-DESIGN-002 PR では実施しない。

---

## 付記: 今回は実装しない

本書は実装前設計（docs-only）である。`shogi_v4.html` / `index.html` / test / workflow / package は変更していない。実装は後続の FRP-IMPL-002/003/004 で、production 反映はさらに別の release PR で行う。PR #222 / #223 はこの PR で操作していない（close / comment / Ready化 / merge / rebase 未実施）。
