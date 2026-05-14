# PAIRING-UX-INVENTORY — 手動組み合わせUX 課題棚卸し

**Task ID**: `PAIRING-UX-INVENTORY`
**作業種別**: docs-only / UX inventory / tournament operation analysis
**前提**: SAVE-UX state restore 系は §26（PR #98）で運用観察フェーズに入ったため、次テーマとして大会当日の運営ストレスに直結する PAIRING-UX に移行
**HEAD**: `6fb85e1`（PR #98 squash merge 後の main）

---

## 1. 目的と非目的

### 1.1 目的

- 手動組み合わせ UX の課題を **棚卸し** する（現場ヒアリングで挙がった 6 課題 + 現状コード断面）
- 実装前に、**UI 改善** / **ロジック改善** / **運用ルールで吸収する部分** を分ける
- 大会当日の運営者の **迷い・選択ミス・手戻り** を減らすための論点を整理する
- SAVE-UX 系で踏襲してきた docs-only inventory → design check → IMPL-LIGHT という段階パターンに乗せる

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only）
- 組み合わせロジック（`generatePairing()` 等）を変更しない
- UI を変更しない（`buildCurrentPairingsHtml()` / `buildChangePairingModalHtml()` 等）
- テスト・CI 設定を変更しない
- pairing algorithm を実装しない
- 自動組み合わせの仕様を確定しない
- スイス式の完全仕様を決めない
- 「全勝者同士は常に避ける」など、運用判断を仕様化しない

---

## 2. 現状コードの棚卸し

`shogi_v4.html`（HEAD `6fb85e1`）の手動組み合わせ系を function 単位で整理する。

### 2.1 参加者識別 / 表示 helper

| 関数 | 行 | 役割 |
|---|---|---|
| `getName(id, cls)` | [231](shogi_v4.html:231) | 氏名のみ返す |
| `entryNoOf(cls, id)` | [243](shogi_v4.html:243) | クラス内エントリー番号（`player.entry_no` を優先、なければ array index+1） |
| `getNameWithNo(id, cls)` | [277](shogi_v4.html:277) | `entryNo｜name` 形式（2 桁 0 埋め + ｜ + 氏名）|
| `getWins(cls)` | [293](shogi_v4.html:293) | `state.results[cls]` を走査し `{playerId → wins}` を返す |

**観察**: 画面表示は `getNameWithNo()`（エントリー番号 + ｜ + 氏名）、印刷出力は `getName()`（氏名のみ）と **役割分担済み**（[printResults() 5464](shogi_v4.html:5464) / RANK-PRINT-001 既知）。**クラス（A/B）・支部・一般/支部員区分は現状の表示文字列に含まれていない**。

### 2.2 組み合わせ整合性 helper

| 関数 | 行 | 役割 |
|---|---|---|
| `pairHasRematch(cls, p1, p2)` | [307](shogi_v4.html:307) | `state.results[cls]`（確定済み過去ラウンド）を走査して再対戦判定 |
| `findPairContainingPlayer(cls, playerId, excludeIdx)` | [317](shogi_v4.html:317) | 現ラウンド内で当該プレイヤーを含むペア index を返す（無ければ -1）|
| `getDuplicatePlayersInPairings(cls)` | [327](shogi_v4.html:327) | 現ラウンドで複数ペアに重複して現れる player ID を返す |
| `evaluatePairingQuality(pairings, results, players)` | [4384](shogi_v4.html:4384) | 再対戦・勝差 max・回避可能な同勝同士不一致を評価し、ラベル化に使う |

**観察**: 整合性チェックは「再対戦」「重複」「勝差」「avoidable 同勝同士」をカバー。**「最後で組めない」（deadlock）チェックは無い** / **全勝者同士の特別扱いも無い**（勝差最小化のスイス様ロジックが自然に発生させる）。

### 2.3 ラウンド生成 / 確定 / 編集

