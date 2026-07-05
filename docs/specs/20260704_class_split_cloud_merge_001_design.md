# CLASS-SPLIT-CLOUD-MERGE-001 — A級/B級 分担入力 → Supabase 統合 設計

| 項目 | 内容 |
|---|---|
| ID | CLASS-SPLIT-CLOUD-MERGE-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-07-04 |
| ステータス | Draft（設計メモ・実装は後続 IMPL 群・Draft PR で人間承認まで停止）／design-review = conditional-go（#538）反映済み |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（`main` を base にしない） |
| 対象ファイル（実装は別PR） | `shogi_v4.html`（既存クラウドグルーの拡張）。スキーマは既存 `supabase/migrations/` を流用（原則追補なし） |
| 親機能 | DATA-PERSISTENCE-PHASE2 Stage A（スキーマ+RLS+ログイン）／CLOUD SYNC B-2a/B-2b/B-3a/B-3b（#343・送信/取得導入済み） |
| 準拠 | CLAUDE.md 拘束9ルール・REFERENCE §3 データモデル不変条件・STYLE-GUIDE・"追加/最小改変中心"・secret不使用 |

---

## 0. 要約（TL;DR）

やりたいこと=「A級担当とB級担当が別々の端末で自分の級だけ組み合わせ・結果入力し、各自クラウドへ送信、成績発表時に双方がクラウドから取得して報告書・成績表を統合する」。

結論: **新しい仕組みはほぼ不要**。既存の Supabase 同期（#343）に、この運用は構造的にそのまま乗る。理由は3つ。

1. `entries`（成績）テーブルは最初から各行に `class` を持ち、キーが `(tournament_id, player_id)`。A級担当は class='A' の行、B級担当は class='B' の行だけを書くので、**両者は物理的に別の行に書き込む＝上書き衝突が起きない**（行レベルの自動マージ）。
2. `tournaments` の upsert キーは `(club_id, app_tournament_id)`。両担当が**同じ大会ID**（`state.tournament_id`）を使えば、両者の entries は**同じ大会に相乗り**する＝統合済みの状態でクラウドに載る。
3. 送信（`syncTournamentToCloud`）・名簿取得（`pullMembersFromCloud`）・大会+成績の読み取り（`fetchCloudTournaments` + entries 読取）は**すでに実装済み**。統合レポートは既存の読み取り経路の再利用で作れる。

新規で必要なのは主に「**大会IDの共有手順**」と「**両級を束ねた統合レポート表示**」の2点だけ。既存の当日運営（localStorage・ローカルファースト）は無改変。

---

## 1. 運用ジャーニー（設計の背骨）

技術構成（Supabase）は手段。以下が滑らかに繋がって初めて「使える」。

| # | 担当の行為 | 成立条件 | 設計上の担保 |
|---|---|---|---|
| J1 | 当日の大会を両担当で同一に開始 | 同じ club・同じ大会ID・同じ名簿から始める | §3.1 共有セットアップ（大会ID配布＋名簿pull） |
| J2 | 各自クラウドから名簿マスタを取得 | member_id 空間が両端末で一致 | 既存 `pullMembersFromCloud`（B-3b） |
| J3 | A級/B級を各端末でローカル進行 | 当日運営は外部依存ゼロで動く | 既存 localStorage・組み合わせ/結果はローカル（無改変） |
| J4 | 確定後、各自が自分の級をクラウドへ送信 | 自分の級の行だけが送られる | 既存 `syncTournamentToCloud`＋§3.3 送信規律 |
| J5 | 成績発表で双方がクラウドから取得 | 両級の entries が1大会に揃って読める | 既存 `fetchCloudTournaments`＋entries読取（§3.4） |
| J6 | 級横断の報告書・成績表を出力 | 級ごとに並ぶ／必要なら総合順位 | §3.5 統合レポート（新規・薄い表示層） |
| J7 | ネットが落ちても統合できる | ファイル手渡しの予備経路が残る | §4 オフライン退避（既存書き出し/読み込み） |

