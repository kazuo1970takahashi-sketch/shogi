# PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-DESIGN — 手動変更エラー時の復旧方針設計

**Task ID**: `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-DESIGN`
**作業種別**: docs-only / design check / manual pairing change UX / error recovery
**HEAD**: `e5c13da`（PR #105 squash merge 後の main）
**前提 PR 系列**:
- PR #99 `PAIRING-UX-INVENTORY`
- PR #100 `PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`
- PR #101 `PAIRING-UX-DISPLAY-HELPER-DESIGN`
- PR #102 `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT`
- PR #103 `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`
- PR #104 `PAIRING-UX-SCORE-LIST-READABILITY-DESIGN`
- PR #105 `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`

---

## 1. 目的と非目的

### 1.1 目的

- 対局管理画面「対戦相手の変更」モーダルで運営者が **エラーから抜けられない状態** になる問題を整理する
- 該当文言（`swap`, `2 選手同時の変更は対象外です`）の出所と内部ロジックを関数 + 行番号付きで特定する
- **state.pairings の更新タイミング** を確認し、「rollback が必要か / 既に安全か」を見極める
- 「変更前の組み合わせへ戻す」復旧方針を **文言改善だけに留めず、状態管理の観点から** 設計する
- 次の最小実装 `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT` のスコープを段階化する
- PR #103 で導入した pairing-card 補助ラベル / PR #105 で導入した score-card 別行表示と表示整合する

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `shogi_v4.html` / `test/` / Visual Regression snapshot を変更しない
- 手動変更 UI の全面改修 / drag & drop / 複数選手同時変更 対応はしない
- 「2 選手同時変更を許可する」「自動で最適な入れ替えを提案する」など仕様拡張はしない
- `evaluatePairingQuality()` / `warning object` / pairing algorithm を変更しない
- `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 本体を変更しない
- `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 に踏み込まない

---

## 2. 現状コード確認

### 2.1 該当文言の出所

[`bindChangePairingModalEvents(cls, idx)`](shogi_v4.html:4715) 内、`#chg-save` クリックハンドラ:

| 行 | 出力 | 種類 |
|---|---|---|
| [4722](shogi_v4.html:4722) | `'同じ選手を先手・後手両方に選べません'` | alert（同一選手選択防止）|
| [4723](shogi_v4.html:4723) | `'変更がありません'` | alert（差分無し）|
| **[4728](shogi_v4.html:4728)** | **`'2 選手同時の変更は対象外です。1 名ずつ変更してください'`** | **alert（本 design check の主課題）**|
| [4734](shogi_v4.html:4734) | `'この組み合わせは過去に対戦済みです。再戦として保存しますか？'` | confirm（再戦許可確認、replace 経路）|
| [4741](shogi_v4.html:4741) | `'相手ペアが結果入力済みのため swap できません'` | alert（swap ブロック）|
| **[4748](shogi_v4.html:4748)** | **`'swap で再戦が発生します。別の選手を選んでください'`** | **alert（swap 再戦ブロック）**|
| [4755](shogi_v4.html:4755) | `'swap を実行します。\n ... よろしいですか?'` | confirm（swap 実行確認）|
| [4766](shogi_v4.html:4766) | `'内部エラー: swap 後の重複を検出しました。変更を取り消しました'` | alert（ポスト変更安全網、既に rollback 済み）|

**観察**:
- 該当 2 文言は **alert** で出力（モーダル UI ではなく、`alert()` ブラウザダイアログ）
- `'swap'` という内部用語が **L4741 / L4748 / L4755 / L4766** の 4 箇所に露出している（運営者向け文言として違和感）
- L4755 confirm の本文には `'swap'` だけでなく `'よろしいですか?'` という確認は含まれるが「変更前 / 変更後」の差分は氏名のみで表示済み

### 2.2 state.pairings の更新タイミング（**重要発見**）

[`bindChangePairingModalEvents`](shogi_v4.html:4715) の構造をフローで:

```
#chg-save クリック
├─ L4717-4720: newP1 / newP2 / oldP1 / oldP2 抽出（state は読み取りのみ）
├─ L4722: 同一選手 → alert + return （state 未変更）
├─ L4723: 差分なし → alert + return （state 未変更）
├─ L4725-4728: keepPlayer / X 判定 OR 2 選手同時変更 alert + return （state 未変更）
├─ L4730: otherIdx = findPairContainingPlayer(...)
├─ if (otherIdx === -1) Replace 経路:
│   ├─ L4733-4735: 再戦なら confirm（NG → return、state 未変更）
│   └─ L4737: state.pairings[cls][idx] = {...} ← **state 変更**
└─ else Swap 経路:
    ├─ L4740-4743: 相手ペア winner 確定済 → alert + return （state 未変更）
    ├─ L4747-4750: swap で再戦 → alert + return （state 未変更）
    ├─ L4755: swap 確認 confirm（NG → return、state 未変更）
    ├─ L4757-4758: backup1 / backup2 を保持（state 変更直前）
    ├─ L4760-4761: state.pairings[cls][idx] / [otherIdx] = {...} ← **state 変更**
    └─ L4763-4768: 重複検出 → state 復元（backup1/2 へ）+ alert + return ← **既存 rollback**
└─ L4771: モーダル削除
└─ L4772: renderTournament(cls) + save()
└─ L4777-4789: 永続化検証 + 必要なら notifySaveWarning
```

#### 2.2.1 各エラーパスの state 安全性

| エラー文言 | 行 | state.pairings の状態 | rollback の要否 |
|---|---|---|---|
| 同一選手 | L4722 | 未変更（safe）| 不要 |
| 差分なし | L4723 | 未変更（safe）| 不要 |
| **2 選手同時変更** | **L4728** | **未変更（safe）** | **不要** |
| 相手ペア winner 確定済 | L4741 | 未変更（safe）| 不要 |
| **swap 再戦** | **L4748** | **未変更（safe）** | **不要** |
| 内部エラー（swap 後重複）| L4766 | **変更済 → backup から復元済（既存 rollback）** | 既に実装済 |

**重要結論**:
- **2 選手同時変更 / swap 再戦エラー時に `state.pairings` は変更されていない**
- これは **設計候補 A（検証 OK まで state を変更しない）が事実上既に実装済** であることを意味する
- swap 確定後の重複検出（L4763-4768）には **既に snapshot rollback パターン（候補 B）が存在**（`backup1` / `backup2` で復元）
- → 当初仮説「state が半端に変わっている → 抜けられない」は **不成立**

#### 2.2.2 では「抜けられない」原因は何か（**問題の本質**）

問題は `state.pairings` ではなく **モーダル UI の状態保持** にある:

- alert + return の経路では `document.getElementById('chg-modal').remove()` が **呼ばれない**（L4771 はエラーパスから到達しない）
- → モーダルは **開いたまま**、`#chg-p1` / `#chg-p2` の `<select>` は **ユーザーが選択した「失敗した変更」の値のまま** 残る
- → 「先手 03 → 12」「後手 14 → 07」のように両方変えた後、エラーが出ても **dropdown は変更後の値のまま** 表示される
- → 元の値（03 / 14）を覚えていない / 画面で見えない場合、運営者は **どちらか片方を元に戻せばよいと頭で分かっていても、どちらが元か思い出せない** → ループ状態に陥る

つまり、現場で発生する「抜けられない」状態は:
1. **「変更前の値が見えない」**（モーダル内に元の p1 / p2 表示なし）
2. **「失敗した dropdown 選択値が残る」**（次の試行で同じエラーを再現しやすい）
3. **「内部用語 swap で混乱」**（"swap で再戦" と言われても、何を戻せばよいか連想しづらい）

の **3 要素の合成**であり、state.pairings は無関係。

### 2.3 save() / renderTournament() の扱い

- **save()** ([L4772](shogi_v4.html:4772)): エラーパス（L4728 / L4741 / L4748 等の `return` 経路）では **呼ばれない**
- **renderTournament(cls)** ([L4772](shogi_v4.html:4772)): 同上、エラーパスでは **呼ばれない**
- → エラー後の画面は **再描画されない**。モーダルが手前にあるため、背景の pairing-card は変更前のまま見える（が、モーダルに隠れていて運営者から見えない可能性）

### 2.4 関連 helper / 関数

