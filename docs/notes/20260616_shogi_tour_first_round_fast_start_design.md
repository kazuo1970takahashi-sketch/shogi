# 1局目高速化 設計メモ — SHOGI-TOUR-FIRST-ROUND-FAST-START-DESIGN-001

| 項目 | 値 |
|---|---|
| Task ID | `SHOGI-TOUR-FIRST-ROUND-FAST-START-DESIGN-001` |
| 作成日 | 2026-06-16 |
| 対象 | `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）。**本メモはコードを変更しない** |
| 種別 | docs-only 設計メモ（後続実装用 MVP 仕様） |
| ベース branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（orphan clean base ＝ 本線。`main` ではない。tip `f5a822c`＝PR #214 内包） |
| 価値ピラー | **「早く始められて」**（[Phase 2 親ドキュメント §1.2](20260616_shogi_tour_phase2_program_001.md) の 3 ピラーの 1 つ） |
| 関連 | [Phase 2 親ドキュメント](20260616_shogi_tour_phase2_program_001.md)（傘・スコープ・横断原則）／[大会後 現場要望 設計](20260614_shogi_tour_post_event_requests_design.md)（ビジョン正本）／[大会履歴 MVP 設計](20260615_shogi_tour_history_mvp_design_001.md)（保存単位・非破壊原則の先例） |

---

## 0. このメモの位置づけ・スコープ

### 0.1 目的

「**受付完了から 1 局目開始までの待ち時間を短くする**」ための **最小仕様（MVP）** に絞って設計する。
実装はしない。`shogi_v4.html` には触れない。保存データ実装も変更しない。

具体的には次の 3 点を満たす導線を設計する:

1. **待ち時間の短縮** — 受付が全部終わるのを待たず、準備できたクラスから 1 局目を始められる。
2. **迷わない PC 操作** — 幹事が「いま開始してよいか／何が足りないか」を**一目で**判断でき、エラーを
   踏んでから気づくのではなく、押す前にわかる。
3. **スマホは後続** — 現場は当面 PC 運用で確実に回す。スマホ専用導線は MVP 対象外（§8）。

### 0.2 Phase 2 のどこに当たるか

[Phase 2 親ドキュメント §1.2](20260616_shogi_tour_phase2_program_001.md) は Phase 2 の価値を
**「早く始められて・見て楽しく・記録が残る」** の 3 ピラーで定義している。本メモは先頭の
**「早く始められて」** に当たる **当日運営側の高速化**である。

- 「見て楽しく」＝ふりがな ruby × スマホ星取表（WS-A・live scoreboard）= 別系統。
- 「記録が残る」＝大会履歴アーカイブ（WS-C / [履歴 MVP 設計](20260615_shogi_tour_history_mvp_design_001.md)）= 別系統。
- 親ドキュメントの value-pillar 表では「早く始められて」に **WS-A（受付ふりがな）／ WS-B（事前マスタ整備）／
  受付・1 局目開始の高速化** がぶら下がる。本メモはこの最後の「**受付・1 局目開始の高速化**」を
  docs-only で初めて設計に起こすもの（親ドキュメント §3 の WS 一覧へ将来 index される候補。本メモでは
  親ドキュメントは**編集しない**）。

> 並行運用ルール（[親 §7.1](20260616_shogi_tour_phase2_program_001.md)）への適合: 本作業は **docs-only**
> （設計は並行可・コード実装はしない）。PR は **Draft 起票**にとどめ、Ready 化 / merge / branch 削除 /
> main・production・release・deploy は**ユーザー明示承認が要る**（本メモはそれらを含意しない）。

### 0.3 現状（「受付確定」も「クラス別開始導線」も UI に無い／だが開始エンジンは既にある）

現行 `shogi_v4.html` を読むと、**クラス単位開始のエンジンは既に存在する**が、それを**受付画面から
迷わず使う導線と、開始可否の可視化が無い**。これが MVP の主眼になる。

すでに在るもの（=作り直さない）:

- **クラス別開始関数** `startTournamentForClass(classId)` … 単独クラスを atomic に開始（他クラスの
  奇数 / 人数不足 / 未開始に引きずられない）。**A 級だけ先に開始し B 級を後追い開始する機能は
  関数レベルで既にある**。
- **純粋バリデータ** `validateStartableClass(classInfo, playersForClass)` … 戻り値 `kind` で
  開始可否を返す（`ok` / `skip-empty`(0名) / `skip-already-started` / `too-few`(1名) / `odd`(奇数)）。
  「開始できる」＝ **2 名以上・偶数・未開始**。
- **収集ヘルパ** `collectStartCandidateForClass`（単一）/ `collectStartCandidates`（一括）→ 候補 / エラー / skip を仕分け。
- **適用ヘルパ** `applyStartForCandidates`（pairings/results 初期化 → `setClassStarted(true)` → `generatePairing`）。
- **クラス別開始フラグ** `state.classes[i].started`（真値）と `state.started`（全クラス OR の互換フィールド・
  `syncGlobalStartedFromClasses()` で同期）。
- **クラス別リセット** `resetClassForClass(classId)`（他クラスを壊さない）。

無いもの（= 本 MVP が足す薄い層）:

- 受付画面（`renderRegList()`）に **クラスごとの開始可否（ready / 何が足りないか）を出す表示**。
  いまは人数 `(N名)` と参加費合計しか出ず、開始可否は **`#startBtn` を押してエラーを見るまで分からない**。
