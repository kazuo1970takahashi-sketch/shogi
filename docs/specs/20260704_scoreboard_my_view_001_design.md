# SCOREBOARD-MY-VIEW-001 — 参加者向け「対局者を探す＋個人ビュー」設計

| 項目 | 内容 |
|---|---|
| ID | SCOREBOARD-MY-VIEW-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-07-04（改訂: モック検証で「星取表を既定・行タップで個人ビュー・検索/絞り込み」に確定） |
| ステータス | Draft（レビュー前・実装は後続 SCOREBOARD-MY-VIEW-IMPL） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（HEAD は branch ref を正とする） |
| 対象ファイル（実装は別PR） | `shogi_v4.html` のみ（`index.html` / `.github` / `package*` は触らない） |
| 親機能 | LIVE-MOBILE-SCOREBOARD-001（`#scoreboard` 閲覧専用ビュー・read-only・storage 追従） |
| 関連 | LIVE-BROADCAST-001（ネット越し配信・本ビューをそのまま公開面に載せる） |
| 準拠 | STYLE-GUIDE §1 色 / §2 ボタン / §4 文言 / §6 レイアウト・CLAUDE.md 拘束9ルール・REFERENCE §3 データモデル不変条件 |

---

## 0. 要約（TL;DR）

既存の `#scoreboard` は **クラス全体の星取表** を出すが、(a) 人数が増えると自分（や気になる対局者）の行を番号頼りに目視で探すのが負担、(b) 参加者が最も知りたい「**次は誰と・何卓か**」が星取表（確定済みの過去結果）に出ない。

観戦者の心理は「**あのライバルは誰に勝って誰に負けたか**」を追うことなので、**関係が見える星取表を既定のまま主役に据える**。その上で2つを足す:

1. **対局者を探す導線**（クラス絞り込み＋番号/名前検索）。「自分だけ」ではなく本人・お子さん・気になる人を誰でも引ける照会。
2. **行タップ → 個人ビュー**。選んだ対局者の **現在順位・勝敗・次の対戦（卓・相手名）・これまでの対戦（相手名で縦に）** を表示。星取表の升目は相手 **番号**（レイアウト上名前が入らない）だが、**個人ビューでは相手を名前で読める**——「一覧＝関係の俯瞰／個人＝名前で精読」の二層。

**新しい保存スキーマを一切足さない**（`sanitizeMatch` が剥がすため無意味・REFERENCE §3）。選択状態は既存 `_sbClassFilter` と同じ **memory-only 非保存**。順位・勝敗・相手・卓番号はすべて **既存の派生関数を再利用**して算出し、ロジックを複製しない。read-only 原則（運営UIへの導線を持たない）は親機能のまま維持する。

本書は **docs-only**。実装は後続 **SCOREBOARD-MY-VIEW-IMPL**（Draft PR で停止）。UI はモック（`live_broadcast_hoshitori_v4`）で確定した見た目に準拠する。

---

## 1. 背景・問題

### 1.1 いま何ができるか（親機能の現状・実測）

`LIVE-MOBILE-SCOREBOARD-001`（`shogi_v4.html` 実装）:

- `#scoreboard` / `#viewer` / `#mobile-standings`（または `?view=scoreboard`）で運営画面と物理分離したフルスクリーン閲覧ビューを起動（`applyScoreboardRoute`）。
- `renderScoreboard()` が coordinator。`buildScoreboardClassTableHtml(cls)` が1クラス分の星取表（順位・氏名・各回戦の ○/×/－ と相手番号 `#NN`・勝/負/B/C）を組む。
- クラスが複数あれば `全クラス / クラス別` の **フィルタタブ**（`_sbClassFilter`・memory-only）。
- 別タブの `save()` を **storage イベントで追従**して自動再描画（リアルタイム）。
- **read-only 徹底**：運営画面への戻り導線を一切持たない（Codex Must Fix 1）。

### 1.2 何が足りないか

- 数十人になると、目的の対局者の行を **番号 `#NN` を頼りに目視で探す** のが負担。クラス絞り込みはあるが個人を引く手段が無い。
- 参加者が最も知りたい「**次は誰と・何卓か**」は現手合せ（`state.pairings`）にあるが、閲覧ビューに導線が無い。
- 星取表の升目は相手 **番号** で、その場では「誰と」が名前で分からない（番号→氏名の照合が要る）。

### 1.3 なぜ「最小」で解けるか

必要な材料はすべて既に `state` と既存関数にある（§4）。**新規集計ロジック・新規保存フィールドは不要**。既定の星取表描画に「探す導線」と「1人の個人ビュー」を重ねるだけで成立する。

---

## 2. スコープ

