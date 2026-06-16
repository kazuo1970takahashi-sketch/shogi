# START-UX-CONSOLIDATE-001 — 開始導線集約 設計

| 項目 | 内容 |
|---|---|
| ID | START-UX-CONSOLIDATE-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-06-17 |
| ステータス | 設計レビュー待ち（Draft PR） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `3b86edb` |
| 対象ファイル（実装は別PR） | `shogi_v4.html`（START-UX-CONSOLIDATE-IMPL で変更予定） |
| 関連 | FRP-DESIGN-001（#222, Draft/Open）／FRP-IMPL-001（#223, Draft/Open・**保留**）／START-001/003（#218/#219, orphan 残置・production は #221 で revert 済）／1局目高速化設計（#216） |

---

## 0. 要約（TL;DR）

参加者登録タブの「**登録完了・対局開始**」ボタン（`#startBtn`）は、文言から運営者が「登録が終わったら押すボタン」と受け取るのに、実際の挙動は `startTournament()` 経由で **A/B 全クラスの1回戦組み合わせを一括生成** する。これが

- A クラスだけ先に開始し B は後から、という **A/B 別開始**、および
- 今後の **1局目部分開始（FRP / First Round Partial）**

と導線が衝突し、運営者の誤操作と巻き戻し（リセット）を誘発している。

本設計は根本対策として **方針C** を採用する：

> **開始操作を「参加者登録」タブから外し、「対局管理」タブへ集約する。**

`#startBtn` は副作用を持たない「**対局管理へ進むナビゲーション**」に変更し、正規の開始導線は対局管理タブのクラス別開始（`startBtnClass_{cls}` → `startTournamentForClass(cls)`）に一本化する。これは FRP（1局目部分手合い）を安全に積む前提整理である。

本書は **docs-only**。実装（`shogi_v4.html` 変更・テスト更新）は後続の **START-UX-CONSOLIDATE-IMPL** で行う。

---

## 1. 背景・問題

### 1.1 何が起きているか

参加者登録タブ最下部のプライマリボタンは現在こうなっている（orphan `3b86edb` 実測）：

```
shogi_v4.html:270
<button type="button" class="btn-primary" id="startBtn">登録完了・対局開始</button>

shogi_v4.html:7974
document.getElementById('startBtn').addEventListener('click', startTournament);
```

`startTournament()` は全クラスをまとめて開始し、1回戦の組み合わせ（`state.pairings`）を生成する **全クラス一括開始** の入口である。

### 1.2 なぜ問題か

- **文言と責務の不一致**：参加者登録タブにあるため、運営者は「登録が終わったらここを押す」と自然に考える。しかし実体は「全クラスの1回戦を今すぐ確定する」操作であり、押下の重みが文言から伝わらない。
- **A/B 別開始との衝突**：A だけ先に始めたい・B は受付を続けたい、という現場運用に対し、`#startBtn` は **A も B もまとめて開始** してしまう。
- **FRP（部分開始）との衝突**：今後「クラス内の選んだ人だけで1局目を作る」「未割当者を後から1局目に足す」を入れると、全クラス一括開始の `#startBtn` が並存することで、開始系の導線が二重・三重になり混乱する。
- **画面責務として不自然**：登録画面に「対局開始」という重い副作用が同居していること自体が、画面の単一責務を壊している。
- **巻き戻しコスト**：誤って全クラス開始 → 受付がまだ終わっていない → リセット、という事故が起きる。実際に START-001/003（#218/#219）の production 反映 #220 は要件不一致で #221 により revert されており、開始系 UX が安定していないことを示している。

---

## 2. 現状の開始導線（orphan `3b86edb` 実測）

START-UX を正しく設計するため、現状 base に存在する**開始まわりの affordance を網羅**する。**本設計の核心は「(A)(B) を受付タブから外し、(D) に集約する」ことである。**

| # | 場所 | 要素 | 挙動 | 副作用 | START-UX 後の扱い |
|---|---|---|---|---|---|
| (A) | 参加者登録タブ | `#startBtn`「登録完了・対局開始」（L270 / L7974） | `startTournament()` → **全クラス一括開始**・1回戦生成 | あり（pairings 生成） | **ナビ専用化**（副作用除去）。本設計の主対象 |
| (B) | 参加者登録タブ | `reg-class-start` 各クラスボタン（`regClassStartBtnId(cls)` L3966 ／ #219 由来） | `onClickClassStart` → `startTournamentForClass(cls)` → **当該クラス一括開始** | あり（pairings 生成） | **受付タブから撤去**。開始は対局管理タブへ集約 |
| (C) | 参加者登録タブ | readiness 表示（`renderClassReadiness` ／ #218 由来） | 開始可否の派生テキスト表示のみ | なし（読み取り専用） | 表示自体は無害。§5・§9 参照（情報表示は可、ただし開始トリガは置かない） |
| (D) | 対局管理タブ | `startBtnClass_{cls}`（L6704 / L6715-6717） | `startTournamentForClass(cls)` → 当該クラス一括開始 | あり（pairings 生成） | **正規の開始導線として保持**（§7） |