| 関数 | 行 | 役割 |
|---|---|---|
| `changePairing(cls, idx)` | [4793](shogi_v4.html:4793) | エントリポイント、winner 入力済 block + モーダル生成 |
| `buildChangePairingModalHtml(cls, idx, candidates, match)` | [4689](shogi_v4.html:4689) | モーダル HTML 生成（先手・後手 `<select>` を含む）|
| `bindChangePairingModalEvents(cls, idx)` | [4715](shogi_v4.html:4715) | `#chg-save` クリックハンドラ（本 design check の主対象）|
| `findPairContainingPlayer(cls, playerId, excludeIdx)` | [367](shogi_v4.html:367) | swap 経路で相手ペアを検索 |
| `pairHasRematch(cls, p1, p2)` | [357](shogi_v4.html:357) | 再戦判定（`state.results[cls]` 走査）|
| `getDuplicatePlayersInPairings(cls)` | [377](shogi_v4.html:377) | swap 後重複検出（L4763 で使用）|
| `getName(id, cls)` | [231](shogi_v4.html:231) | 氏名（confirm 文言で使用、L4755）|
| `notifySaveWarning` | （略）| 永続化検証警告（エラーパスでは呼ばれない、L4781）|

### 2.5 まとめ — 設計の出発点（再構築）

| 項目 | 当初仮説 | 実態 |
|---|---|---|
| state.pairings が半端 | あり | **無し（safe）** |
| state rollback が必要 | あり | 不要（既存 backup1/2 パターンは別経路）|
| 抜けられない原因 | state 半端 | **モーダル UI の元値見えない + 失敗 dropdown 値残存 + 内部用語** |
| 候補 A（検証 OK まで state 変えない）| 検討要 | **事実上既に実装済** |
| 候補 B（snapshot restore）| 検討要 | 不要（state が変わっていないため）|
| 候補 C（文言改善のみ）| 不可 | **候補 C + 「モーダル内に元値表示」+「失敗時に dropdown を元値へ戻す」の合わせ技が正解** |

---

## 3. 問題の分類

### 3.1 文言問題（内部用語と運営者向け文言）

**現状**:
- `'swap で再戦が発生します。別の選手を選んでください'` ([4748](shogi_v4.html:4748))
- `'2 選手同時の変更は対象外です。1 名ずつ変更してください'` ([4728](shogi_v4.html:4728))

**論点**:
- `swap` は内部用語。運営者は「入れ替え」の方が直感的
- 「対象外」はシステム都合に見える。「現在は 1 人ずつの変更に対応しています」など中立的表現が良い
- 「別の選手を選んでください」「1 名ずつ変更してください」は **次に何をすればよいかは伝わる**が、**「変更は確定していない」「dropdown を元に戻せ」とは伝わらない**

**改善案（参考、IMPL-LIGHT で確定）**:

| 種別 | 改善文言案 |
|---|---|
| 2 選手同時変更（[4728](shogi_v4.html:4728)）| 「この変更では 2 人を同時に入れ替える必要があります。現在は 1 人ずつの変更に対応しています。**変更は確定していません。** 先手または後手のどちらか 1 つだけ元に戻してから、もう一度お試しください。」 |
| swap 再戦（[4748](shogi_v4.html:4748)）| 「この入れ替えでは、過去に対戦済みのペアが発生します。**変更は確定していません。** 別の選手を選び直すか、キャンセルしてください。」 |
| swap 内部エラー（[4766](shogi_v4.html:4766)）| 「入れ替え後に重複が検出されたため、変更を取り消し、元の組み合わせに戻しました。」（既に rollback 済の事実を運営者向け表現で再記述）|
| 相手ペア winner 確定済（[4741](shogi_v4.html:4741)）| 「この入れ替えに必要な相手ペアは、すでに結果が入力されているため変更できません。」（"swap" を除去） |
| swap 確認 confirm（[4755](shogi_v4.html:4755)）| 「入れ替えを実行します。…よろしいですか?」（"swap" を除去） |

### 3.2 状態管理問題（**実態は安全、UI 状態のみ問題**）

**確認結果**:
- エラーパスでは `state.pairings` は **変更されていない**（§2.2.1）
- rollback / restore は **不要**
- save() は **呼ばれない**（エラーパスから到達しない）
- → **状態管理は既に安全側設計**

**残課題**:
- モーダルが開いたまま、`<select>` には失敗した選択値が残る
- 運営者は **「state はまだ元のまま」** という保証を画面から読み取れない
- 元の p1 / p2 を **モーダル内に明示** しないと「どちらを戻せばよいか」が分からない