### 2.1 やること

1. `#scoreboard` に **対局者を探す**導線（クラス絞り込みチップ＋番号/名前検索）を追加。
2. 星取表の **行タップ**、または検索結果の選択で、その対局者の **個人ビュー** を開く（`buildScoreboardPlayerViewHtml`）。
3. 個人ビューは「現在順位・勝敗・**次の対戦（卓・相手名）**・**これまでの対戦（相手名で縦に）**」を表示。
4. 選択者のクラスへ `_sbClassFilter` を自動追従。個人ビューから一覧へ戻れる（read-only 内で完結する戻り。運営画面へは戻らない）。
5. 追加は **表示専用**。state 書き込み・運営UIへの導線は無し（read-only 維持）。

### 2.2 やらないこと（明示的に後回し／別スライス）

- **端末ごとのURL/QR で各自スマホから開く**：`localStorage` は端末別のため配信基盤が前提。**LIVE-BROADCAST-001** が担う（本ビューはその公開面に再利用される）。
- **本人認証 / 個人の識別**：閲覧専用・公開情報のみ。なりすまし防止はしない。
- **選択の永続記憶**：memory-only。共有画面で次の人が選び直す運用（キオスク）を正とする（LIVE-BROADCAST-001 §5.3 の無操作リセットと整合）。
- **升目タップで相手名のふきだし表示**：将来拡張（まず個人ビューで名前を出せば十分）。
- **通知・プッシュ**。

---

## 3. UX 設計（モック `live_broadcast_hoshitori_v4` 準拠・STYLE-GUIDE 準拠）

### 3.1 既定＝星取表（相手が見える）

```
[ 将 沼津支部 月例将棋大会      ● ライブ ]   ← sb-head（既存＋配信状態）
[ A級 | B級 ]  [ 🔍 番号・名前で探す ]        ← クラス絞り込み＋検索（新規）
 ○=勝ち ×=負け ・ 数字は相手の番号 ・ 行タップで相手名  ← 凡例
┌───┬────────┬──1──┬──2──┬──3──┬勝敗┐
│順 │氏名(固定)│ ○3 │ ○12│ ○5 │3–0│   ← buildScoreboardClassTableHtml
│ 1 │田中健一  │     │     │     │   │      （既存・升目=○/×＋相手番号）
│ 2 │山田太郎  │ ○5 │ ×7 │ ○3 │2–1│   ← 行タップで個人ビューへ
└───┴────────┴─────┴─────┴─────┴───┘
（回戦が増えたら升目部を横スクロール・氏名列は sticky 固定）
```

- **氏名列 sticky・回戦列 横スクロール**：既存の `sb-scroll` 方式を踏襲（多回戦でも氏名が常に見える）。
- **升目**：`○/×`（色）＋直下に相手 **番号**（小さく）。名前は入れない（幅の都合）。
- 1位のみ淡い強調（既存 `sb-row-1` 相当）。色は勝=緑・負=赤・primary=紺に限定（新色なし）。

### 3.2 対局者を探す（クラス絞り込み＋検索）

- **クラス絞り込み**：既存 `_sbClassFilter` をセグメント/チップUIで提示（全クラス/各クラス）。
- **検索**：番号または氏名/よみの前方一致・部分一致で候補を絞る。入力は `<input>` 1つ。結果を軽いリストで出し、タップで個人ビューへ。数十人規模での探し負担を解消（J5）。
- 絞り込み・検索は **表示フィルタのみ**（memory-only）。未入力なら従来どおり全体星取表。

### 3.3 個人ビュー（行タップ／検索選択で開く）

```
[ ← 山田太郎        A級・No.12   ● ライブ ]
  2 位 / 8名     現在の成績 2勝 1敗
┌ 次の対戦・4回戦 ────────────┐
│ ♟ 3卓　高橋六郎                │   ← bg-accent で主役化（最も見たい情報）
└──────────────────────────────┘
 これまでの対戦
  1回戦  ○  佐藤一郎        No.5
  2回戦  ×  田中健一        No.7     ← 相手を「名前」で縦に
  3回戦  ○  鈴木五郎        No.3
```

- **次の対戦**を視覚の中心に（`bg-accent`）。参加者が最も知りたい情報。
- **これまでの対戦**は相手を **名前** で縦に（`getName`）。升目に入らない名前をここで読ませる。
- 「← 戻る」は **一覧（星取表）へ戻るだけ**。運営画面へは戻らない（read-only 不変）。

### 3.4 「次の対戦」の文言（静的表示・STYLE-GUIDE §4）