| 関数 | 行 | 役割 |
|---|---|---|
| `generatePairing(cls)` | [4513](shogi_v4.html:4513) | 自動組み合わせ。勝数降順ソート → 同勝群シャッフル → 勝差最小化のバックトラッキング。`lastModifiedBy:'auto'` |
| `buildCurrentPairingsHtml(cls, roundNum, done)` | [4868](shogi_v4.html:4868) | 現ラウンドのペアカードを HTML 化。重複警告 / 質警告（`[要確認]` / `[手動変更]`）/ 「変更」ボタンを描画 |
| `changePairing(cls, idx)` | [4743](shogi_v4.html:4743) | 「変更」ボタンの entry。`match.winner` が set 済ならブロック |
| `buildChangePairingModalHtml(cls, idx, candidates, match)` | [4639](shogi_v4.html:4639) | 「対戦相手の変更」モーダル。先手 / 後手 2 つの `<select>`（option label = `entryNo｜name`）|
| `bindChangePairingModalEvents(cls, idx)` | [4665](shogi_v4.html:4665) | save handler。replace（片方差替）/ swap（2 ペア間入替）を自動判別 |
| `submitRound(cls)` | [4757](shogi_v4.html:4757) | `state.pairings[cls]` → `state.results[cls][roundIdx]` へ移送 + 次ラウンド自動生成 |
| `editPastResult(cls, roundIdx, matchIdx)` | [5059](shogi_v4.html:5059) | 確定後の編集（**勝者変更のみ**、ペア構成変更は不可）|
| `renderTournament(cls)` | [4961](shogi_v4.html:4961) | tournament view 全体の render entry |
| `printResults()` | [5464](shogi_v4.html:5464) | 結果表の印刷 window 生成（氏名のみ、エントリー番号なし）|

**観察**:
- **手動組み合わせの主要 UI は「変更」モーダル 1 種類のみ** — 候補者一覧から自由選択ではなく、特定ペアの片方 or 両方を `<select>` で差し替えるフロー
- ペアの **新規追加 / 削除** UI は無い（`generatePairing()` が全ペアを一括生成する前提）
- 候補者の **検索 / 絞り込み / フィルタ** は無い（`<select>` option 一覧のみ）
- 「未割当者リスト」UI は **無い**（`submitRound()` 時の validation alert で初めて気づく構造）

### 2.4 State shape

| State 場所 | 役割 |
|---|---|
| `state.players[cls]` | 参加者配列。`id` / `name` / `cls` / `member` / `grade` / `member_id` / `entry_no` 等（`normalizeState()` [349-366](shogi_v4.html:349) で正規化）|
| `state.pairings[cls]` | 現ラウンドのペア配列。各要素 `{p1, p2, winner: id|null, lastModifiedBy: 'auto'|'manual'}` |
| `state.results[cls]` | 2 次元配列。`state.results[cls][roundIdx][matchIdx]` に確定済みペア + winner |
| 未割当 (`未割当`) | **state フィールドなし**。`submitRound()` の validation でのみ検知 |
| 対戦済み | `pairHasRematch()` が `state.results[cls]` を走査して都度判定 |
| 全勝者 | **state フィールドなし**。`getWins(cls)` の結果から呼出側が判断 |
| Published / lock | **明示フラグなし**。`state.pairings[cls]` から `state.results[cls]` への移送 = 暗黙ロック |

### 2.5 参加者フィールド（`normalizeState()` 経由）

| field | 用途 / pairing UI での扱い |
|---|---|
| `id` | 内部識別。表示しない |
| `name` | 氏名。表示する |
| `cls` | クラス（'A' / 'B'）。pairing UI ではクラス別タブ前提で **明示表示なし** |
| `entry_no` | クラス内番号。`getNameWithNo()` で `01｜氏名` 形式に組込み |
| `member` | `'member' | 'other'`（会員/非会員）。表示なし（会費計算のみ）|
| `grade` | `'ippan' | 'chu'`（一般 / 中学生以下）。表示なし（会費計算のみ）|
| `member_id` | 支部マスタ linkage 用。表示なし |
| 支部 / 一般・支部員区分 | **pairing UI に表示する経路なし**（参加者一覧 / master 経由でしか見えない）|
| 住所 | 表示しない（mater 側のみ）|