### 3.3 復旧導線問題（モーダル UI 設計）

**期待する復旧体験**:
- エラー後、運営者が **「何が起きて、次に何をすれば抜けられるか」** がすぐ分かる
- 「変更は確定していない」が明示される
- 元の組み合わせが **モーダル内で見える**（または `<select>` が自動で元値に戻る）
- 1 人だけ変更し直すための導線が明らかになる
- キャンセルすれば確実に元状態のまま終わる（既存挙動）

**復旧候補**:

| 候補 | 概要 | 効果 | コスト |
|---|---|---|---|
| **R1. 元値の固定表示**（推奨）| モーダル冒頭に「現在のペア: 03 山田 vs 14 鈴木」を読み取り専用テキストで表示 | 元値が常に視覚化、戻す目標が明確 | 低 |
| **R2. エラー時に `<select>` を元値へ自動リセット** | L4728 / L4748 直前で `chg-p1.value = oldP1; chg-p2.value = oldP2;` | 失敗 dropdown が残らない、フレッシュリスタート可能 | 低 |
| **R3. エラー文言に「変更は確定していません」明示** | 文言を §3.1 改善案へ更新 | 認知負荷の軽減 | 最低 |
| R4. [元に戻す] ボタン追加 | モーダル下部に明示ボタン | 直感的 / ボタンが押されないと抜けない | 中 |
| R5. 変更前後の差分表示 | エラーバナー内に変更前後をテキストで | 状況理解は深まる | 中（情報過多リスク） |
| R6. キャンセル後の renderTournament 強制 | 不要（既にキャンセル時は state 未変更）| — | — |

**最小有効案（推奨）**: **R1 + R2 + R3 の組み合わせ**
- R3 は必須（文言改善は単独で意味がある）
- R1 と R2 はどちらか、または両方
- R4 / R5 は **後続フェーズで運用観察後に判断**

---

## 4. 設計方針の候補比較

依頼文の §3 候補 A〜E を、§2.2 / §3.2 の **実態を踏まえて再評価** する。

| 候補 | 概要 | 状態 | 推奨度 |
|---|---|---|---|
| **A. 検証 OK まで state を変えない** | 一時変数で検証 → OK のみ反映 | **既に実装済**（エラーパスで state 不変、§2.2.1） | — |
| B. 変更前 snapshot を保持し NG 時 restore | backup1/2 パターン | swap 確定後の **重複検出経路** で既に実装済（[L4757-4768](shogi_v4.html:4757)）。他のエラーパスでは state 未変更のため不要 | — |
| C. 文言だけ改善 | エラー文言を運営者向けに | 単独では不十分だが **必須要素** | 必須（部分採用）|
| **D. 変更前 / 変更後を表示**（R1 派生）| 元の p1 / p2 をモーダル内に常時表示 | UI 追加最小、効果大 | **推奨（IMPL-LIGHT 対象）** |
| **E. [変更前に戻す] ボタン**（R2 / R4 派生）| エラー時に `<select>` を元値に戻す（R2）/ ボタン追加（R4）| R2 は IMPL-LIGHT に含める、R4 は後続 | R2 推奨（IMPL-LIGHT 対象）、R4 後続 |

### 4.1 推奨方針（IMPL-LIGHT で採用するもの）

| # | 内容 | 依頼文との対応 |
|---|---|---|
| **方針 1** | エラー文言から `swap` を除去し、「変更は確定していません」を含む運営者向け文言へ更新 | 候補 C（§3.1 改善案） |
| **方針 2** | モーダル冒頭に **「現在のペア: 03 山田 vs 14 鈴木」** を読み取り専用で常時表示 | 候補 D（R1）|
| **方針 3** | **2 選手同時変更 / swap 再戦エラー時に `<select>` の値を元の p1 / p2 へ自動リセット** | 候補 E の派生（R2）|
| 方針 4（後続）| [元に戻す] ボタン追加 / 変更前後差分表示 | 候補 D / E の R4 / R5、観察後 |
| 方針 5（やらない）| 「変更前に戻しました」を**事実と異なる場合に出さない** | safety guard |

### 4.2 採用しない / 後回し

- **候補 A の追加実装** — エラーパスで state 不変は既に満たされているため、不要な改修
- **候補 B の追加実装** — swap 確定後の重複検出以外の経路では state が変わっていないため、不要
- **R4 / R5** — IMPL-LIGHT で R1 + R2 + R3 が効くかを観察してから判断