- 受付画面からの **クラス別「1 局目を作成」導線**。`startTournamentForClass` はあるが、受付 UI が
  主に晒すのは一括の `#startBtn`（→ `startTournament()`）。
- **「このクラスは受付確定」**という明示マーカー（任意・非ブロッキング）。

> つまり本 MVP は **新しい開始ロジックをほとんど作らない**。既存の純粋バリデータと
> クラス別開始関数の上に、**可視化（readiness）と導線（クラス別開始ボタン）**を薄く乗せるのが核である。

---

## 1. 前提・用語

- **クラス** … `state.classes[]`（`{id, name, started}`）。既定 A / B。C 以降は受付 UI が動的補完
  （`ensureClassRegDomNodes()`）。本メモは「A/B クラス別採番・進行」を前提にしつつ classId 駆動で書く
  （A/B リテラルを設計に焼き込まない）。
- **参加者（player）** … `state.players[classId][]` の 1 要素。現行フィールド（非網羅）:
  `{ id, name, cls, member, grade, member_id?, yomi, entry_no }`。
  - `entry_no` … クラス内採番。`nextEntryNoForClass(cls)` が `max(entry_no)+1` を返し **欠番を維持**する。
  - `yomi` … ふりがな（受付一覧 ruby 用、WS-A 由来）。本メモの高速化ロジックは yomi に依存しない。
- **受付（reception）** … `renderRegList()` が描くタブ。`addPlayer()` で追加・`removePlayer(id,cls)` で削除。
  同名は追加時に拒否。`removePlayer` は当該 player が **既に組合せに入っている**場合は削除をガードして
  「対戦相手変更 / 進行データリセット」へ誘導する（REMOVE-PLAYER-GUARD）。
- **開始（start）** … `#startBtn` → `startTournament()`（一括・atomic）。または `startTournamentForClass(classId)`
  （クラス単独・atomic）。開始すると当該クラスの `pairings`/`results` を初期化し `generatePairing` で
  1 回戦（=1 局目）を生成、`started=true`。
- **同一端末・同一ブラウザ前提**。localStorage はオリジン×ブラウザごとに独立（[履歴 MVP §1](20260615_shogi_tour_history_mvp_design_001.md) と同じ前提）。

---

## 2. 現場課題（整理）

幹事ヒアリング相当の課題を、現行コードのどこに当たるかと併せて整理する。

| # | 課題 | 現状の当たり方 |
|---|---|---|
| C1 | **受付が全部終わるまで組合せに進めない**と思われている | エンジン上は `startTournamentForClass` でクラス単独開始できるが、受付 UI にその導線が無いため「全員揃ってから一括 `#startBtn`」になりがち |
| C2 | **A/B で人数確定タイミングが違う** | A が先に揃い B が後から来る、は日常。クラス別開始フラグ（`classes[i].started`）はあるので**後追い開始は技術的に可能** |
| C3 | **同姓同名がありうる** | `addPlayer` は氏名完全一致を拒否するため、同姓同名は**そのままでは2人目を登録できない**（実運用は「架空 太郎」「架空 太郎(2)」等で回避）。呼び出し時の取り違えリスクも残る |
| C4 | **当日新規登録がある** | `addPlayer` で随時追加。`entry_no` は `max+1`。開始**後**の追加は今は明確なルートが無い |
| C5 | **欠番は許容される** | `entry_no` は `max(entry_no)+1` で**欠番維持**。削除で空いた番号は詰めない。readiness は番号でなく `players.length`（実人数）で見るので欠番は開始判定に影響しない |
| C6 | **参加者番号や姓だけ（「◯◯さん」だけ）では呼ばない運用** | 呼び出しは「番号＋フルネーム（＋ふりがな）」。表示は `entryNoOf｜氏名`（番号 2 桁・`getNameWithNo`）＋ ruby。設計はこの呼称運用を壊さない |
| C7 | **幹事が慣れるまで PC 操作中心** | 受付・組合せ・結果入力は PC が主。スマホは閲覧（live scoreboard）中心。高速化導線は **PC 受付画面**に置く |
| C8 | **対局表を使わない大会もある** | 開始＝必ず紙の対局表前提ではない。開始導線は「画面で 1 局目を見る」だけでも成立させ、印刷は任意に保つ |