### 2.6 既存 docs クロスリファレンス

- **`docs/specs/20260508_1907_phase4_pairing_swap_spec.md`** — Phase 4 (2026-05-08) で「対戦相手の変更」モーダルの replace / swap 自動判別を整備した hotfix 仕様。前提 5 チェック（target に winner 無し / swap 先に winner 無し / 同一ペア block / 重複しないこと / 過去ラウンドのみで再対戦チェック）を規定。現状の `bindChangePairingModalEvents()` ([4665](shogi_v4.html:4665)) はこの仕様の実装結果
- **`docs/operations/20260510_tournament_setup.md`** — マスタ import / reset / 過去参加者パネル中心。手動組み合わせ操作の詳細は薄い
- **`docs/specs/20260508_1907_phase4_pairing_swap_spec.md` の Phase 4 で `pairHasRematch()` / `findPairContainingPlayer()` を導入** — 本 inventory はその次の段階（**UX 表示・選択ストレス・運用判断境界**）を対象とする

---

## 3. 現場課題の整理

現場ヒアリング由来 6 課題を、§2 棚卸し結果と照合して整理する。

### 3.1 苗字重複・同姓同名

| 観点 | 現状 | 論点 |
|---|---|---|
| 同姓を区別できるか | `entryNoOf()` でクラス内番号 + ｜ + 氏名で識別可。例: `03｜佐藤` `12｜佐藤` | 番号と氏名はあるが、**呼称ルール「番号だけ言わない」と整合する表示**が必要 |
| 同姓同名 | 同一文字列氏名 + 異なる `id` + 異なる `entry_no` の組合せはあり得る | クラス内番号で個体識別は付くが、**口頭呼称が破綻**する |
| クラス情報 | `state.players[cls]` に含まれるが UI 表示文字列にはクラスが入っていない | クラス横断の混同はクラス別タブ前提で発生しにくいが、**印刷物・呼称ガイドでクラスを明記する慣行**は要検討 |
| 支部・区分 | 個人データに `member` / `member_id` あり、UI 表示には未連結 | 表示の有無を整理（個人情報配慮と併せて、§3.5 参照）|

**呼称ルール再掲（現場前提）**:
- 「佐藤さん」と呼ばない
- 番号だけでも言わない
- → **クラス + 番号 + 苗字** または **クラス + 苗字 + 支部** の組合せが運用上の最低単位になり得る

### 3.2 大人数クラスでの手動選択負荷

| 観点 | 現状 | 論点 |
|---|---|---|
| 「変更」モーダルの候補リスト | `<select>` 単体（`entryNo｜name` 形式の option 列） | 22 名で `<select>` 22 option はスマホで操作しづらい |
| 検索・絞り込み | **無い** | 苗字 / 番号 / 支部 / 勝敗での絞り込みが欲しい |
| 並び替え | 配列順（≒ エントリー番号順） | 「未割当者を上に」「同勝同士を上に」等の **コンテキスト依存ソート** が無い |
| 未割当 / 対局済み視認 | **UI 上は無い**。重複ハイライト ([4882-4889 周辺](shogi_v4.html:4880)) と質ラベル `[要確認]` `[手動変更]` のみ | 「未割当者がいる」「このペアは対戦済み」を **モーダルを開く前に** 知りたい |
| 誤選択戻し | save 押下後の rollback はモーダル再オープン必須 | undo / preview があると安全 |
| スマホ操作性 | `<select>` のネイティブピッカー前提 | 22 option ピッカーは指タップ難。**仮想キーボード起動を避ける構造**（list + search）が候補 |

