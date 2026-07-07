# CLOUD-TOURNEY-NAMING-001 設計 — クラウド過去大会一覧の表記統一「YYYY年M月度＋大会名」（表示側正規化）

- 対象 Issue: #608（CLOUD-TOURNEY-NAMING-001）
- 種別: docs-only 設計（実装は後続 PR）
- canonical_decision: PMO-OPS v2.1-final
- related: #343（Stage B・season/命名の前提）／ #607（属性スナップショット・別設計）
- 関連コード（`shogi_v4.html` HEAD 調査済み）: `fetchCloudTournaments`(L14207)／`buildCloudTournamentListHtml`(L14230)／`renderCloudTournamentDetail`(L14327)／`REPORT_FIELD_SPECS.title`＋`normalizeReportField(...,'title')`(L1616/L1664)／`deriveSeason`(L9671)

## 0. 決定事項（作者確定 2026-07-07・本設計の前提）

1. **方式＝表示側の正規化のみ。** クラウドの `tournaments.name` は書き換えない（読み取りだけ）。可逆・当日運営無改変・fail-soft。旧取込データの中身は不変のまま、一覧の見た目だけ統一する。
2. **大会名の寄せ方＝月例は統一・特別名は温存。** 通常の月例大会（「月例将棋大会2026-04」等のぶれ）は正規名 **「沼津支部月例将棋大会」** に寄せる。優勝大会・選手権など月例でない特別名はそのまま残す。
3. **対象範囲＝両方。** 当日アプリ `shogi_v4.html` のクラウド過去大会一覧／詳細と、`app/` 管理ページの両方で統一表示する。

> クラウド `tournaments.name` の一括更新（名寄せの永続化）は本設計のスコープ外。必要になれば別 Issue（冪等・旧名記録・可逆を要件化した L3+ の書き込み設計）で扱う。§8 参照。

## 1. 課題と現状

クラウド過去大会一覧の大会名は取込経路により不統一。例: JSON 取込由来の「月例将棋大会2026-04」と、当日アプリ送信由来の「沼津支部月例将棋大会」が同一シリーズなのに別物として並ぶ。年月の粒度も名前に埋め込まれたり埋め込まれなかったりで、一覧を「同じ月例シリーズ」として縦に読めない。

現状の名前生成は当日アプリ送信時の `normalizeReportField(title)`（`REPORT_FIELD_SPECS.title`・L1616/L1664）だけで、trim＋末尾『報告書』1回除去＋既定値『沼津支部月例将棋大会』。**一覧表示側には正規化が無い**（`buildCloudTournamentListHtml` は `name`/`date`/`season` を素で描画）。`tournaments.season` は `deriveSeason(date)`＝「YYYY年度」（4月境界の**年度**）で、月粒度の「M月度」は持っていない。

→ 表示ラベルの「YYYY年M月度」は **`tournaments.date` の暦月から導出**する（season＝年度とは別物）。

## 2. 設計 — 表示用の純関数3本（追加のみ・当日運営コア無改変）

いずれも副作用なしの純関数。既存関数は無改変で、一覧/詳細のタイトル生成箇所からのみ呼ぶ。

### 2.1 `buildMonthlyPeriodLabel(dateYmd)` → 「YYYY年M月度」 or ''

- 入力: `tournaments.date`（`YYYY-MM-DD`）。
- 正: 年と**暦月**を取り出し `YYYY + '年' + M + '月度'`（M は先頭ゼロ無し。例 `2026-04-15`→`2026年4月度`）。
- 異常（空/パース不可/月が1..12外）: **`''` を返す**（fail-soft）。
- 注: season（年度・4月境界）とは無関係。月度＝開催月そのもの。

### 2.2 `canonicalizeCloudTournamentName(name)` → 表示用の大会名

手順（すべて表示用の一時変換・元データ不変）:

1. `String(name||'').trim()`。空なら既定 `'沼津支部月例将棋大会'` を返す。
2. 末尾『報告書』を1回だけ除去（既存 title 正規化と同義）。
3. **末尾の日付トークンを1回除去**（前置の「YYYY年M月度」と重複させないため）。対象パターン例: 末尾の ` 2026-04` / `2026-04` / `2026-04-15` / `2026年4月` / `（2026-04）` 等の区切り＋日付表記。除去後に再 trim。
4. 正規化後の文字列が**月例シリーズ**と判定できる（`月例` を含む、または手順1–3の結果が空）なら → 正規名 **`'沼津支部月例将棋大会'`** を返す。
5. それ以外（`月例` を含まない固有名＝特別大会）→ 手順3までの trim 済み文字列を**そのまま返す**（温存）。