---

## 2. 既存資産の棚卸し（実装済みで流用するもの）

`shogi_v4.html` / `supabase/migrations/` を確認した結果、以下は**すでに存在する**。

### 2.1 スキーマ（`supabase/migrations/20260620130000_stagea_schema.sql`）
- `entries.class`（text・NOT NULL）を各行が保持。`unique(tournament_id, player_id)`。
- `tournaments`：`unique(club_id, id)`＋`app_tournament_id`（B-2b で追補済み）を冪等キーに使用。`status in ('draft','confirmed','synced','void')`。
- `members(club_id, member_id)` が名簿の join キー。氏名は members に集約・RLS で active organizer のみ SELECT。
- 複合 FK `entries(club_id, tournament_id)` / `(club_id, player_id)` で club 越境参照を拒否＝多テナント分離。

### 2.2 送信（ローカル → クラウド）
- `buildCloudSyncPayload(master, opts)`：`state.classes` を走査し、各 class の finals から entries を生成。**entries 行に `'class':cls` を既に載せている**（`shogi_v4.html` 現行）。空の級は `if(!players.length)continue;` で自然にスキップ。
- `syncTournamentToCloud(client, master, opts)`：members→players→tournament→entries を冪等 upsert。
  - members onConflict=`club_id,member_id` / players=`club_id,member_id` / tournament=`club_id,app_tournament_id` / entries=`tournament_id,player_id`。
  - throw せず `{ok,...}` を返す（当日運営を止めない・失敗は status 表示のみ）。

### 2.3 取得（クラウド → ローカル）
- 名簿: `pullMembersFromCloud` + `mergeCloudMembersIntoMaster`（非空ガード付き last-writer-wins・tombstone 反映・同名別人は member_id 不一致で誤統合しない）。
- 大会+成績: `fetchCloudTournaments(client, clubId)`（`tournaments` を select）と `fetchCloudEntriesForTournament(client, tid, clubId)`（entries を `select('final_rank,class,wins,losses,sos,sodos,player_id').eq('tournament_id',tid)` で読取・大会履歴タブで使用）。**class 込みで両級を一括で読める**。

---

## 3. 設計（最小改変で足すもの）

### 3.1 共有セットアップ（新規・運用手順＋薄いUI）
統合が成立する前提は「両担当が**同じ座標**で始める」こと。共有すべきは次の3つ。

- **club（ログイン）**: 両担当が同一 club の active organizer としてログイン（既存 Stage A）。RLS が同 club の読み書きを許可する。
- **大会ID（`state.tournament_id`＝`app_tournament_id`）**: これが一致して初めて両級が同じ `tournaments` 行に相乗りする。現状は端末ローカルで生成されるため、**一方が生成→他方へ共有**する導線が要る。案:
  - (a) 幹事が当日の大会IDを口頭/チャットで共有し、他方が「大会IDを指定して開始」で貼り付ける（最小・確実）。
  - (b) 日付＋season から決定的に導出（例 `numazu-YYYYMMDD`）して両端末が同じ ID を自然に持つ（手順レス・ただし同日複数大会に注意）。
  - 推奨は当面 (a)。UI は「大会IDをコピー」ボタン＋「大会IDを指定して開始」入力の追加のみ（当日運営ロジックは不変）。
- **名簿マスタ**: 当日朝に両端末で `pullMembersFromCloud` を実行し member_id 空間を揃える（既存機能・追加実装不要）。

### 3.2 級の持ち方（決定事項）
**1つの大会に class 付き entries を相乗りさせる**方式を採る（A級/B級を別 `tournaments` 行に分けない）。