> 注: (B)(C) は START-001/003（#218/#219）由来で、**production からは #221 で revert 済みだが orphan clean base には残存** している（[`HANDOFF.md`](../../HANDOFF.md) 参照）。production の現状（#221 後）は (A)+(D) のみで (B)(C) は無い。base が orphan のため、本設計と IMPL は **(A) に加えて (B)(C) も受付タブから外す**ことを範囲に含める。これにより「参加者登録タブ＝登録のみ」を base 非依存で達成する。

---

## 3. 採用方針

### 3.1 方針C を採用 — 開始操作を対局管理へ集約

参加者登録タブから対局開始処理（およびその入口ボタン）を外し、開始操作を **対局管理タブへ集約** する。

### 3.2 案A は不採用 — 単なるリネーム

「`登録完了・対局開始`」を「`全クラス一括開始`」等へ**リネームするだけ**の案は採用しない。

**不採用の理由：**

- 根本原因である「**参加者登録タブに開始副作用がある**」問題が残る。文言を変えても、登録画面で全クラスが開始される構造は変わらない。
- 小さな修正PRが増え、レビュー・merge・rollback のリスクが積み上がる（START-001/003 の轍）。
- 注意書きや文言変更だけでは、運営者の誤操作を**根本的には防げない**。
- 受付タブに開始ボタンが残るため、今後の **FRP（部分開始）導線と混ざりやすい**。

→ リネームは「副作用を残したまま見た目を変える」対症療法であり、START-UX が解こうとしている「画面責務の分離」を達成しない。

---

## 4. 画面責務の再定義

### 4.1 参加者登録タブ（受付）の新しい役割 — 登録のみ

参加者登録タブの責務は以下に限定する。**開始系の副作用・ボタンを置かない。**

- 参加者登録
- A/B クラス振り分け
- 会費確認
- 過去参加者から選択
- 名前編集
- 登録内容の確認

### 4.2 対局管理タブの役割 — 開始と進行

対局管理タブが開始・進行のすべてを担う。

- A/B 別開始
- 1回戦組み合わせ作成
- 勝敗入力
- 再生成
- リセット
- （今後）「**選んだ人から1局目を開始**」（FRP-IMPL-001）
- （今後）「**未割当者を1局目に追加**」（FRP-IMPL-002）

---

## 5. `#startBtn` の新仕様案（START-UX-CONSOLIDATE-IMPL で実装）

### 5.1 文言

```
登録内容を確認して対局管理へ
```

### 5.2 動作

押下時は **対局管理タブへ移動するだけ**。タブ遷移以外の副作用を持たない。

### 5.3 禁止される副作用（ナビゲーション以外は一切しない）

押下によって、以下を**いずれも行ってはならない**：

- `state.pairings` を変更しない
- `state.results` を変更しない
- `state.classes[].started` を変更しない
- 互換用 `state.started` を変更しない
- `generatePairing()` を呼ばない
- `startTournament()` を呼ばない
- `startTournamentForClass()` を呼ばない
- 1回戦組み合わせを作らない

### 5.4 id 方針

- **短期は `id="startBtn"` を維持してよい。**
  - 理由：既存 DOM 参照・既存テストの破壊を避けるため。`#startBtn` を別 id に変えると、参照箇所とテストの広い書き換えが連鎖する。
- ただし**意味は「開始」から「対局管理へ進む」へ変わる**。テスト名・コメント・ラベルでは「開始ボタン」ではなく「**対局管理へ進む導線（ナビゲーション）**」として扱う。
- 将来的には `goTournamentBtn` 等への改名を**別PRで**検討する（本PR・IMPLでは行わない）。

### 5.5 (B)(C) 受付タブ class 導線の扱い（base=orphan 固有）

§2 の (B) `reg-class-start`／(C) readiness 表示は **受付タブから外す**。