- 現手合せに対局あり：`次の対戦・{n}回戦 / {卓}卓　{相手氏名}`（相手番号も併記可）。
- 手合せ済み・勝敗未入力でも同じ（卓・相手は確定済み）。
- 全回戦終了（`results.length >= rounds`）：`全対局が終了しました（最終結果）`。
- 現手合せに居ない（待機/未割当・部分開始）：`次の対戦：まだ決まっていません`（「待機」＝不戦勝ではない・断定しない）。

### 3.5 色・文言

- **新色を足さない**（§1）。○×は既存 `sb-mark-*`／個人ビューの強調は primary `#1F3864` と `bg-accent` 系。
- 文言：名詞止め／です・ます。「対局者を探す」「次の対戦」「これまでの対戦」。「自分を選ぶ」単独の語は使わない（本人限定と誤解させるため）。

---

## 4. データ・派生（既存関数の再利用マップ）

**すべて既存の派生／表示関数。新規の集計ロジックを書かない。**

| 必要な値 | 取得元（実在関数・実測） | 備考 |
|---|---|---|
| 順位 | `computeDisplayRanks(calcFinal(cls), cls)` の並びから当該 `id` の要素 | `finals[i].p.id===focusId` の `ranks[i]`。親表と同一 |
| 勝/負 | `calcFinal(cls)` の `f.A`（勝）・`f.played - f.A`（負） | 親表と同一式 |
| 相手氏名（これまでの対戦） | 各 `results[r]` から当該 `id` を含む match → 相手 id → `getName(oppId,cls)` / `yomiOf` → `playerNameRubyHtml` | 個人ビューの「名前で読む」層 |
| 相手番号（升目） | `entryNoOf(cls, oppId)` | 星取表の升目は番号（既存どおり） |
| 回戦数 | `roundsForClass(cls)` | 終了判定 `results.length >= rounds` |
| 次の対戦（相手/卓） | `state.pairings[cls]` を走査し `p1===focusId || p2===focusId` の match | **卓番号 = index+1**（派生）。相手 = 他方の id → `getName` |
| 検索対象 | `getName` / `yomiOf` / `entryNoOf` | 番号・氏名・よみで前方/部分一致 |
| 現存クラス/参加者 | `getRegistrationClassList()` / `isSafeClassId()` / `state.players[cls]` | `renderScoreboard` の既存フィルタと同条件 |

> 派生（非保存）の原則を踏襲：**卓番号 = index+1**、**ラウンド番号 = results.length+1**。新規保存フィールドを足さない（`sanitizeMatch` が剥がす・REFERENCE §3 / 拘束ルール）。

---

## 5. 実装スライス境界（build / bind / coordinator）

親機能の build/bind/coordinator を壊さず、**追加中心**で載せる。

| 追加/変更 | 種別 | 内容 |
|---|---|---|
| `var _sbFocusId=null;` `var _sbSearch='';` | 追加（memory-only） | 選択中の対局者・検索語。`_sbClassFilter` と同格の非保存変数 |
| `buildScoreboardFinderHtml()` | 追加（build・pure） | クラス絞り込み＋検索フィールド＋検索結果リスト HTML。氏名/番号は escape 経由 |
| `buildScoreboardPlayerViewHtml(cls, focusId)` | 追加（build・pure） | 個人ビュー HTML（順位・勝敗・次の対戦・これまでの対戦を相手名で）。§3.3/§3.4 |
| `sbFindCurrentMatch(cls, id)` | 追加（pure helper） | `state.pairings[cls]` から `{oppId, table}` or null。現手合せ参照のみ |
| `sbOpponentsByRound(cls, id)` | 追加（pure helper） | `results` を走査し各回戦の `{round, won, oppId}` 配列。ロジック複製せず既存 results を読むだけ |
| `buildScoreboardClassTableHtml(cls, sourceState, focusId)` | **引数追加** | optional `focusId`。一致行に `sb-row-me` 付与＋行を tap 可能に。**未指定時の出力は完全不変**（既存 `sourceState` optional 引数と同じ後方互換＝拘束ルール1「引数整理は許容」の範囲） |
| `renderScoreboard()` | 変更（coordinator） | finder を `sb-head` と表の間に挿入・`_sbFocusId` 有時は個人ビューを表示・行 tap と検索選択を bind（`_sbFocusId` セット→クラス追従→再描画）・「戻る」で `_sbFocusId=null` |
| CSS `.sb-finder` / `.sb-player` / `.sb-next` / `.sb-history` / `.sb-row-me` | 追加（新規 class のみ） | 既存 CSS の挙動を変えない（拘束ルール3）。色は緑/赤/primary/bg-accent の既存意味色のみ |