---

## 5. IMPL-LIGHT 案

### 5.1 タスク ID（仮）

`PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT`

### 5.2 スコープ

#### 含める

1. **文言改善**（[`bindChangePairingModalEvents` 4715-4770](shogi_v4.html:4715)）
   - `'swap'` 内部用語を `'入れ替え'` 等の運営者向け表現へ置換（5 callsite: L4741 / L4748 / L4755 / L4766、+ confirm 本文）
   - 2 選手同時変更 alert（L4728）に「変更は確定していません」を含める
   - swap 再戦 alert（L4748）に「変更は確定していません」を含める
   - swap 確認 confirm（L4755）の `'swap'` 除去
   - swap 内部エラー alert（L4766）の `'swap'` 除去 + 「元の組み合わせに戻しました」を明示

2. **モーダル内の現在ペア表示**（[`buildChangePairingModalHtml` 4689](shogi_v4.html:4689)）
   - モーダル冒頭（`<h3>` 直下）に **読み取り専用の「現在のペア: …」表示** を追加
   - 表示は `getName(match.p1, cls)` + `getName(match.p2, cls)`（または `entryNoOf` 込み）
   - エラー後も常に同じ情報を見られる

3. **エラー時の `<select>` 自動リセット**（[`bindChangePairingModalEvents`](shogi_v4.html:4715)）
   - 2 選手同時変更（L4728）/ swap 再戦（L4748）の `alert` の **直前** に:
     - `document.getElementById('chg-p1').value = oldP1;`
     - `document.getElementById('chg-p2').value = oldP2;`
   - これにより `<select>` が変更前値に戻り、運営者は「フレッシュな状態」から再選択できる
   - 既存の `keepPlayer / X` 判定や `state.pairings` には触らない

4. **テスト追加**
   - 静的検査: `'swap'` 内部用語が画面文言から除去されている
   - 静的検査: 「変更は確定していません」相当の語句が 2 選手同時変更 alert / swap 再戦 alert に含まれる
   - 静的検査: モーダル HTML に「現在のペア」表示要素がある
   - 静的検査: エラーパスで `chg-p1.value = ... ; chg-p2.value = ...` の自動リセット呼出がある
   - 静的検査: `state.pairings` の代入が **検証完了後にのみ** 起きる（既存挙動の維持確認）
   - 静的検査: `evaluatePairingQuality()` / `warning object` / `formatParticipantLabel()` / pairing-card 補助ラベル 未変更
   - 静的検査: `getName` / `getNameWithNo` / `entryNoOf` 本体 未変更
   - 振る舞いテスト（可能なら）: mock state で `bindChangePairingModalEvents` を呼び、エラーパスで `state.pairings` が変化しないこと

#### 含めない（後続フェーズ）