**課題の本質（MVP の的）**: ボトルネックは「開始ロジックが無いこと」ではなく、
**(a) 開始してよいかが受付画面で見えない**（C1・押すまで分からない）と
**(b) クラス単独で先に始める導線が表に出ていない**（C2）。MVP はこの 2 点をまず潰す。

---

## 3. MVP 方針（最小実装候補）

### 3.1 結論サマリ

| # | 検討項目 | MVP の結論 | 詳細 |
|---|---|---|---|
| 1 | クラス別「受付確定」状態 | **任意・非ブロッキングのマーカー**（per-class `receptionConfirmed`）。**無くても開始できる**（既定 = 未確定 = 既存挙動）。まず無し版（readiness 表示のみ）で価値が出る | §5.2 |
| 2 | クラス別「1 局目作成」ボタン | 既存 `startTournamentForClass(classId)` を受付画面に**導線として出す**だけ（新ロジック無し） | §3.2・§4.3 |
| 3 | 未受付 / 仮受付 / 欠番 / キャンセルの扱い | **欠番・キャンセル=既存**（entry_no / removePlayer）。**仮受付（provisional）・未受付ハイライト=MVP外**（§9・participantMasterId に絡むため先送り） | §5.3 |
| 4 | 1 局目だけ先に生成する導線 | 既存の開始＝1 回戦生成。「1 局目だけ」は現行どおり（2 回戦以降は `submitRound` 後に生成）。新規生成ロジック不要 | §3.2 |
| 5 | A 級先行・B 級後追い開始 | 既存 `startTournamentForClass('A')` → 後で `startTournamentForClass('B')`。**エンジン済み**。導線だけ足す | §3.2 |
| 6 | 不足者を目立たせる | **軽量版のみ**: readiness バッジで「奇数（あと運営者 1 名）」「1 名のみ」「0 名」を色分け表示。**名簿照合での未受付検出は MVP外**（§9） | §4.2・§5.3 |
| 7 | 誤開始防止の確認ダイアログ | クラス別開始の前に **要約付き確認**（クラス名・人数・偶奇）。`receptionConfirmed` を**任意の追加チェック**に使える | §4.4・§6 |
| 8 | 開始後の修正余地 | 開始後の追加は **既存の進行データ系導線**（対戦相手変更 / `resetClassForClass`）に接続。MVP は「開始後追加は明示ガードで案内」まで（§7 START-004） | §5.4 |

### 3.2 核（最小で価値が出る組み合わせ）

**READINESS 表示（§4.2）＋ クラス別開始ボタン（§4.3）の 2 つだけで「早く始められる」の主要価値が出る。**
両方とも**既存の純粋関数の上に乗る薄い UI**であり、開始・採番・順位・保存ロジックには触れない:

- readiness は **`validateStartableClass(classInfo, state.players[classId])` を読むだけ**で導出できる（保存しない・副作用なし）。
- クラス別開始は **`startTournamentForClass(classId)` を呼ぶだけ**（atomic・他クラス非破壊・既存）。

「受付確定」マーカー（§5.2）と「開始後追加ガード」（§5.4）は**その次の薄いスライス**であり、無くても核は成立する。

---

## 4. UI 案（PC 受付画面前提・幹事が迷わない）

### 4.1 置き場所 = 受付タブ（`renderRegList()` のクラスセクション）