### 3.3 全勝者×全勝者を避けたいケース

| 観点 | 現状 | 論点 |
|---|---|---|
| 勝敗数判定 | `getWins(cls)` で `{id → wins}` 算出可 | 全勝 = `wins === currentRound - 1` で判定可能 |
| 全勝者同士の現状扱い | `generatePairing()` の勝数降順ソート + 勝差最小化により、自然に全勝者同士が組まれることが多い | これがスイス式の通常挙動。**運営判断で「避けたい」局面が存在する**（最終戦前など）|
| 警告 / 禁止 | `evaluatePairingQuality()` ([4384](shogi_v4.html:4384)) は再対戦・avoidable 同勝差を見るが、**「全勝者同士」固有の判定ロジックは無い** | 「警告だけ出す」「色だけ変える」「ペアごとに `[全勝対戦]` ラベル」等の **粒度** を整理 |
| 完全禁止か警告か | **未確定** | スイス式の通常進行を阻害しないため、**禁止ではなく警告**に倒すのが穏当 |
| 他条件との優先順位 | 既に対戦済み回避 > 勝差最小化（実装上） | 全勝者同士を入れる位置は仮置きで「警告レイヤー」（実行は妨げない）|

**重要**: 本 inventory では **「全勝者同士を常に避ける」と決めない**。現場判断で避けたいケースがある、という位置づけで整理する（§4 課題分類 B / §5 候補 PAIRING-UX-WINNER-CONFLICT-WARNING）。

### 3.4 未割当なし前提のデッドロック

| 観点 | 現状 | 論点 |
|---|---|---|
| 自動組み合わせのデッドロック | `generatePairing()` はバックトラッキングで全探索 → 解が無ければ「組み合わせ失敗」になり得る | **発生頻度は低い**（再対戦回避制約が厳しい場合のみ）|
| 手動編集中のデッドロック | 「変更」モーダルで片方を差替 → swap が連鎖 → 最後に残ったペアが再対戦になる | 現 UI は **save 時のチェックで弾く**（[bindChangePairingModalEvents 4665](shogi_v4.html:4665)）が、**事前予兆は出さない** |
| 完全検知の難しさ | 厳密には NP 寄り。簡易な必要条件チェック（残候補数 / 再対戦グラフの彩色可能性）程度なら可 | **完全検知は重い** → 簡易検知 + 運用ルールの併用が現実的 |
| 警告タイミング | save 押下時 / 「次ラウンドへ」押下時 / モーダル開く時 | **モーダル開く時に「このペア変更は詰む可能性あり」程度の軽い予兆** が落とし所 |
| 運用ルール吸収 | 「最終戦に近いラウンドは手動変更を控える」「対戦済みグラフを印刷物で見ながら手動」等 | 運用ガイドへの落とし込みが必要 |

### 3.5 表示情報と個人情報

| 情報 | 表示推奨度 | 根拠 |
|---|---|---|
| クラス（A/B）| **必須** | クラス横断混同・印刷物識別 |
| クラス内番号（`entry_no`）| **必須** | 同姓識別 |
| 氏名 | **必須** | 識別の基本単位 |
| 支部 | **推奨**（運営者向け表示）| 同姓同名問題の最終回避、抽選順の根拠 |
| 一般/支部員区分 | **任意** | 大会運営上の意味は薄い、ただし会費照合に使う場面あり |
| 勝敗 | **推奨** | スイス式判断 / 全勝者識別 |
| 対戦済み相手 | **推奨**（モーダル内 hover / 横断表示）| 再対戦回避の判断材料 |
| 住所 | **非表示** | 個人情報、運営に不要 |
| 会費情報 | **非表示** | 受付フェーズで完結、運営者画面に出さない |
| 連絡先 / 電話 | **非表示** | 個人情報 |