- **read-only 維持**：追加要素はいずれも表示・フィルタのみ。`save()` 等の書き込み・運営画面への戻り導線を **一切足さない**。個人ビューの「戻る」は一覧（星取表）へ戻るのみ。
- **build/bind/coordinator 分離維持**（拘束ルール2）。**ES5 / グローバル state 維持**（拘束ルール4）。

---

## 6. 受入条件（Acceptance Criteria）

1. `#scoreboard` を開くと従来どおり全体星取表が出る（**未選択・未検索時の描画は現状と完全一致**＝GOLDEN 不変）。
2. クラス絞り込み・番号/名前検索で、目的の対局者を数タップ以内に見つけられる。
3. 星取表の行タップ、または検索結果の選択で、その対局者の **個人ビュー** が開く。
4. 個人ビューに、現在順位・勝敗・**次の対戦（卓・相手名）**・**これまでの対戦（相手名で各回戦）** が出る。
5. 個人ビューの順位・勝敗は星取表の当該行と**一致**し、次の対戦の卓/相手は運営「対局管理」の現手合せと**一致**する。
6. 「戻る」で一覧（星取表）へ戻る。運営画面への戻り導線・編集/保存UIは**一切出ない**（read-only 不変）。
7. 別タブ運営画面の勝敗入力→保存で、選択/検索を保持したまま自動更新される（storage 追従）。
8. 選択者が参加者から消えた場合クラッシュせず一覧へ自動復帰。0名クラス/未開始でも空表示のみ（`sb-empty` 相当）。
9. 氏名・番号・相手名はすべて escape 経由で描画（XSS 安全）。多回戦でも氏名列 sticky＋升目横スクロールで読める。

## 7. テスト計画

- `bash test/run_tests.sh shogi_v4.html` を **WARN=0 で** 実行（実在しないテスト参照を増やさない・拘束ルール5）。
- 期待関数の **present/構造チェック** を壊さない。新規関数を present-check に足す場合も既存 pin を減らさない。
- **純関数テスト**：`sbOpponentsByRound` / `sbFindCurrentMatch`（相手名・卓・勝敗の一致、最終結果・待機の分岐）。
- **escape ヒューリスティック**：氏名/番号/相手名は `escapeHtml` / `playerNameRubyHtml` / `entryNoOf`+escape 経由に統一。
- 手動確認（スマホ幅 `<600`）：検索→個人ビュー→戻る→storage 追従、多回戦の横スクロール、空/最終結果/待機の各分岐。

## 8. リスクと軽減

| リスク | 軽減 |
|---|---|
| 既存全体表示の出力が変わる（GOLDEN 差分） | `focusId`/検索は optional・未使用時の分岐を通さない。未選択描画のバイト等価を GOLDEN で確認 |
| read-only 破り（書き込み/運営へ戻る導線） | 追加は build/表示のみ。「戻る」は一覧まで。方針を PR 説明とレビュー観点に明記 |
| 保存スキーマ汚染 | 新規 state フィールドを足さない。選択/検索は memory-only。normalize 往復の恒等性に影響なし |
| CSS 挙動変化（拘束ルール3） | 新規 class のみ追加。既存 `.sb-*`・`section` 閉じタグ省略に触れない |
| 同姓同名 | 検索結果・個人ビューに `No.{entry_no}` を併記して一意化（same-name-members-policy と整合） |
| 升目の相手番号が分かりにくい | 名前は個人ビューで解決（二層設計）。凡例で「数字＝相手番号・行タップで名前」を明示 |

## 9. 工程・ロールアウト

- 本書 = **設計（docs-only / L1–L2 相当）**。GitHub へ定型ヘッダ＋凍結マーカー（`verdict:`）を書き戻して1工程完了。
- レビュー：UI を触るため STYLE-GUIDE 準拠チェック（§1/§2/§4/§6）。実装は別セッション・別素性のレビュー（L4 code-review は Codex）。
- 実装（SCOREBOARD-MY-VIEW-IMPL）：**追加/最小改変中心**・Draft PR で停止。**LIVE-BROADCAST-001 と UX 上不可分**のため、配信の実用フェーズ（Phase 2〜3）と同一リリースで束ねる。
- production 反映時：`index.html` + `shogi_v4.html` を公開し **`?v=N` をインクリメント**（拘束ルール9）。

---

正本ポインタ：親機能 = `LIVE-MOBILE-SCOREBOARD-001`（`shogi_v4.html`）／配信 = `docs/specs/20260704_live_broadcast_001_participant_realtime_design.md`／データモデル不変条件 = `docs/REFERENCE.md` §3／UI 規約 = `docs/STYLE-GUIDE.md`／Phase2（端末別配信の前提）= `docs/specs/20260620_data_persistence_phase2_stagea_design.md`。