- [元に戻す] ボタン追加（R4）
- 変更前後差分の詳細表示（R5）
- swap 経路のロジック自体の変更（2 選手同時変更を許可する等）
- pairing algorithm の変更
- `evaluatePairingQuality()` の戻り値変更
- `warning object` の変更
- pairing-card 補助ラベル（PR #103）の変更
- score-card 表示（PR #105）の変更
- `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 本体の変更
- モーダルの全面リデザイン
- alert を非モーダル（インライン）通知へ置換する大改修
- 既存の swap 後重複検出 rollback（L4763-4768）の挙動変更

### 5.3 想定変更箇所

| ファイル | 想定変更 |
|---|---|
| `shogi_v4.html` | `buildChangePairingModalHtml`（モーダル冒頭に「現在のペア」表示要素を追加、+5〜10 行）/ `bindChangePairingModalEvents`（文言改善 + 2 箇所で `<select>.value = old*` の自動リセット、+10〜20 行）|
| `test/test_pairing_ux_manual_change_error_recovery.js`（新規）| 静的検査 + 可能なら振る舞いテスト |
| `test/run_tests.sh` | stanza 追加 |
| `docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md` | 本ファイルに IMPL-LIGHT 着地節を追記 |
| `HANDOFF.md` | ポインタ追加 |

### 5.4 不変項目（IMPL-LIGHT で守る）

- ✅ `state.pairings[cls]` のエラーパス不変（既存挙動の維持を **新たに保証** する）
- ✅ swap 確定後の重複検出 rollback（L4763-4768）の挙動 不変
- ✅ save() がエラーパスで呼ばれない（既存挙動）
- ✅ renderTournament(cls) がエラーパスで呼ばれない（既存挙動）
- ✅ `evaluatePairingQuality()` / `warning object` 不変
- ✅ `formatParticipantLabel()` API 不変
- ✅ `getName` / `getNameWithNo` / `entryNoOf` 本体 不変
- ✅ pairing algorithm / `generatePairing` / Fisher-Yates ランダム化 不変
- ✅ pairing-card 補助ラベル（PR #103 `data-pairing-aux`）不変
- ✅ score-card 別行表示（PR #105 `.sno` / `.snm`）不変
- ✅ 「現在のペア」表示と PR #105 の `.sno` / `.snm` の書式整合（`A-12` 形式等）
- ✅ Visual Regression snapshot は **意図した変化のみ更新**（モーダル UI の変化は VRT で検出される可能性が低い = モーダル open 状態の snapshot を撮っていない、要確認）

---

## 6. テスト方針

### 6.1 静的検査（必須）

- `'swap で'` 文字列が `bindChangePairingModalEvents` 内の画面文言（alert / confirm の引数）に **含まれない**
- `'2 選手同時の変更は対象外です'` が削除され、「変更は確定していません」または同等の運営者向け表現が含まれる
- `'swap'` を含む文言が L4741 / L4748 / L4755 / L4766 すべてから除去 or 中立表現に置換
- `buildChangePairingModalHtml` のテンプレートに「現在のペア」相当の表示要素が含まれる
- `bindChangePairingModalEvents` 内の 2 選手同時変更経路 / swap 再戦経路で `chg-p1` / `chg-p2` の `value =` 代入がある（自動リセット）
- `state.pairings[cls][idx] = ...` の代入位置が変わっていない（検証後にのみ実行）
- `evaluatePairingQuality()` 戻り値の従来 7 フィールド存続、Phase 2/4 フィールド不在
- `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 定義維持
- pairing-card 補助ラベル（`data-pairing-aux`）維持
- score-card `.sno` / `.snm` 維持
- `generatePairing` 内ランダム化維持

### 6.2 振る舞いテスト（可能なら）

- mock state を用意（A クラス 6 名、現ラウンドのペア 3 つ、過去ラウンドに再戦が発生する組合せを仕込む）
- `bindChangePairingModalEvents` を呼び出す前後で `state.pairings[cls]` を deep clone で比較
  - 2 選手同時変更エラーシナリオ: state 不変、`chg-p1.value` / `chg-p2.value` が元値に戻る
  - swap 再戦エラーシナリオ: 同上
  - swap 成功シナリオ: state 変化（既存挙動）
  - replace 成功シナリオ: state 変化（既存挙動）

DOM mock が重い場合は **静的検査で代替** し、振る舞いテストは IMPL-LIGHT 内では skip 可。

### 6.3 Visual Regression 影響見込み

- モーダルは **デフォルトで non-visible**（クリックで開く）
- 既存 VRT スイート（`test/e2e/visual_regression.spec.js`）が「対戦相手の変更」モーダルを開いている snapshot を撮っているか要確認 — おそらく **撮っていない**
- → モーダル UI 変更は VRT で red になりにくい
- 万一 red になった場合は **PR #103 / #105 と同じ手順** で Linux baseline を限定更新

### 6.4 run_tests.sh

- 新規 `test/test_pairing_ux_manual_change_error_recovery.js` の stanza を追加

---

## 7. リスク

| リスク | 軽減策 |
|---|---|
| `<select>.value = ...` の自動リセットが運営者の選択中の値を破壊する | エラー時にのみ実行（alert 直前）。エラーは「未来に進めない状態」なので、選択値破壊のデメリット < フレッシュリスタート可能のメリット |
| 「現在のペア」表示の書式が PR #105 score-card と不整合 | IMPL-LIGHT で書式を `A-12 山田太郎` に揃える（PR #103 補助ラベル / PR #105 `.sno`+`.snm` と整合） |
| 「変更は確定していません」の追記でメッセージが長くなる | alert 本文に改行を入れる / 全角句読点で読みやすくする |
| `internal error: swap 後の重複` 文言の `swap` を除去すると、過去 console / log の追跡が困難になる | 画面文言から除去するが、`consoleTag` / log 側には `swap` を残す（運用・調査用）|
| swap 経路自体のロジック変更を求められる | IMPL-LIGHT のスコープ外と docs に明示。「2 選手同時変更を許可」は別タスク |