**個人情報前提**:
- 氏名だけでも個人情報扱い
- 大会中の **共有画面 / 印刷物 / SNS 写真撮影への写り込み** に注意
- 「運営者向け詳細表示」と「参加者向け／公開表示」を **分ける** 余地あり（運営者画面: クラス + 番号 + 苗字 + 支部、公開表示: クラス + 番号 + 苗字）

### 3.6 紙運営との接続

| 観点 | 現状 | 論点 |
|---|---|---|
| 対局カード生成 | 現状は `printResults()` ([5464](shogi_v4.html:5464)) 等の印刷経路で「結果表」を出す。**ペアカード単体の印刷 UI は明示的には無い** | カード配布前の最終確認 step が UI 上にない |
| 紙カード配布後の変更 | `submitRound()` 後は `state.results` 側に移り、`editPastResult()` でも **勝者変更のみ可能**（ペア構成変更不可）| 紙カード配布タイミングと `submitRound()` の前後関係を運用ガイドで明文化 |
| Published フラグ | **明示フラグなし**。`state.pairings` → `state.results` の移送で暗黙ロック | 「published 後は rollback ではなく correction」思想（過去 SAVE-UX 系設計と整合）|
| 紙カード生成後の変更混乱 | 現場で「番号間違えた」「途中棄権が出た」等 → ペア再構成が必要 | 「カード配布前は自由 / カード配布後は最小修正」のような **運用ルール明示** が必要 |

---

## 4. 課題分類

§3 で挙げた論点を、対応手段で 4 分類する。

### 4.1 A. UI 改善で対応できるもの

| 項目 | 対応案 |
|---|---|
| 同姓識別表示 | 「変更」モーダル option label に **クラス + 番号 + 苗字 + 支部** を含める / 行内表示も同様 |
| 候補者検索 / 絞り込み | `<select>` を search input + filter list に置換（スマホでもキーボードに頼らず指タップ）|
| 並び替え（コンテキスト依存）| 「未割当者を上」「同勝同士をグループ化」「対戦済みを下に」のソートトグル |
| 未割当者一覧 | 現ラウンドのペア外プレイヤーを **明示リスト** で常時表示 |
| 選択済み視認性 | 既にペアに入っている候補を **disabled / 別配色** で表示 |
| 「対戦済み」マーカー | モーダル候補 option に `(済)` アノテート / 行内表示で hover tooltip |
| 「全勝」マーカー | option label / 行内表示で `★全勝` 等のラベル |
| 印刷前最終確認 view | `submitRound()` の前段に「これで確定しますか?（未割当者 0 名 / 再対戦 0 / 重複 0 を表示）」step |

### 4.2 B. ロジック改善が必要なもの

| 項目 | 対応案 |
|---|---|
| 全勝者同士の警告 | `evaluatePairingQuality()` に「全勝者同士」判定を追加し `[全勝対戦]` ラベルを返す（**禁止ではなく警告**）|
| デッドロック予兆（軽量）| 「変更」モーダル open 時に「このペア変更は残り組合せを詰ませる可能性あり」の簡易チェック（候補数 / 残ペアの再対戦グラフ）|
| 残人数・候補ペア妥当性 | `submitRound()` の事前 validation を強化（現状の alert より前に画面で表示）|
| 対戦済みグラフ視覚化 | 横断 view（既存 `buildPlayedHistoryHtml()` [4833](shogi_v4.html:4833) を発展）|

### 4.3 C. 運用ルールで吸収すべきもの

| 項目 | 運用ガイド明文化候補 |
|---|---|
| 全勝者同士を避けるか | 「最終戦前は避ける / それ以外は許容」など、**ラウンド位置に応じた指針** |
| 紙カード配布後の訂正方法 | 「カード配布前は自由 / 配布後は途中棄権・誤記のみ訂正、ペア再構成はしない」 |
| 同姓同名時の呼び方 | 「クラス + 番号 + 苗字 + 支部」を口頭呼称の単位とする |
| 欠番許容 | `entry_no` の欠番は許容（途中棄権で詰めない）|
| 個人情報の取扱い | 運営者画面と公開画面を分ける運用 / 印刷物の取扱い手順 |