判定は「`月例` トークンの有無」を軸にする（`月例将棋大会2026-04`・`月例大会`・`沼津支部月例将棋大会` を統一側に集約し、`〇〇杯`『△△選手権』等は温存側に残す）。未知の非月例名は**温存（安全側）**に倒す。

### 2.3 `buildCloudTournamentDisplayTitle(name, dateYmd)` → 一覧/詳細のタイトル文字列

- `period = buildMonthlyPeriodLabel(dateYmd)`
- `base = canonicalizeCloudTournamentName(name)`
- `period===''`（日付欠損）→ `base` を返す（fail-soft・日付が無ければ名前だけ）。
- `base` が既に `period` を先頭に含む場合は二重付与しない（`base` をそのまま）。
- それ以外 → `period + ' ' + base`（例 `2026年4月度 沼津支部月例将棋大会`）。

## 3. 結線（表示箇所のみ・最小改変）

### 3.1 `shogi_v4.html`

- `buildCloudTournamentListHtml`（L14230 付近）: 各行のタイトルを `buildCloudTournamentDisplayTitle(t.name, t.date)` に置換。`date`/`season` の補助表示は現行維持（情報を減らさない）。並びは既存（date 基準）を維持。
- `renderCloudTournamentDetail`（L14327 付近）: 見出しの大会名も同関数で統一。
- `fetchCloudTournaments`（L14207）の SELECT（`id,name,date,season,status`）は変更不要（`date` は既に取得済み）。
- 純関数は build/bind/coordinator の build 側に追加。ES5・グローバル `state` 非依存・テスト容易（引数のみ）。

### 3.2 `app/` 管理ページ

- クラウド過去大会一覧を描画する箇所へ、同一仕様の3純関数を**鏡写しで移植**して適用（`shogi_v4.html` と表示規則を一致させる）。実装フェーズで app 側の描画関数を特定し最小改変。

## 4. 不変条件（表示のみ・壊さないもの）

- **クラウド書き込みゼロ**: `tournaments.name`/`season`/その他列は一切更新しない。RLS/権限に触れない読み取りのみ。
- **当日運営コア無改変**: localStorage の大会進行・送信 `syncTournamentToCloud`・`buildCloudSyncPayload` は無改変。
- **可逆**: 表示専用変換ゆえ、関数を外せば元表示に戻る。データ側に痕跡を残さない。
- **fail-soft**: 日付欠損・名前欠損・想定外フォーマットでも例外を投げず、最悪でも素の `name` を表示。
- **情報を減らさない**: 生の `date`（と必要なら season）は引き続き併記可能。

## 5. エッジケース

- `date` 欠損/不正 → `period=''` → 名前のみ表示（統一は月名部分だけ諦め、名前正規化は効く）。
- 名前が空 → 月例既定 `沼津支部月例将棋大会`。
- 名前に日付が埋め込み（`月例将棋大会2026-04`）→ 末尾日付除去→`月例将棋大会`→`月例`含む→正規名。前置 period と重複しない。
- 特別名（`第10回沼津竜王戦` 等・`月例` 無し）→ 温存し、前に `YYYY年M月度` を付すだけ。
- 既に `YYYY年M月度…` 形式で入っている名前 → §2.3 の二重付与ガードで period を重ねない。
- 同月に複数大会（`app_tournament_id` の `_n` 連番）→ 表示タイトルは同一になり得る。**識別のため date（YYYY-MM-DD）併記を維持**（タイトルだけで一意にはしない）。

## 6. 受入条件

1. 取込経路の違う同月データが、一覧で同一の「YYYY年M月度 沼津支部月例将棋大会」ラベルに揃う（縦に同一シリーズとして読める）。
2. 月例でない特別名は名前が温存され、前に「YYYY年M月度」だけ付く。
3. `date` 欠損時も例外なく素の名前で表示（fail-soft）。
4. クラウドの `tournaments.name` は変更されない（送信・再取得で元名のまま／表示だけ統一）。
5. 当日アプリと `app/` 管理ページで**同一の表示規則**になる。
6. `bash test/run_tests.sh shogi_v4.html` が WARN=0 を維持し、新規純関数のユニットテストが PASS。

## 7. テスト計画（純関数の fixture・架空データのみ）