- (B) 開始ボタン：受付タブから撤去する。開始は対局管理タブ (D) に一本化する。
- (C) readiness 表示：**開始トリガを伴わない純粋な情報表示**であれば受付タブに残してもよい（例：「A クラス：開始可能」のステータス文）。ただし「開始」アクションは受付タブに置かない。実装判断は IMPL で確定（情報表示も対局管理タブへ寄せる選択肢を含めてよい）。
- この撤去・移設も「タブ移動のみ／開始系 state は不変」の原則（§5.3）を守る。

---

## 6. `startTournament()`（全クラス一括）の扱い

START-UX-CONSOLIDATE では **削除しない**。

**方針：**

- **UI からは呼ばない**（`#startBtn` の click ハンドラから外す）。
- `legacy` / `deprecated` helper として残す（コメントで明示）。
- 削除・リネームは**後続PRで棚卸し**する。

**理由：**

- 既存テストや E2E が `startTournament()` に依存している可能性がある。
- 削除まで同時にやると影響範囲が大きく、START-UX の主目的（受付タブから開始副作用を外す）がブレる。
- 今回の目的はあくまで「**受付タブから開始副作用を外す**」こと。関数の物理削除は別の関心事。

**全クラス一括開始そのものの位置づけ**：通常 UI の主導線からは外す。必要なら将来、詳細操作・管理者操作として別途検討する（主導線には出さない）。

---

## 7. 正規の開始導線

正規の開始導線は **対局管理タブのクラス別開始** とする。以下は**必ず保持**する（挙動・シグネチャを変えない）：

- `startBtnClass_{cls}`（対局管理タブの各クラス開始ボタン）
- `startTournamentForClass(cls)`
- `validateStartableClass(cls)`

文言は後続 IMPL で明確化してよい。例：

- `A クラス全員で1局目を開始`
- `B クラス全員で1局目を開始`

ここでいう「**全員**」は **そのクラス内の全員** を意味する（全クラス一括ではない）。`startTournamentForClass('A')` は A だけを開始し、B を破壊しない。

> FRP（部分開始）は「クラス内の**選んだ人だけ**で1局目」を後から積む別レイヤ（#222/#223）。本設計の「クラス内全員開始」と FRP の「クラス内部分開始」は**対局管理タブ内で共存**する（受付タブには出さない）。

---

## 8. class status の扱い（派生ステータス案）

**保存 schema は今回増やさない。** まずは既存 state から**派生**する（保存しない）。

| ステータス | 導出条件 |
|---|---|
| 未開始 | `isClassStarted(cls) === false` |
| 部分開始 | `isClassStarted(cls) === true` かつ `state.results[cls].length === 0` かつ 未割当者が存在 |
| 全員1局目開始済み | `isClassStarted(cls) === true` かつ `state.results[cls].length === 0` かつ 未割当者が 0 |
| 進行中 | `state.results[cls].length >= 1`、または現在ラウンドの対局が存在し勝敗入力中 |

> 「未割当者」は `players − pairings`（当該クラス）から**派生**する（保存しない）。FRP-DESIGN-001（#222）の `getUnassignedFirstRoundPlayers` と同じ派生方針。

**新しい `classStatus` enum を保存するのは、2局目以降の逐次進行など本格的な非同期進行に入るタイミングで再検討する**（今は時期尚早。早期の schema 化は §11 の危険パターン）。

---

## 9. テスト方針（START-UX-CONSOLIDATE-IMPL で実装）

最低限、以下を満たすテストを用意・更新する。

| # | 検証内容 |
|---|---|
| 1 | `#startBtn` 押下で**対局管理タブへ移動**する |
| 2 | `#startBtn` 押下で `state.pairings` が変わらない |
| 3 | `#startBtn` 押下で `state.results` が変わらない |
| 4 | `#startBtn` 押下で `state.classes[].started` が変わらない |
| 5 | `#startBtn` 押下で互換用 `state.started` が変わらない |
| 6 | `#startBtn` 押下で `generatePairing()` が呼ばれない |
| 7 | `#startBtn` 押下で `startTournament()` が呼ばれない |
| 8 | `#startBtn` 押下で `startTournamentForClass()` が呼ばれない |
| 9 | 既存の「`#startBtn` で1回戦が生成される」前提のテストは、**赤/skip 放置せず、新仕様（ナビのみ）に更新**する |
| 10 | `startTournamentForClass('A')` は A だけ開始し、B を破壊しない |
| 11 | `validateStartableClass` の **2名以上・偶数条件を緩めない**（既存ガード維持） |
| 12 | 既存保存データを開いても、ナビゲーションボタン押下で状態を壊さない |