---

## 8. 次タスク候補

| 順位 | 候補 | 規模 | 起点条件 |
|---|---|---|---|
| **第一** | `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT` | 小〜中（+15〜30 行 + テスト）| 本 design check 後 |
| 第二 | **運用観察** | — | 第一着地後、文言改善 + 元値表示 + dropdown リセット で「抜けられない」状態が解消されるか |
| 第三 | `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-MEDIUM` | 中〜大 | 第一で不十分な場合、[元に戻す] ボタン / 変更前後差分表示 / モーダル全面リデザイン |
| 第四 | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 小 | 独立進行可、モーダル option label の `compact` 化（PR #101 §10.3）|
| 後回し | `WARNING-DECISION-SUPPORT-IMPL-PHASE2`（`avoidablePairIndexes`）| 中 | 別観察フェーズ |
| 後回し | `PAIRING-UX-MANUAL-CHANGE-ALLOW-SIMULTANEOUS`（仕様拡張）| 大 | 2 選手同時変更を許可する場合、pairing algorithm との整合確認が必要 |

---

## 9. 推奨 Next Action

### 9.1 第一候補: `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT`

- 文言改善（`swap` 除去 + 「変更は確定していません」明示）
- モーダル冒頭に「現在のペア」表示
- エラー時に `<select>` を元値へ自動リセット
- 静的検査テスト追加
- **state 管理は既に安全側のため触らない**（regression 防止）
- IMPL-LIGHT 後、運用観察フェーズへ

---

## 10. 当面やらないこと