高速化導線は **受付画面のクラスごとのセクション**に置く（幹事の視線が受付中ずっとそこにあるため）。
現行は各クラスに「見出し＋人数 `(N名)`＋参加者リスト」、最下部に参加費バー。ここに **クラス見出し帯の
右側へ readiness と開始ボタン**を足す。運営（対局管理）タブの既存レイアウトは変えない。

### 4.2 クラス別 状態（readiness）表示

各クラス見出しの隣に、`validateStartableClass` の `kind` から導いたバッジを出す（**表示専用・派生値**）:

| 状態(kind) | バッジ例（架空文言） | 色 | 開始ボタン |
|---|---|---|---|
| `ok`（2名以上・偶数・未開始） | 「開始できます（◯名）」 | 緑 | 活性 |
| `odd`（奇数） | 「あと運営者 1 名で開始できます（◯名・奇数）」 | 黄 | 非活性（理由表示） |
| `too-few`（1名） | 「参加者が 1 名です」 | 黄 | 非活性 |
| `skip-empty`（0名） | 「未受付」 | 灰 | 非活性 |
| `skip-already-started` | 「開始済み（◯回戦中）」 | 青 | 開始ボタンを「リセット」へ差し替え or 非表示 |

- **押す前に分かる**のが要点（C1）。`#startBtn` を押してエラーを読む、をやめる。
- 文言は現行バリデータのメッセージ（例「Aクラスが奇数です。運営者を追加してください」）と**意味を揃える**。
- バッジは `renderRegList()` の再描画に相乗りして更新（受付追加・削除のたびに `renderRegList` が走る）。

### 4.3 クラス別「1 局目を作成」ボタン

- 各クラス見出し帯に **「Aクラスの 1 局目を作成」** ボタン（classId 駆動の文言）。押下で
  `startTournamentForClass(classId)`。**A だけ先に・B は後で**が画面から自然にできる（C2）。
- 一括の `#startBtn`（`startTournament()`）は**残す**（全クラス一斉に始めたい小規模大会向け）。
  クラス別と一括の両方を提供し、運用で選べるようにする。
- 開始すると `showTab('tournament')` で対局管理へ遷移（既存挙動）。**ただし他クラスの受付がまだなら
  受付タブに留まる選択肢**も検討（§13 未決）。現場では「A を開始 → B の受付を続ける」があるため。

### 4.4 警告 / 確認表示（誤開始防止）

- クラス別開始ボタン押下時、**要約付き確認ダイアログ**:
  「**Aクラス（◯名・偶数）の 1 局目を作成します。よろしいですか？**」。
  人数・偶奇・クラス名を出して、別クラスや未確定クラスの誤開始を防ぐ（§10 R1）。
- `receptionConfirmed`（§5.2）を採る場合は、**未確定クラスの開始時に一言追加**
  （「このクラスはまだ受付確定にしていません。開始しますか？」）。ただし**ブロックはしない**
  （確定を強制しない＝運用の自由を残す）。
- 既存の `collectStartCandidateForClass` のエラー（odd/too-few/already-started）は
  `showMsg`/`alert` で**既存どおり**表示（新しい握りつぶしを作らない）。

### 4.5 別ウィンドウ順位表（live scoreboard）との関係

- live scoreboard（`?view=scoreboard` / `#scoreboard`）は **read-only 全画面**で、別タブの `save()` を
  `storage` イベントで受けて自動更新する（[live メモ](20260614_shogi_live_scoreboard_mvp_001_summary.md)）。
- クラス別開始は `save()` を通るので、開始した瞬間に **別ウィンドウの星取表へ自動反映**される
  （追加実装不要）。高速化導線は閲覧ビューに**新しい操作 UI を足さない**（read-only 徹底）。
- 開始前のクラスは星取表に出ない/空、というのは既存挙動のまま。readiness バッジは**運営側受付画面のみ**で、
  閲覧ビューには出さない。

### 4.6 現場運営中に現在画面を壊さない配慮

- **対局管理タブのレイアウトは不変**。高速化 UI は受付タブのクラス見出し帯に閉じる。
- 既存の一括 `#startBtn` の挙動・文言は**変えない**（慣れた幹事の操作を壊さない）。クラス別は**追加**。
- 開始直後に勝手にタブが飛んで「受付の続きができない」と混乱しないよう、遷移挙動は §13 で要確認。

---

## 5. データ設計案

### 5.1 大原則 = 既存 state を壊さない（非破壊・後方互換）

[履歴 MVP §4・§12](20260615_shogi_tour_history_mvp_design_001.md) と同じ非破壊原則を継承する:

- **readiness は保存しない（派生値）**。`validateStartableClass` を読むだけ。state に新フィールドを
  足さずに §4.2 が成立する。これが最小フットプリント。
- `save()` / `load()` / `normalizeState()` / 順位計算（`calcFinal`/`computeDisplayRanks`/`getWins`）/
  勝敗入力（`setWinner`/`submitRound`）/ 採番（`nextEntryNoForClass`）は**変更しない**。
- 既存 `startTournament` / `startTournamentForClass` / `applyStartForCandidates` / `setClassStarted` の
  **ロジックは変えず**、受付画面から呼ぶ**導線**を足すだけ。

### 5.2 クラス別 start readiness と「受付確定」

- **readiness（開始可否）= 完全派生**。保存不要（§5.1）。
- **「受付確定」が必要なら**、唯一の新フィールド候補は **per-class `state.classes[i].receptionConfirmed`（真偽・任意）**:
  - **additive・後方互換**: 不在 = `false` = 既存挙動（開始は readiness だけで可能。確定を必須化しない）。
  - **非ブロッキング**: 確定は「幹事がこのクラスの受付を締めた」という*意思表示マーカー*であり、
    開始の*ゲート*ではない（§4.4 で確認文に使う程度）。
  - `normalizeState()` の既定補完に乗せれば旧データを読んでも壊れない（[履歴 §12](20260615_shogi_tour_history_mvp_design_001.md) と同じ後方互換の作法）。
  - **MVP では受付確定マーカー自体を「やらない」に倒してもよい**（readiness 表示＋クラス別開始だけで
    主要価値が出るため。§3.2）。入れる場合も per-class 1 真偽に限定し、player 単位には広げない。

### 5.3 provisional / confirmed / 欠番 / キャンセルの扱い

| 概念 | MVP の扱い | 根拠 |
|---|---|---|
| **欠番** | **既存のまま**（`entry_no` = `max+1`・詰めない）。readiness は実人数 `players.length` で見るので欠番は開始判定に無関係 | §1・C5 |
| **キャンセル（開始前）** | **既存 `removePlayer`**（開始前は組合せに居ないので素直に削除でき、entry_no に欠番が残るだけ） | C5 |
| **キャンセル（開始後）** | 既存 REMOVE-PLAYER-GUARD（組合せに居ると削除をガードし「対戦相手変更 / 進行リセット」へ誘導）。MVP は新規ロジックを足さず既存導線へ接続 | §5.4 |
| **仮受付（provisional）** | **MVP 外**。player 単位の `provisional` 真偽は将来の精緻化。MVP は「受付済み or 未登録」の二値で足りる（readiness は登録済み実人数で判定） | §9 |
| **未受付（来るはずだが未登録）** | **MVP 外の名簿照合版**は先送り。MVP の軽量版は readiness バッジ（0名=「未受付」・奇数=「あと 1 名」）止まり。期待人数との突合はマスタ/名簿に依存し participantMasterId に絡む | §9・§5.5 |

### 5.4 当日追加参加者の扱い

- **開始前の追加** = 既存 `addPlayer`（`entry_no = max+1`）。readiness が即更新され、偶数になれば開始可。
- **開始後の追加**（C4）= 現状は明確なルート無し。MVP の方針:
  - まずは **明示ガード**（START-004）: 当該クラスが `started===true` のとき `addPlayer` で追加しようとしたら
    「このクラスは開始済みです。次回戦からの参加 / 組合せ調整が必要です」と**案内**し、既存の
    対戦相手変更・`resetClassForClass` 導線へ繋ぐ。**自動で次回戦に差し込む高度化は MVP 外**。
  - 「開始後の修正余地」は **既存の進行データ系**（pairings 編集 / クラス別リセット）に委ね、
    高速化スライスでは**新しい破壊的操作を作らない**。

### 5.5 履歴保存（#214）との関係

- 大会履歴（[履歴 MVP](20260615_shogi_tour_history_mvp_design_001.md) / PR #214）は確定 state を
  `shogi_archive` に **deep-clone snapshot** で凍結する。`receptionConfirmed` を足した場合は
  `classes[]` の一部として snapshot に**自然に同梱される**が、**閲覧（read-only 星取表）には影響しない**
  （履歴は順位・星取の表示のみ）。