- 根拠: スキーマの `entries.class` はまさにこの用途。統合レポートは同一 `tournament_id` の entries を class で仕分けるだけで済む。別大会にすると「報告書段階での大会マージ」という余計な結合が増える。
- 注意: `state.classes` は CLASS-VARIABLE-001 で runtime 可変（A/B 固定ではない）。設計は「担当端末が持つ級だけ送る」で一般化し、A/B に限定しない。
- **前提不変条件（"衝突なし" の土台・design-review Should①）**: cloud の `player_id` は `(club_id, member_id)` 由来＝**会員単位（級ではない）**。したがって `entries` のキー `(tournament_id, player_id)` は「1大会・1会員・1行」。「各担当が自分の級だけ書けば別行＝衝突なし」は **「同一会員は1大会で1級のみ」** が成り立つ限りで保証される。同じ member_id が A級端末と B級端末の双方の state に入ると、両者が同一 `(tournament_id, player_id)` を別 class で書き→ last-writer-wins で片方の entry が消える。運用上「1人1級」で通常満たされるが、設計の土台なので明記する（**同一会員の二重登録を UI/運用で禁止**）。

### 3.3 送信規律（新規・ガード）
「各端末は自分の級だけ送る」を**仕組みで担保**する。`buildCloudSyncPayload` は `state.classes` 全走査なので、端末に相手級のデータが載っていると相手行まで送ってしまう（RLS は同 club なら書けてしまう＝上書きの余地）。対策の候補:

- (推奨) **端末が自分の級のデータしか持たない運用**を基本とし、送信前に「送信対象の級＝{A} のみ」を明示表示して確認させる（誤って両級持ちの端末が全送信するのを人が気づける）。
- (任意・堅牢化) 送信時に `opts.classesFilter` を受け取り、payload の entries を対象級に絞る薄い引数追加。**既定挙動は不変で、opt-in（`classesFilter` 指定時のみ）で新挙動を gate する**追加＝デフォルト経路が変わらないため CLAUDE.md 9ルール①（動作を変えるリファクタ禁止）に抵触しない（design-review Nice 反映）。tournament 行の name/date は両担当で一致する前提（§3.1）なので last-writer-wins でも実害なし。

### 3.4 取得（既存経路の再利用）
成績発表時は、どちらか1台（または双方）が `fetchCloudTournaments`→当該大会の entries 読取で**両級まとめて**取得する。ここは既存の大会履歴読取がそのまま該当。ローカル state への書き戻しは必須ではなく、**読み取り専用の統合ビュー**として描画すれば当日運営 state を汚さない（安全側）。

### 3.5 統合レポート（新規・薄い表示層）
取得した「1大会・全 class の entries」を入力に、報告書/成績表を級横断で描画する薄いレンダラを足す。

- **成果物＝級ごとに成績表を並べた1つの報告書（確定）**。単純結合・順位は各級内で確定済みの `final_rank` をそのまま使用。既存の成績カード/テーブル生成（`_cloudResultCardsHtml`/`_cloudResultTableHtml` 相当）を class でグルーピングして再利用するだけで済む＝**順位ロジックの新規追加は不要**。
- 級をまたいだ総合順位は**やらない**（本設計のスコープ外）。将来必要になったら別スライスとして切る。
- **既知の限界（upsert-only の残留 entry・design-review Should②）**: 送信は upsert のみで、一度送った後に棄権/削除で人数が減っても旧 `entry` 行は消えない。全 class の entries を読む統合ビューに残留行が混じり得る（単機運用でも同じ既存挙動）。統合レポートの正確性に関わるため、実装フェーズで「最新送信に含まれない entry の扱い（表示除外 or 明示）」を検討する（§8-6）。

---

## 4. オフライン退避（当日の事故対策）

会場ネットが不安定でも成績発表を止めないため、**クラウド同期はあくまで追加機能**とし、従来のファイル書き出し/読み込み（大会データ）を予備経路として必ず残す。ネットが死んだ場合は、各担当が大会データをファイル書き出し→1台へ読み込み（形式自動判別・既存）で手動統合できる二重化を維持する。これは "当日運営は外部依存ゼロ＝ローカルファースト" 原則（LIVE-BROADCAST-001 と同じ）の踏襲。

---