- 今回（本 design check PR）は **実装しない**
- `shogi_v4.html` / `test/` / Visual Regression snapshot を変更しない
- 手動変更の **state 管理改修**（既存挙動が安全なため、不要な改修を避ける）
- 2 選手同時変更を **許可する仕様変更**
- swap 経路のロジック変更
- pairing algorithm / `generatePairing` の変更
- `evaluatePairingQuality()` / `warning object` の変更
- `formatParticipantLabel()` API の変更
- `getName` / `getNameWithNo` / `entryNoOf` 本体の変更
- pairing-card 補助ラベル（PR #103）の変更
- score-card 表示（PR #105）の変更
- モーダル全面リデザイン / drag & drop / 代替 UI 検討
- 「変更前に戻しました」を **state が変わっていないのに表示する** — 事実誤認のミスリーディング表示は避ける（§4.1 方針 5）
- [元に戻す] ボタン追加（R4）/ 変更前後差分表示（R5）— 観察後判断
- `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 の実装着手

---

## 11. 完了条件

本 docs-only PR の完了条件:

- 現状コード確認（§2）が関数 + 行番号付きで整理されている
- 該当文言の出所（§2.1）が表で明示されている
- **state.pairings の更新タイミング（§2.2）** が分析され、「エラーパスで state 不変」が明示されている
- **抜けられない原因の再構築（§2.2.2）** が示されている（state ではなくモーダル UI 状態）
- save() / renderTournament(cls) の扱い（§2.3）が整理されている
- 文言改善案（§3.1）が表で整理されている
- 復旧候補 R1〜R6（§3.3）が整理されている
- 設計候補 A〜E（§4）が **実態を踏まえて再評価** されている
- 推奨方針（§4.1 + §9.1）が R1 + R2 + R3 の組合せとして提示されている
- IMPL-LIGHT スコープ（§5）が含める / 含めないで段階化されている
- テスト方針（§6）が静的検査 + 振る舞いテストの 2 軸で整理されている
- Visual Regression 影響見込み（§6.3）が整理されている
- リスク（§7）が整理されている
- 次タスク候補（§8）が段階化されている
- **実装変更なし** / **テスト変更なし** / **CI 設定変更なし** / **snapshot 未変更**
- 変更ファイルは `docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md`（新規）と `HANDOFF.md` のみ

---

## 11.1 IMPL-LIGHT 着地メモ（追記）

**Task ID**: `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT`
**HEAD**: `7c386bc`（PR #106 squash merge 後の main）

### 実装内容

1. **モーダル冒頭の「現在の対局」表示**（[`buildChangePairingModalHtml`](shogi_v4.html:4689)）
   - `data-chg-current="1"` ブロック内に `data-chg-current-role="p1"`/`"p2"` の 2 行
   - `formatParticipantLabel(player, {mode:'compact'})` で `A-12 山田太郎` 形式
   - `escapeHtml()` 経由で HTML 出力（個人情報保護）
   - 既存モーダル UI に軽量追加（背景色付きの薄い情報ブロック、ヘッダ直下）

2. **エラー時 `<select>` 自動リセット**（[`bindChangePairingModalEvents`](shogi_v4.html:4715)）
   - click handler 内に `resetSelectsToOriginal()` 内部 helper を定義
   - 2 選手同時変更 / 再戦 warning の alert **直前** に呼出
   - `chg-p1.value = oldP1` / `chg-p2.value = oldP2` で UI select のみ復元
   - `state.pairings` には触らない（既存挙動と整合）

3. **UI 文言改善**（5 callsite）
   - 2 選手同時変更（旧 L4728）: 「この変更では、2人を同時に入れ替える必要があります。\n現在は1人ずつの変更に対応しています。\n選択を元に戻しました。もう一度、変更したい選手を1人だけ選んでください。」
   - 再戦 warning（旧 L4748）: 「この変更を行うと、再戦になる組み合わせが発生します。\n選択を元に戻しました。別の選手を選び直してください。」
   - 相手 winner 確定済（旧 L4741）: 「相手ペアが結果入力済みのため、入れ替えできません」
   - swap 確認 confirm（旧 L4755）: 「入れ替えを実行します。…」（"swap" → "入れ替え"）
   - 内部エラー（旧 L4766）: 「内部エラー: 入れ替え後の重複を検出しました。変更を取り消し、元の組み合わせに戻しました」

### state 管理に触っていないこと

- §2.2 の重要発見の通り、エラーパスは既に `state.pairings` 変更前に return している
- 本 IMPL-LIGHT は **UI の迷子状態の解消のみ** にスコープを限定
- `state.pairings` への代入 / rollback 設計 / `backup1`/`backup2` パターン / `save()` 呼出 / `renderTournament(cls)` 呼出 は **一切変更していない**
- swap 確定後の重複検出 rollback（旧 L4763-4768）は **そのまま維持**

### 「組み合わせを元に戻しました」を使わなかった理由（§4.1 方針 5）

- state は元から変更されておらず、ロールバックしていない
- 「組み合わせを元に戻しました」は state rollback を含意する → 事実誤認になる
- 実際に戻したのは UI select の選択値 → 「選択を元に戻しました」のみ採用
- 内部エラー alert（rollback 経路）には別途「元の組み合わせに戻しました」を許可（こちらは実際に state rollback が起きるため事実と整合）

### テスト

- `test/test_pairing_ux_manual_change_error_recovery.js`（新規、69 アサート PASS）
- 静的検査: 旧文言削除 / 新文言含有 / `swap` UI 露出ゼロ / select reset 呼出近接 / state 代入位置 / save 未呼出 / rollback 維持 / 不変項目
- 軽量振る舞い: `formatParticipantLabel(compact)` の出力書式（`A-12 山田太郎`）整合
- `test/run_tests.sh` の 2-6 stanza grep sentinel を新文言に更新
- `test/e2e/shogi_phase4_pairing_swap.spec.js` の alert 文言 expect を新文言に更新
- run_tests.sh 全体 PASS（72 stanza、合計 206 個別アサート相当）

---

## 12. 関連 PR / docs

- 起源系列: PR #99 / #100 / #101 / #102 / #103 / #104 / #105
- 既存 inventory: [docs/notes/20260514_shogi_pairing_ux_inventory.md](docs/notes/20260514_shogi_pairing_ux_inventory.md)
- 既存 spec: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)（Phase 4 で導入された swap 仕様、L4715-4790 のロジック起源）
- 本 PR: `docs(pairing-ux): 手動変更エラー時の復旧方針を整理`
- 変更ファイル:
  - `docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md`（本ファイル、新規）
  - `HANDOFF.md`（PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-DESIGN ポインタ追加）
- 変更しないファイル: `shogi_v4.html` / `test/` / `test/e2e/visual_regression.spec.js-snapshots/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`