- 高速化は **当日 state（`shogi_v4`）側の導線**であり、`shogi_archive` には書かない（書込経路を増やさない）。
- 開始は `save()` 経由なので quota は既存 `isQuotaExceededError` + `notifySaveWarning` の傘内
  （新フィールドが極小のため quota への実害は無視できる）。

### 5.6 将来 participantMasterId 化との接続（橋だけ・実装しない）

- [親 §1.3 / 収束点 M5](20260616_shogi_tour_phase2_program_001.md) の `participantMasterId` 化・
  `kanaSnapshot` 正本化は **本メモでは実装しない**（§9）。
- 接続の橋: **未受付の名簿照合**（「来るはずの人が未登録」を検出してハイライト）は、期待参加者の名簿が
  要る。これはマスタ（`shogi_branch_master.members[]`）or 事前登録リストに依存し、**安定 ID で突合**できると
  同姓同名（C3）も取り違えずに照合できる。よって**「未受付ハイライト」は participantMasterId 化が入った後の
  スライス**として置く。MVP の readiness は ID 非依存（実人数・偶奇）なので、M5 を待たずに出せる。
- MVP が `member_id`（既存・マスタ由来の任意フィールド）を**増やさない**ことで、M5 で `participantMasterId`
  へ寄せる際の改修面を広げない。

---

## 6. 開始可否ロジックの再利用（新規ロジックを作らない）

| やりたいこと | 既存関数（再利用） | 追加で作るもの |
|---|---|---|
| クラスが開始できるか判定 | `validateStartableClass(classInfo, players[classId])` | なし（読むだけ） |
| readiness バッジ文言 | 上記 `kind` → 表示マッピング | 表示専用ヘルパ（純関数・state 不変） |
| クラス単独開始 | `startTournamentForClass(classId)`（内部で collect→apply→verify） | なし（受付画面から呼ぶ導線のみ） |
| 一括開始 | `startTournament()` / `collectStartCandidates` | なし（現状維持） |
| クラス別リセット | `resetClassForClass(classId)` | なし |
| 開始保存の検証 | `verifyStartSavedForCandidates`（SAVE-003） | なし |

> 設計上の自己制約: **開始可否の判定式（2名以上・偶数・未開始）は `validateStartableClass` に一元化されたまま**にする。
> readiness 表示が**独自の判定を再実装しない**こと（二重定義は将来の不整合源）。表示は必ず同関数の `kind` を入力にする。

---

## 7. 後続実装スライス案（小さく分ける）

実装は独立した薄いスライスに分ける。**START-001 と START-003 だけで主要価値が出る**（§3.2）。

| スライス | 内容 | 触る範囲（想定） | 依存 |
|---|---|---|---|
| **START-001** クラス別 readiness 表示 | 受付クラス見出しに開始可否バッジ（§4.2）。`validateStartableClass` の `kind` を表示にマップする純関数＋`renderRegList` への表示追加 | 受付描画のみ。state 不変・派生値 | なし（最初に着手） |
| **START-002** 1 局目作成前チェック | クラス別開始前の要約付き確認ダイアログ（§4.4）。`collectStartCandidateForClass` の結果整形 | 確認 UI のみ | START-001 |
| **START-003** A/B 別 1 局目開始 | 受付見出しに「◯クラスの 1 局目を作成」ボタン → `startTournamentForClass(classId)`（§4.3）。一括 `#startBtn` は維持 | 受付に導線追加。開始ロジックは既存 | START-001 |
| **START-004** 開始後の追加参加者ガード | `started===true` のクラスへ `addPlayer` した時の明示案内＋既存進行データ導線への接続（§5.4） | 受付追加の分岐＋文言 | START-003 |
| **START-005** 現場向け UI 文言調整 | バッジ・確認・ガードの文言を現場運用（番号＋フルネーム呼称・C6）に合わせて磨く | 文言のみ | 上記 |
| （任意）START-006 受付確定マーカー | per-class `receptionConfirmed`（§5.2）。non-blocking・後方互換。**入れる価値が確認できてから** | `classes[]` に任意 1 真偽＋`normalizeState` 既定補完＋確認文言 | START-002 |

**推奨着手順**: START-001（読むだけ・最小・最大の明瞭化）→ START-003（既存エンジン露出）→ START-002（確認）
→ START-004（開始後追加）→ START-005（文言）。START-006 は任意・後置。

---

## 8. スマホ運用は後続（MVP 外）