> 追加（base=orphan 固有・§5.5）：受付タブから (B)`reg-class-start` を撤去した後、対局管理タブの (D)`startBtnClass_{cls}` でクラス別開始が従来どおり機能することを確認する。

---

## 10. 保存・未確定入力の注意

`#startBtn` が開始副作用を失うことで、**旧来の「開始ボタン押下時の暗黙の保存タイミング」が消える可能性**がある。IMPL 前に必ず確認する。

- 参加者追加・名前編集・クラス変更・会費区分変更が **autosave されているか** を IMPL 前に確認する。
- タブ移動で**未確定入力が失われない**こと。
- 必要なら、ナビゲーション前に既存の保存処理または入力反映処理を呼ぶ。**ただし開始系 state（pairings/results/started）は変更しない。**

---

## 11. 危険な実装パターン（やってはいけない）

- `#startBtn` の**文言だけ変えて、裏で `startTournament()` が走る**（案A＋偽装。最悪パターン）。
- `#startBtn` の**旧テストを skip して通す**（赤を隠す）。
- `validateStartableClass` を**部分開始用に緩める**（2名以上・偶数条件の改変）。
- `startTournamentForClass(cls)` を**削除・共用化で壊す**。
- **#223 を旧 UX 前提のまま merge する**（受付タブに旧 `#startBtn` が残った前提）。
- タブ移動だけのはずが **pairings / results / started を変更する**。
- 未割当者や `classStatus` を**早期に保存 schema 化する**。
- 受付タブに**部分開始・append 導線を出す**（受付＝登録のみの原則違反）。
- **START-UX と FRP append を同一PRに詰め込む**（関心の混在）。

---

## 12. #223（FRP-IMPL-001）の扱い

FRP-IMPL-001 / **PR #223 は今すぐ Ready 化・merge しない**。

**理由：**

- #223 は **参加者登録タブに旧 `#startBtn` が残った前提**で作られている。
- START-UX 整理前に部分開始導線を増やすと、開始系導線がさらに混乱する。
- START-UX-CONSOLIDATE 後に **rebase / adopt / 作り直し** 判断を行う。

**確定事項：**

- #223 は **Draft/Open のまま保留**。
- **close しない。**
- **Ready 化しない。**
- **merge しない。**
- **START-UX-CONSOLIDATE-IMPL 後に再評価**する。

---

## 13. 推奨PR分割

| 順 | PR | 内容 | 種別 |
|---|---|---|---|
| 1 | **START-UX-CONSOLIDATE-DESIGN**（本PR） | 画面責務・開始導線・副作用禁止・テスト方針を確定 | docs-only |
| 2 | **START-UX-CONSOLIDATE-IMPL** | `#startBtn` をナビ専用化／開始副作用除去／(B)(C) 受付撤去／テスト更新／`startTournamentForClass` 維持 | 実装 |
| 3 | **FRP-IMPL-001 再開** | #223 を新 UX 前提に rebase / adopt / 作り直し判断。部分開始 + 未割当一覧 | 実装 |
| 4 | **FRP-IMPL-002** | 選択者で append 作成／未割当者を1局目に追加 | 実装 |

---

## 14. スコープ外（本設計が扱わないこと）

- `startTournament()` の物理削除・リネーム（後続棚卸し）。
- `#startBtn` の id 改名（`goTournamentBtn` 等は将来の別PR）。
- `classStatus` enum の保存 schema 化（2局目以降の非同期進行に入る時点で再検討）。
- 2局目以降の逐次手合い／完全自動手合い（FRP-DESIGN-001 で No-Go）。
- production 反映（別 release PR、base=production）。

---

## 15. このターンの変更有無（正確な記録）

- **production / main / orphan clean base への直接変更なし**（いずれの HEAD も前進・改変していない）。
- 変更は本 docs-only ブランチ `docs/start-ux-consolidate-001-design`（base=orphan `3b86edb`）上の 2 ファイルのみ：
  - `HANDOFF.md`（orphan は HANDOFF.md を追跡していないため新規作成）
  - `docs/specs/20260617_start_ux_consolidate_001_design.md`（本書・新規）
- `shogi_v4.html` / `index.html` / `test/` / `.github/`（workflow）/ `package*.json` は**無変更**。
- #222 / #223 は**変更していない**（#223 の rebase/adopt も行っていない）。
- Draft PR として作成。**Ready 化 / merge / deploy / publish / release は未実施**。branch 削除なし。