## 5. 関連作業との調整（LIVE-BROADCAST-001 との SoT 前提の交差）★重要

本設計は、並行進行中の **LIVE-BROADCAST-001**（設計 #533／Phase1 実装 #534）と**設計前提が交差する**。実装衝突より先に、ここを握る。

### 5.1 交差点
- **コード衝突は小さい**: #534 は純関数 `buildPublicLiveSnapshot(state)` を追加するだけで、送信路（`syncTournamentToCloud` 等）には触れない。本設計の重い実装（統合レポート＝Phase 3）はより後。`shogi_v4.html` の物理衝突は当面ほぼ無い。
- **概念の食い違いが本質**: LIVE-BROADCAST は「**運営端末1台＝唯一の真実源（SoT）→一方向 publish**」を前提に設計されている。一方、本設計は「**A担当・B担当の2端末が各々部分的な SoT**」を持ち込む。→ 配信スナップショットを**誰の端末が publish するか／両級をどう1配信にまとめるか**が未定義になる。マージ時ではなく**設計段階で決める**（放置すると両者とも実装後に作り直し）。

### 5.2 SoT 食い違いの決着 — **案②で確定（2026-07-04 髙橋 / #538・#533）**

**決定＝案②「参加者は常に1つの合体スナップショットを読む」。** 配信契約を「いつでも1つの合体済みスナップショットを配る」に固定し、それが1台で作られたか2台を合体したかを参加者ビューは区別しない。

- **1台運営（当面の既定）は追加ゼロ**: 1台の端末は全級を state に持つため、両級入りの1スナップショットを publish するだけ＝**現行 LIVE-BROADCAST 設計のまま**。合流処理を新設しない。
- **2台ライブ合体は将来拡張・当面は作らない**（A/B 担当分けは当面行わない前提）。2台でライブ配信が必要になった時に「誰が両級を合体して publish するか」を別スライスで設計する。
- **成績発表の統合レポートは配信路とは別問題**: クラウド `entries` は級ごとに別行（キー `(tournament_id, player_id)`＋各行 `class`）で入るため、**1台でも2台でも DB 行レベルで自動統合**される（§3.5）。案②の「2台ライブ合体先送り」は統合レポートに影響しない。
- 参考（不採用）案①＝級別 publish→参加者ビューで合流。当面来ない2台運用のための合流機構を常に抱えることになるため、1台既定の本運用では過剰と判断。

> 決定は本書・#538・LIVE-BROADCAST 設計 #533 の三者に共有前提として記録済み（`related_issue` で相互に辿れる）。

### 5.3 進め方（並行のまま安全に）
- **docs は並行可**: 設計メモ同士は物理衝突しない。本書と #533/#537 は並走してよい。
- **`shogi_v4.html` のクラウド周りを触る IMPL は直列化**: 送信路・配信面に手を入れるフェーズは「片方 merge → もう片方 rebase」の順。各スライスは**追加のみ・小さく**保ち rebase を軽くする。
- **ゲートは不変**: Draft 停止・人間承認まで Ready化/merge しない。stage ラベルは reconciler が唯一の書き手（自分で付け替えない）。

## 6. CLAUDE.md 拘束9ルールとの整合（実装フェーズ向け）

| # | ルール | 本設計での扱い |
|---|---|---|
| 1 | 動作を変えるリファクタ禁止（引数整理は許容） | §3.3 の `classesFilter` は opt-in gate（既定不変・引数追加のみ）。挙動変更なし |
| 2 | build/bind/coordinator 維持 | 新規は既存グルー（`sendTournamentToCloud`/bindReportEvents）に薄く結線 |
| 3 | CSS 動作を変えない | 表示層は既存カード/テーブル CSS を再利用。`.section` 閉じタグ省略は触らない |
| 4 | ES5/クロージャ/グローバル state 維持 | 新規関数も同流儀・フレームワーク化しない |
| 5 | テスト必須（WARN=0 維持） | `bash test/run_tests.sh shogi_v4.html`。統合レポート/送信フィルタは純関数として test 追加 |
| 6 | 関数構造の意図しない変化なし | 既存 `buildCloudSyncPayload`/`syncTournamentToCloud` の構造は保持（引数追加のみ） |
| 7 | 挙動変更はリファクタと別フェーズ | 共有セットアップUI・統合レポートは各々別 Draft PR |
| 8 | 編集対象は `shogi_v4.html`・追加/最小改変中心 | スキーマ追補は原則なし（既存列で足りる）。`index.html`/`.github` は触らない |
| 9 | production 反映時は `?v=N` インクリメント | 本番反映は別 release PR（人間承認後） |