- 現場は当面 **PC 受付運用で確実に回す**（C7）。高速化導線は **PC 受付画面**に置く。
- スマホは **閲覧（live scoreboard, read-only）** が既に出荷済み。**スマホからの開始操作・受付操作は MVP 外**。
- 将来スマホ運用を足す場合も、readiness/開始導線は同じ純関数（`validateStartableClass` /
  `startTournamentForClass`）の上に別 UI を乗せる形にし、ロジックを二重化しない。

---

## 9. やらないこと（先走り禁止）

[親 §1.3・§4](20260616_shogi_tour_phase2_program_001.md) の「橋だけ残す」方針に従い、本設計では
以下を**実装前提にしない**:

| やらない | 理由 |
|---|---|
| `participantMasterId` 化の実装 | 収束点 M5（[親](20260616_shogi_tour_phase2_program_001.md)）で WS 横断にまとめる。MVP の readiness は ID 非依存で成立（§5.6） |
| `kanaSnapshot` 正本化の実装 | 同上（M5）。高速化は yomi に依存しない |
| 大規模な受付 DB 化 | 受付は当日 `state.players` のまま。別ストア・正規化は §C / Phase 3 の話 |
| 仮受付（player 単位 provisional）/ 名簿照合の未受付ハイライト | participantMasterId・期待名簿に依存（§5.3・§5.6）。MVP は readiness 軽量版まで |
| スマホ専用運用 | §8。当面 PC 運用 |
| 複雑な自動組合せ最適化 | 1 局目生成は既存 `generatePairing`。Blossom 等の高度マッチングは別軸（A-5 系）。高速化スライスでは触れない |
| 既存 `save`/`load`/`normalizeState`/順位計算/勝敗入力/採番の変更 | 非破壊原則（§5.1） |
| 一括 `#startBtn` の挙動変更 | 慣れた操作を壊さない（§4.6） |
| production / release / deploy / publish | docs-only。反映は別 release PR・ユーザー明示承認（[親 §7.1](20260616_shogi_tour_phase2_program_001.md)） |

---

## 10. リスク

| # | リスク | 緩和（MVP の設計で対処） |
|---|---|---|
| R1 | **未確定クラスを誤って開始** | クラス別開始は**要約付き確認**（クラス名・人数・偶奇, §4.4）。`receptionConfirmed` 採用時は未確定で一言追加（ただし非ブロック） |
| R2 | **受付漏れ**（来たのに未登録のまま開始） | readiness の人数・偶奇を見える化（§4.2）。**名簿照合での自動検出は MVP 外**（§9）。運用で「人数が想定どおりか」を幹事が目視 |
| R3 | **同姓同名の取り違え** | 表示・呼称は番号＋フルネーム（＋ruby, C6）。`addPlayer` は同名拒否で 2 人目に気づける。**安定 ID 照合は participantMasterId 後**（§5.6） |
| R4 | **開始後の人数変更** | 開始後追加は明示ガード（START-004）で既存進行データ導線へ。**自動差し込みはしない**（破壊的操作を増やさない） |
| R5 | **対局表あり/なし運用差**（C8） | 開始＝画面で 1 局目が見える、で成立。印刷（対局表 PDF）は任意のまま。開始は印刷に依存しない |
| R6 | **画面が切り替わって混乱**（開始直後にタブ遷移して受付の続きができない） | 遷移挙動を §13 で要確認（A 開始後も受付タブに留まる選択肢）。対局管理レイアウトは不変（§4.6） |
| R7 | **readiness とエンジンの判定が食い違う** | 表示は必ず `validateStartableClass` の `kind` を入力にし、判定式を再実装しない（§6 自己制約） |
| R8 | **クラス別開始の保存未確認** | 既存 `verifyStartSavedForCandidates`（SAVE-003）に乗る。新しい握りつぶしを作らない（§6） |

---

## 11. テスト方針（実装時の指針）

- **純関数中心**に検証（DOM を SoT にしない。[親 §4](20260616_shogi_tour_phase2_program_001.md) の原則）:
  - readiness 表示マッピング … `validateStartableClass` の各 `kind`（ok/odd/too-few/skip-empty/skip-already-started）→
    バッジ文言/色/ボタン活性の純関数。架空 state で全分岐。
  - クラス別開始導線 … `startTournamentForClass('A')` 後に **A だけ started・B 未開始**を確認（既存 atomic を回帰）。
  - 開始後追加ガード（START-004）… `started===true` クラスへの `addPlayer` が案内に分岐すること。
  - （START-006 を入れる場合）`receptionConfirmed` 不在で既存挙動・既定補完・開始は非ブロックであること。