### 4.4 D. 後回しでよいもの

| 項目 | 後回し理由 |
|---|---|
| 完全自動組み合わせ最適化 | スイス式の高度な変種（accelerated pairing, Berger 表など）は現場ニーズが薄い |
| 高度なスイス式最適化 | 既存 `generatePairing()` のバックトラッキングで実用十分 |
| 複雑なレーティング対応 | レーティング体系自体が未整備 |
| 過去大会履歴を使った組み合わせ最適化 | データ蓄積待ち |
| 完全 deadlock 検知 | NP 寄り、簡易検知 + 運用で吸収可 |
| 自動再ペアリング（手戻り時）| 「変更」モーダルの逐次手動操作で十分（自動化はリスク）|

---

## 5. 次タスク候補

§3 / §4 から導出した後続タスク候補を列挙する。**いずれも本 inventory 後すぐ着手しない**（観察 / 設計 / 段階実装の順）。

### 5.1 `PAIRING-UX-DISPLAY-LABELS`

- **目的**: 手動組み合わせ画面（行内 + モーダル）で参加者を識別しやすくする表示ラベル設計
- **想定変更**: `getNameWithNo()` を発展させた `getDisplayLabelForPairing()` 系 helper、`buildChangePairingModalHtml()` の option label、`buildCurrentPairingsHtml()` の行内表示
- **ラベル候補**: `A-12｜佐藤｜○○支部` / `A-12｜佐藤 (済 vs A-03)` / `A-12｜佐藤 ★全勝` 等
- **性格**: **docs-only design check → small UI implementation**
- **検証観点**: 個人情報表示範囲（運営者向け / 公開向け）の整理を含む

### 5.2 `PAIRING-UX-UNASSIGNED-VISIBILITY`

- **目的**: 未割当者 / 選択済み / 対局済みの視認性改善
- **想定変更**: 未割当者リスト UI 追加、選択済み候補の disabled 表示、対局済み annotate
- **性格**: **UI small fix**（state shape 変更なし、表示層のみ）

### 5.3 `PAIRING-UX-WINNER-CONFLICT-WARNING`

- **目的**: 全勝者同士など、運営上避けたい組み合わせに警告を出すかどうかの設計
- **想定変更**: `evaluatePairingQuality()` 拡張、`[全勝対戦]` ラベル追加、運用ルール docs 整備
- **性格**: **design check first**（禁止 / 警告 / 色だけ / 何もしない を比較）
- **重要**: 「常に避ける」と決めない。ラウンド位置・運営判断レイヤーを残す

### 5.4 `PAIRING-UX-DEADLOCK-INVENTORY`

- **目的**: 手動組み合わせ中に最後で詰むパターンの棚卸し
- **想定変更**: docs-only。再対戦グラフ・候補数・残ラウンド数の組合せでパターン列挙
- **性格**: **docs-only / algorithm inventory**（実装より重い、後段）
- **理由**: 完全検知は NP 寄り → 簡易検知の落とし所を決めるための前段

### 5.5 `PAIRING-UX-CARD-PUBLISH-CHECK`

- **目的**: 対局カード出力前の最終確認 UI を整理
- **想定変更**: `submitRound()` 前段の確認 step、紙カード生成 UI（あれば）の確認 UX
- **性格**: **docs-only design → UI small fix**
- **接続**: SAVE-UX の「published 後は rollback ではなく correction」思想と整合

### 5.6 候補比較表