- `buildMonthlyPeriodLabel`: `2026-04-15`→`2026年4月度`／`2026-12-01`→`2026年12月度`／`''`・`bad`・`2026-13-01`→`''`。
- `canonicalizeCloudTournamentName`: `月例将棋大会2026-04`→`沼津支部月例将棋大会`／`沼津支部月例将棋大会`→同／`''`→既定／`月例将棋大会 報告書`→正規名／`第10回沼津竜王戦`→温存／`○○杯2026-04`→`○○杯`（温存＋末尾日付除去）。
- `buildCloudTournamentDisplayTitle`: 上記の合成（period＋base・日付欠損時 base のみ・二重付与なし）。GOLDEN 文字列を fixture で pin。
- 回帰: 既存 `buildCloudTournamentListHtml`/`renderCloudTournamentDetail` の他要素（date/season/クラス表）に影響が無いこと。

## 8. スコープ外（将来）

- **クラウド `tournaments.name` の永続的名寄せ**（一括更新）。実施する場合は別 Issue で、冪等・変更前 name の記録（可逆）・大会進行中ガード・app/管理側での実行（当日アプリを汚さない）を要件化した L3+ 書き込み設計とする。本設計の表示側統一が入っていれば、永続名寄せは「見た目のため」ではなく「データ品質のため」の判断として切り離せる。
- `app_tournament_id` の欠損した旧 import 行の識別子補完（#343 の別論点）。

## 9. 制約（HANDOFF.md 絶対ルール）

- [x] 追加/最小改変中心・当日運営は無改変（本 PR は docs のみ）
- [x] Draft PR で停止（Ready化/merge/production は人間の明示承認まで未実施）
- [x] secret/実データ不使用（例はすべて架空）
- [x] 実装フェーズで `bash test/run_tests.sh shogi_v4.html` WARN=0 を条件化

## 10. design-review 反映（2026-07-07・conditional-go 条件の取り込み）

別セッション・別素性の design-review 判定 = **conditional-go**（PR #657 コメントに凍結マーカー）。方式に block 事由なし。以下を実装 PR の必須条件として設計に取り込む。

### 10.1 [P1] 末尾日付トークン除去の正規表現安全化

§2.2 手順3の「末尾日付トークン1回除去」は、**区切り文字または月成分を伴う日付表記のみ**を対象とする。裸の4桁数字（`支部対抗戦2025`・`○○杯2026`）は日付とみなさず温存する。除去対象の具体パターン:

- 末尾 ` YYYY-MM` / `YYYY-MM-DD`（直前が区切り/空白/全角括弧）
- 末尾 `YYYY年M月`（`度` の有無を問わず）
- 全角括弧囲み `（YYYY-MM）` 等

数字終わりの固有名（例 `○○杯2026` → `○○杯2026` を温存）を GOLDEN で1本以上ピン留めする。

### 10.2 [P1] 一覧⇔詳細の表示整合（単一ソース化）

一覧 `.cloud-history-row` の `data-label` には **生の `t.name` を保持**し、表示は一覧 span・詳細見出しとも `buildCloudTournamentDisplayTitle(name,date)` から都度導出する（`canonicalizeCloudTournamentName` は冪等ゆえ二重適用も無害）。→ 一覧＝正規化名／詳細＝生名の食い違いを防ぐ。`renderCloudTournamentDetail(client,clubId,tid,label,date)` は受け取った生 `label` と `date` から詳細見出しを合成する。

### 10.3 [P2] 追加の堅牢化（実装で対応）

- 先頭埋め込み月度（名前先頭に `YYYY年M月度` があり date と食い違う場合）→ §2.3 の二重付与ガードを先頭 period トークン一般へ拡張し、二重月表示を防ぐ。
- 空化→月例既定の誤正規化（固有名が日付/報告書のみ → strip 後に空 → 月例名）は、テストで意図を明示的に固定する。

### 10.4 行番号の基準（レビュー補足の訂正）

design-review は当初ローカル mount（本番と別系統の stale コピー）を参照し「行番号スタール」と指摘したが、**本 PR の base（orphan clean base）では設計の行番号（`fetchCloudTournaments` L14207／`buildCloudTournamentListHtml` L14230／`renderCloudTournamentDetail` L14327／`deriveSeason` L9671）は実コードと一致**することを確認済み。ただし実装は行番号でなく symbol で再特定する方針は維持する（将来ドリフト耐性）。

---

## 設計完了（判定は別セッション・別素性の design-review で）

クラウド**読み取り表示のみ**・書き込み無し・当日運営無改変ゆえ **Review Level L2〜L3 提案**（表示規則の妥当性・fail-soft・月例/特別の判定境界を独立確認）。実装（IMPL）は本設計レビューの go/conditional-go 後に着手・Draft 停止のまま。

```yaml
cowork-status: design-reviewed
reviewer: claude-code
review-verdict: conditional-go
review-conditions: [P1-regex-date-token, P1-list-detail-single-source]
task: 608
```

🤖 PMO-OPS v2.1-final / 実装ライン=Claude Code