- 観点: readiness が**押す前に**正しく出る／A 先行・B 後追いが壊れない／開始判定が `validateStartableClass`
  に一元化されたまま／既存の一括開始・順位・保存が不変。
- **既存テストを壊さない**。`bash test/run_tests.sh shogi_v4.html` を維持（件数は未追跡 fixture/test の有無で
  **環境依存**するため固定せず、実装時に**無改変 baseline を `git worktree add --detach <tip>` で出して比較**する。
  high-water 例: 本線 tip での baseline 58/1/35 系 ＝[履歴 Step1 メモ](20260615_shogi_tour_history_mvp_design_001.md) の比較作法に倣う）。
- データは**完全架空のみ**（`架空 …` / `Dummy …` / `example.invalid` / `synthetic`）。

---

## 12. read-only / 非破壊・互換性メモ（実装条件）

- 既存の `startTournament` / `startTournamentForClass` / `collectStartCandidate*` / `applyStartForCandidates` /
  `setClassStarted` / `validateStartableClass` / `save` / `load` / `normalizeState` / 順位計算 / 勝敗入力 /
  `nextEntryNoForClass` を**変更しない**。高速化は **受付描画への表示追加 ＋ 既存関数への導線 ＋（任意）
  per-class 1 真偽**で成立させる。
- readiness は**派生値・保存しない**。開始判定の単一ソースは `validateStartableClass`（§6）。
- `receptionConfirmed` を入れる場合も **不在 = 既存挙動**（後方互換）、**非ブロッキング**（開始のゲートにしない）。
- 閲覧ビュー（live scoreboard / `?view=scoreboard`）には**操作 UI を足さない**（read-only 徹底, §4.5）。
- 一括 `#startBtn` の挙動・文言は不変（§4.6）。対局管理タブのレイアウトは不変。

---

## 13. 未決事項（実装着手前に確認）

| # | 項目 | 暫定 |
|---|---|---|
| 1 | クラス別開始後のタブ遷移 | 現状は `showTab('tournament')`。A 開始後も**受付タブに留まる**選択肢を検討（B 受付継続のため, §4.3・R6） |
| 2 | 受付確定マーカー（`receptionConfirmed`）を MVP に入れるか | **任意・後置**（START-006）。readiness ＋ クラス別開始だけで主要価値が出る（§3.2・§5.2） |
| 3 | readiness バッジの文言・色 | 現行バリデータのメッセージと意味を揃える（§4.2）。最終文言は START-005 で現場調整 |
| 4 | 「不足者を目立たせる」の範囲 | MVP は軽量版（0名/奇数/1名の色分け）。**名簿照合の未受付検出は participantMasterId 後**（§5.3・§5.6・R2） |
| 5 | 開始後追加（START-004）の案内文と接続先 | 既存「対戦相手変更 / `resetClassForClass`」へ誘導（§5.4）。自動差し込みはしない |
| 6 | クラス別開始ボタンと一括 `#startBtn` の併存表現 | 両方提供（§4.3）。小規模は一括・段階運用はクラス別。UI の優先度は現場で確認 |

---

## 14. 段階ロードマップ（再掲）

- **Step 1（核）**: START-001 readiness 表示 ＋ START-003 A/B 別開始（既存 `validateStartableClass` /
  `startTournamentForClass` への薄い表示・導線）。
- **Step 2**: START-002 開始前確認 ＋ START-004 開始後追加ガード ＋ START-005 文言調整。
- **Step 3（任意）**: START-006 受付確定マーカー（non-blocking）。
- **将来（M5 後）**: 名簿照合の未受付ハイライト（participantMasterId 化に接続。本メモ範囲外, §5.6）。

---

## 15. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-06-16 | v0 作成。受付→1 局目開始の高速化 MVP 設計（docs-only）。核＝readiness 表示（`validateStartableClass` 派生・保存しない）＋クラス別開始導線（既存 `startTournamentForClass` の露出）。受付確定マーカーは任意・非ブロッキング・後置。欠番/キャンセルは既存（entry_no/removePlayer）、仮受付・名簿照合の未受付ハイライトは MVP 外（participantMasterId 化＝M5 後）。スマホ専用運用・自動組合せ最適化・受付 DB 化・production 反映は対象外。コードは未変更。 |