| 候補 | 性格 | 想定変更量 | 個人情報配慮 | 運用ルール影響 |
|---|---|---|---|---|
| `DISPLAY-LABELS` | design → small UI | 小〜中 | あり（表示範囲整理）| 小 |
| `UNASSIGNED-VISIBILITY` | UI small fix | 小 | なし | 小 |
| `WINNER-CONFLICT-WARNING` | design check | 中（ロジック含む）| なし | **大**（ラウンド指針）|
| `DEADLOCK-INVENTORY` | docs-only | 0（docs のみ）| なし | 中 |
| `CARD-PUBLISH-CHECK` | design → small UI | 小〜中 | あり | 中 |

---

## 6. 推奨 Next Action

### 6.1 第一候補: `PAIRING-UX-DISPLAY-LABELS`

**理由**:
- 苗字重複・同姓同名・大人数クラスの **選択ストレス** に直結
- ロジック変更なしで改善しやすい（`getNameWithNo()` 拡張 + 表示層のみ）
- **個人情報表示の範囲を整理** しやすい（運営者向け / 公開向けの境界を docs に書ける）
- 後続の未割当視認性（§5.2）・警告設計（§5.3）にも効く（共通の表示 helper を作っておけば再利用可）
- SAVE-UX 系で踏襲した **inventory → design check → IMPL-LIGHT** パターンに乗せやすい

### 6.2 第二候補: `PAIRING-UX-UNASSIGNED-VISIBILITY`

**理由**:
- 手動組み合わせ中の **迷い** を減らせる
- UI 小修正で効果が出やすい（state shape 変更なし）
- 第一候補（DISPLAY-LABELS）の表示 helper を活用できる

### 6.3 第三候補: `PAIRING-UX-DEADLOCK-INVENTORY`

**理由**:
- 実装前に **デッドロックパターンを知る必要** がある（§5.4）
- ただしロジック寄りで重くなりやすいので、**表示改善（第一・第二）の後** でもよい
- docs-only なので並走可能

### 6.4 当面やらないこと

- `PAIRING-UX-WINNER-CONFLICT-WARNING` の実装着手（design check 段階を経る前提）
- 完全自動 deadlock 検知の実装
- 自動組み合わせ最適化の刷新
- `<select>` 全面置換のような大規模 UI 改修（段階的に置換する DISPLAY-LABELS / UNASSIGNED-VISIBILITY の積み上げを優先）
- 個人情報フィールドの表示拡大（DISPLAY-LABELS の design check で範囲確定するまで）

---

## 7. 関連 PR / docs / 完了条件

### 7.1 起源 PR / docs

- 起源 PR（SAVE-UX → PAIRING-UX 遷移）: PR #98（§26 SAVE-UX-STATE-RESTORE-OBSERVATION main 着地、HEAD `6fb85e1`）
- 既存 pairing spec: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)
- 既存 operation note: [docs/operations/20260510_tournament_setup.md](docs/operations/20260510_tournament_setup.md)
- 既存 SAVE-UX 全体地図: [docs/notes/20260513_shogi_save_ux_status_map.md](docs/notes/20260513_shogi_save_ux_status_map.md)（§26 まで）

### 7.2 完了条件（本 inventory PR）

- 本 `docs/notes/20260514_shogi_pairing_ux_inventory.md` が main にあること（merge 後）
- `HANDOFF.md` に PAIRING-UX-INVENTORY ポインタが追加されていること
- 変更ファイルは上記 2 件のみ
- **実装変更なし** / **テスト変更なし** / **CI 設定変更なし**
- `shogi_v4.html` / `test/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js` は変更しない
- 次タスク候補（§5）は「すぐ実装」ではなく、必要に応じて design → implementation の段階になっていること

### 7.3 変更ファイル

- `docs/notes/20260514_shogi_pairing_ux_inventory.md`（本ファイル、新規）
- `HANDOFF.md`（PAIRING-UX-INVENTORY ポインタ追加）

### 7.4 変更しないファイル

- `shogi_v4.html`
- `test/`（全ファイル）
- `docs/specs/`
- `.github/workflows/`
- `package.json` / `package-lock.json`
- `playwright.config.js`