---

## 7. 段階導入（実装は後続 IMPL・各 Draft PR で停止）

- **Phase 1**: 共有セットアップ（大会IDのコピー/指定開始＋名簿pull 徹底）。ここまでで「同じ大会に相乗り」が成立。→ 実装依頼 #540。
- **Phase 2**: 送信規律（対象級の明示表示＋任意の `classesFilter`）。誤送信ガード。
- **Phase 3**: 統合レポート（級別結合の読み取り専用ビュー）。**ここで「成績発表の統合」が実用化**。級横断の総合順位はやらない（スコープ外）。
- 各 Phase は docs-only の本書を親に、実装 PR を Draft で作成し人間承認まで停止。secret/実データ不使用・テスト fixture は架空のみ。

---

## 8. 未確定・要確認（実装着手前に人間確認）

1. 大会IDの共有方式は (a) 手動共有 / (b) 決定的導出 のどちらを正とするか（推奨: 当面 (a)）。
2. ~~統合レポートの成果物~~ → **決定・級別結合のみ**（級ごとに成績表を並べる。総合順位は出さない＝2026-07-04 髙橋確認）。
3. ~~`tournaments.app_tournament_id` 列の有無~~ → **確認済み・存在**（`supabase/migrations/20260623150000_stageb_tournaments_app_id.sql`＋`..160000_..._fix.sql`）。冪等キー `(club_id, app_tournament_id)` はそのまま使える＝スキーマ追補不要。
4. 送信規律を運用（人の確認）だけで足りるか、`classesFilter` 実装まで入れるか。
5. ~~（LIVE-BROADCAST-001 と共有）SoT 前提の決着~~ → **決定・案②**（参加者は常に1つの合体スナップショットを読む。1台運営は現行設計のまま・2台ライブ合体は将来拡張・成績発表の統合は entries 行レベルで自動＝2026-07-04 髙橋確認・#538/#533 記録済み）。詳細 §5.2。
6. **（design-review Should②）upsert-only の残留 entry**: 棄権/削除後に旧 entry 行が残り、統合レポートに混じり得る。実装フェーズで「最新送信に含まれない entry の扱い」を決める（§3.5）。

---

## 9. design-review 反映（#538 / verdict: conditional-go）

別セッションの独立 Claude Code レビュアー（`reviewer: claude-code:independent-review-session`）による design-review（L3）を反映。**事実主張（既存関数・onConflict キー・`entries.class`・`app_tournament_id` 列・class 込み entries 読取・カード/テーブル再利用）は全て実コードと一致**と確認され、コア論理（別行＝衝突なし／同一大会ID相乗り／既存読取の再利用）は妥当と評価された（verdict: conditional-go・P0/P1 なし）。Should 反映:

1. §3.2 に **「同一会員は1大会で1級のみ」** の前提不変条件を明文化（`player_id`=会員単位のため）。
2. §3.5 / §8-6 に **upsert-only の残留 entry** の限界を注記（実装フェーズで扱いを決定）。
3. §2.3 / §3.4 の entries 読取を実関数 `fetchCloudEntriesForTournament` に精緻化。§3.3 の `classesFilter` を **opt-in gate（既定不変）** 表現へ修正（Nice 反映）。

Phase 1（#540）実装着手は conditional-go により可（上記 Should を設計へ反映済み）。
