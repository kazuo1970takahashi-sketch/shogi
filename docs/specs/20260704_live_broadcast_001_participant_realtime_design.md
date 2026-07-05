# LIVE-BROADCAST-001 — 参加者向けリアルタイム戦況配信 設計

| 項目 | 内容 |
|---|---|
| ID | LIVE-BROADCAST-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-07-04 |
| ステータス | Draft（設計レビュー 4巡目 P1/P2 反映済み・独立 L3+ design-review conditional-go〔#532〕条件反映済み。Phase 1 実装 = #534 merge 済み・以降は後続 LIVE-BROADCAST-IMPL 群） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（HEAD は branch ref を正とする） |
| 対象ファイル（実装は別PR） | `shogi_v4.html`（配信送信グルー・公開ビュー経路）。参加者ビューは既存 `#scoreboard` レンダラを再利用（新規 `live.html` は作らない＝§5.2） |
| 親機能 | LIVE-MOBILE-SCOREBOARD-001（`#scoreboard` 閲覧ビュー・`withSourceState` データ源差し替え）／CLOUD SYNC B-2b（#343・supabase-js v2 遅延ロード・fail-soft）／DATA-PERSISTENCE-PHASE2 Stage A |
| 準拠 | CLAUDE.md 拘束9ルール・REFERENCE §3 データモデル不変条件・STYLE-GUIDE §1/§2/§3/§4 |
| 関連スライス | SCOREBOARD-MY-VIEW-001（対局者を探す＋個人ビュー層・本配信の公開ビュー上にそのまま載る）／CLASS-SPLIT-CLOUD-MERGE-001（#538・SoT 決定=案②＝§0.1） |

---

## 0. 要約（TL;DR）

現状の「📱 スマホ星取表」（`LIVE-MOBILE-SCOREBOARD-001`）は **同一ブラウザ内のセカンドスクリーン** に限られ、参加者が **各自のスマホからネット越しに戦況を見る** ニーズには応えていない。

この問題は「多人数同時編集の同期」ではなく、**運営端末1台が唯一の真実源（SoT）→ 一方向 publish → 参加者は read-only で fan-out 受信** に還元できる。よって専用リアルタイム基盤を新設せず、**既存 Supabase（送信/取得で導入済み）に配信専用の read-only な小さな面を1つ足す**のが最小かつ堅い。

採用アーキ（第三者AIレビュー2件と repo 実態の突き合わせ結果）:

1. **公開スナップショットの形（`buildPublicLiveSnapshot(state)` 純関数）を最初に確定する**。これが薄く安全なら、配信路はポーリングでも Realtime でも差し替え可能。
2. **配信は「📡 ライブ配信」の明示オプトイン**。オフ時は現状と完全に不変（**ローカルファースト＝当日運営は外部依存ゼロ**の原則を壊さない）。
3. **参加者ビューは既存 `#scoreboard` レンダラを再利用**（`withSourceState` でデータ源を localStorage → 公開スナップショットに差し替え）。順位ロジックを二重管理しない。
4. **「実用」は体験基準で定義する**（§1 参加者ジャーニー J1〜J7）。準リアルタイム更新だけでは不十分で、**参加者が入口に到達し（QR）・自分の状況を一目で把握でき（自分ビュー同梱）・スマホが無くても受付タブレットで見られる**まで揃って実用。よって QR・自分ビュー・受付キオスクは polish ではなく**実用フェーズの構成要素**。
5. **段階導入**: Phase 1 公開形の確定 → Phase 2 公開ビュー経路＋自分ビュー同梱 → **Phase 3 = 実用**（Supabase ポーリング＋QR掲示＋受付キオスク＋📡配信中表示）→ Phase 4 Realtime Broadcast 上乗せ（切れたらポーリング退避）→ Phase 5 polish。

本書は **docs-only**。実装は後続 **LIVE-BROADCAST-IMPL**（Phase ごとに Draft PR・人間承認まで停止）。

### 0.1 SoT 決定（確定・2026-07-04 髙橋・案②）— CLASS-SPLIT-CLOUD-MERGE-001 との交差

> **独立 design-review Must Fix #1 反映（#532）**: 本決定は従来 PR #533 コメント（#4880548521）にのみ存在した。IMPL が埋もれたコメントに依存しないよう、SoT 契約として本文へ固定する。

- **参加者向け配信契約は「常に1つの合体済みスナップショットを配る」で固定（案②）**。本設計の「運営端末1台＝SoT→一方向 publish」は**本決定による変更なし**でそのまま維持する。
- A級/B級の担当分け入力（CLASS-SPLIT-CLOUD-MERGE-001・#538）は当面行わない前提。**「2台ライブ合体」（複数端末が部分 SoT を持ち寄る配信）は将来拡張**として切り出し、当面実装しない。
- 参加者ビュー（SCOREBOARD-MY-VIEW-001）と公開ビューは配信元が1台か2台かを区別しないため、**本決定により my-view / 公開ビューの設計は不変**。
- 成績発表の統合（級別結合レポート）は配信路とは別系統（クラウド `entries` の行レベルで自動統合・#538）。**LIVE-BROADCAST の配信スコープには影響しない**。
- related_issue: #538 ／ 決定の記録: PR #533 コメント #4880548521（2026-07-04 髙橋 確定）

---

## 1. 参加者ジャーニー（設計の背骨）と背景

**この設計は「参加者が戦況を把握できる体験」を成立させるためにある。技術構成（Supabase/Realtime）はその手段にすぎない。**
以下の一連の道のりが全て滑らかに繋がって初めて「使える」とみなす。各ステップは受入条件（§8）と 1:1 で対応する。

| # | 参加者の行為 | 成立条件（無いと詰まる） | 設計上の担保 |
|---|---|---|---|
| J1 | ライブ配信があると気づく | 会場掲示・アナウンス・「配信中」表示 | 運営側「📡 配信中」状態表示（§5.1）＋掲示物 |
| J2 | **入口にたどり着く** | **QR/短縮URL がその場にある／スマホが無くても受付端末で見られる** | **QR/短縮コード＋受付タブレット(キオスク)を実用フェーズに含める（§5.3・§6・最重要）** |
| J3 | スマホのブラウザで開く（またはキオスクを触る） | インストール/ログイン不要 | anon read・PWA不要（§4.2）・キオスクは常設（§5.3） |
| J4 | 数秒で戦況が出る | 初回スナップショット取得が速い・軽い | 小さな公開JSON＋REST 1回（§3） |
| J5 | **相手・自分の状況が分かる** | **星取表で関係が見え、番号を探さず個人も引ける** | **既定=星取表（相手が見える）＋検索/絞り込み＋行タップで個人ビュー＝相手名（MY-VIEW-001 同梱・§6）** |
| J6 | 更新に気づける／古さが分かる | 自動更新＋「最終更新」時刻 | 5秒ポーリング→Realtime・鮮度表示（§5.2） |
| J7 | 席を立って戻っても復帰する | 画面復帰で再取得・キオスクは自動で全体表示へ戻る | focus/visibilitychange 再取得（§7②）・キオスク無操作リセット（§5.3） |

> J2（入口）と J5（自分の状況）は、以前の設計で「Phase 5 polish」に後回しにしていた。だが参加者にとっては **J2 が手順の最初**、**J5 が最大の苦痛**であり、ここが無い配信は「動くが使えない」。本改訂で両者を**実用フェーズ（§6）へ引き上げる**。

### 背景

- `LIVE-MOBILE-SCOREBOARD-001` は `#scoreboard` で全画面の星取表を出すが、**同一ブラウザの localStorage を storage イベントで共有**する仕組み。別端末・ネット越しには届かない。
- 参加者ニーズ = 「自分のスマホで、今の順位・星取・**現在の手合せ（誰が何卓）** を準リアルタイムに見たい」。
- 制約が有利に働く: **書き換えるのは運営端末1台だけ**（`state` が SoT）。競合解決・ロック不要。データは小さな JSON（数十人）。**既存 Supabase 接続あり**（`_cloudSbReady` / `loadCloudDeps` / `syncTournamentToCloud`・#343）。

---

## 2. アーキ比較（レビュー2件＋ repo 実態）

| 案 | 即時性 | 実装労力 | コスト | 失敗モード | 判定 |
|---|---|---|---|---|---|
| **Supabase snapshot ポーリング** | 3–10秒 | 低 | 予測容易・無料枠内 | 更新が遅れるだけ（運営は継続） | **Phase 3＝実用ライン** |
| **Supabase Realtime Broadcast ＋ snapshot** | 高（~1秒） | 中 | 無料枠内（200同時/2Mmsg 月） | WS 不通時ポーリングへ退避 | **Phase 4＝到達点** |
| Realtime Postgres Changes | 高 | 中〜高 | 同枠 | DB write と運営操作が結合 | 不採用（結合を避ける） |
| Firebase RTDB | 高 | 中 | 無料枠あるが別基盤 | Supabase と二重管理 | 不採用 |
| Ably / Pusher | 高 | 中〜高 | 無料枠あり | 静的HTMLに publish secret を置けず中継必須 | 不採用 |
| Apps Script / 静的JSON | 5–15秒 | 低〜中 | ほぼ無料 | クォータ・キャッシュ・遅延が読みにくい | 不採用（既存 Supabase 優先） |

**無料枠根拠（2026-07）**: Supabase Realtime Free = 200 concurrent connections / 2M messages 月 / Broadcast payload 256KB。数十接続なら桁が2つ余る。

**結論**: 既存 Supabase を活かし、**ポーリングで実用化 → Realtime を上乗せ**。別サービス追加は「二重基盤・secret 中継」の負債に見合わない。**Broadcast だけを真実源にしない**（WS は切れる）＝常に「最新スナップショットを取り直せる場所（DB 行）」を持つ。

---

## 3. 公開スナップショットの形（本設計の核心）

> 「一番いい最初の一手は、リアルタイムではなく “公開スナップショットの形” を決めること」（レビュー結論）。ここを薄く・安全にする。

### 3.1 `buildPublicLiveSnapshot(state)` — 純関数（Phase 1 の唯一の成果物）

> **Must Fix #2 反映（設計レビュー #533 / conditional-go）**: 当初 §3.1 は表示用 DTO（`standings`/`marks`/`current_pairings`）を出す案だったが、§5.2 は viewer が既存 `withSourceState` + `buildScoreboardClassTableHtml`（＝`state` 形を期待）でそのまま描く設計で、**両者が食い違っていた**。順位ロジック非複製を守るには viewer に `state` 形を渡すのが正。よって**表示用 DTO を新設せず、公開範囲に絞った「`state` 部分集合」を出す**に統一する。

現 `state` から **公開範囲に絞った `state` 部分集合** を取り出す純関数。出力は **レンダラが期待する `state` と同じ形**（`classes` / `players[cls]` / `results[cls]` / `pairings[cls]`）にし、viewer 側は `normalizeState` → `withSourceState` → 既存 `buildScoreboardClassTableHtml` / `calcFinal` / `computeDisplayRanks` を**そのまま**駆動する（順位・星取・相手名は viewer で再計算＝ロジック非複製）。**保存スキーマは触らない**（`state` を読むだけ・REFERENCE §3）。既存 `buildCloudSyncPayload`（#343）とは別物（あちらは名簿正本の upsert 用）。

公開範囲は**プレイヤーのフィールド単位でホワイトリスト**する（§3.2）。wire の `match` は `{p1,p2,winner}` のみ（`sanitizeMatch` 正準形 `{p1,p2,winner,lastModifiedBy}` の `lastModifiedBy` は載せない・下記 P2-2）。

**純関数 `buildPublicLiveSnapshot(state)` の出力**（**`slug`/`version`/`updated_at` は含めない**＝配信 envelope の責務・後述。P2/P1-2 反映）:

```
{
  "schema_version": 1,
  "meta": { "title": "沼津支部月例将棋大会", "status": "in_progress|final" },
  "state": {                           // ← レンダラが食える state 形
    "rounds": 4,                       // 全体既定回戦数（roundsForClass が読む・P1-1）
    "classes": [ { "id": "A", "name": "A級", "started": true, "rounds": 4 } ],  // クラス別回戦数も（非4回戦・クラス別回戦数大会・P1-1）
    "players": { "A": [ { "id": "p12", "name": "山田太郎", "yomi": "やまだたろう", "entry_no": 12 } ] },
    "results": { "A": [ [ { "p1": "p12", "p2": "p5", "winner": "p12" } ] ] },   // wire の match は {p1,p2,winner}（lastModifiedBy は載せない・下記 P2-2）
    "pairings":{ "A": [ { "p1": "p12", "p2": "p9", "winner": null } ] }
  }
}
```

**DB 保存/配信 envelope**（`get_live_snapshot` が返す形）＝純関数出力に **`slug`（§4.3①）**・**`version`（§4.3②）**・**`updated_at`（DB write 時刻）** を足したもの:

```
{ "slug": "numazu-2607-x8f3q7k2", "version": 42, "updated_at": "2026-07-04T05:12:30Z", "payload": { …上の純関数出力… } }
```

- **回戦数を必ず含める（P1-1 反映）**: `roundsForClass` は `state.rounds` と `classes[].rounds` を読み、無ければ **4 回戦へフォールバック**する。3/5回戦・クラス別回戦数の大会で公開ビューが誤表示になるため、`state.rounds` と各 `classes[].rounds` を whitelist に入れる（受入 #16・非4回戦 fixture テスト）。
- `players[cls]` は **表示に必要なフィールドのみ**（`id`＝当日 tournament 内 id〔非PII〕/ `name` / 任意 `yomi` / `entry_no`）。
- **wire の `match` は `{p1,p2,winner}` のみ（P2-2 反映）**: `sanitizeMatch` の正準形は `{p1,p2,winner,lastModifiedBy}` だが、`lastModifiedBy`（更新した運営者の識別＝表示に不要・運営内部情報）は **wire に載せない**。viewer 側で `normalizeState`/`sanitizeMatch` が既定値を補完する（表示に影響なし）。
- **`updated_at` は純関数から外す（P1-2 反映）**: 時刻を純関数が作ると pure でなくなり、参加者の「最終更新」表示も DB row とズレる。**`updated_at` は publish RPC の DB write 時刻**（envelope）を正とし、viewer の鮮度表示はこれを使う（§5.2）。
- viewer は `envelope.payload.state` を `normalizeState` に通してから `withSourceState` へ渡す（欠落フィールド補完＝FRP-IMPL-004A）。順位/星取/相手名は既存関数が再計算。
- **`slug`/`version`/`updated_at` は純関数の責務ではない（P2/P1-2 反映）**。`slug`=配信セッション発行（§4.3①）、`version`=publish RPC の atomic 採番（§4.3②）、`updated_at`=DB write 時刻。`buildPublicLiveSnapshot` は保存スキーマを触らない純関数ゆえ、この分離が必須。

### 3.2 公開範囲（プライバシー）

- 出すのは **会場で既に公開の情報のみ**: 表示名・参加者番号・勝敗・対戦関係（`match` の `p1/p2/winner`）。順位・卓番号は viewer で派生。
- **プレイヤーのフィールド単位ホワイトリスト**（`state` を機械的に写経しない＝列追加で漏れる事故を防ぐ）: 出すのは `id`（当日 tournament 内 id・**非PII**。`member_id` ではない）/ `name` / 任意 `yomi` / `entry_no` のみ。**絶対に混ぜない**: `member`（支部マスタ linkage）/ email / `grade` / 会費区分 / 内部メモ / `lastModifiedBy`。
- **プライバシー invariant は「wire payload に載せない」で定義する（P2-1 反映）**: 既存 `normalizeState` は viewer 上で player に `member`/`grade` を、`match` に `lastModifiedBy` を**既定値で補完する**（＝往復不変ではない）。ただし補完されるのは**空/既定のプレースホルダ**であり、**wire で剥いだ実値を復元しない・送信もされない**（viewer は read-only 表示）。よって invariant は「`buildPublicLiveSnapshot` が emit する wire payload に除外項目が含まれないこと」で固定する（§8-7・§8-10）。より確実にしたい場合は **live 専用 normalizer / post-normalize strip** を実装で用いる（受入で選択）。
- **氏名公開の扱い（未成年を含む・Phase 3 受入条件へ格上げ＝独立レビュー Should Fix #1・#532）**: slug（bearer secret）を知る者には**参加者のフルネーム＋よみ＋番号＋成績**が閲覧できるという残余は、列挙不可（§4.2）でも変わらない。本大会には会費区分「中学生以下」「女性」があり**未成年が参加する**ため、氏名公開を暗黙の既定にしない。Phase 3 で (a) **表示名の匿名度オプション `display_mode`**（例 `"full"`＝フルネーム／`"given+no"`＝姓＋番号）を実装し、**既定値と氏名公開の扱い（同意ベース運用を含む）は主催者（人間）が明示決定して記録に残す**。(b) **会場掲示・入口（QR 掲示物）に「氏名・成績をインターネット公開する」旨の告知を含める**（運用手順）。→ 受入 #17。

### 3.3 なぜこの形が差し替え耐性を持つか

- viewer は Phase 3（REST/RPC 取得）でも Phase 4（Broadcast payload）でも **同じ `state` 部分集合** を受け取り、`normalizeState` → `withSourceState` で既存 `buildScoreboardClassTableHtml` / `calcFinal` / `computeDisplayRanks` を駆動する。配信路が変わっても描画・順位資産は不変。SCOREBOARD-MY-VIEW-001 の個人ビュー（`getName` で相手名）も `players[cls]` の `name`/`id` を持つため**そのまま動く**。
- `version` 単調増加により「初回取得 → subscribe の隙間で更新を取り逃す」問題（§7①）を検知・再取得できる。

---

## 4. データ配信面（Supabase）

### 4.1 テーブル `public_live_snapshots`（1大会1行）

| 列 | 型 | 用途 |
|---|---|---|
| `slug` | text (PK) | 公開識別子。`start_live_session` が発行（§4.3①）。QR/URL に載る。大会ごとに無効化可能 |
| `club_id` | uuid | 既存 club スコープ。**発行時に確定**（publish では触らない・§4.3） |
| `version` | int | 発行時 0・publish で +1（`publish_live_snapshot` が atomic 採番・§4.3②） |
| `payload` | jsonb | §3.1 の**純関数出力**（`state` 部分集合。`state.rounds`/`classes[].rounds` を含む・`slug`/`version`/`updated_at` は含まない） |
| `is_public` | bool | 配信 ON/OFF（停止で false） |
| `updated_at` | timestamptz | publish RPC の **DB write 時刻**。参加者の「最終更新」表示の正（P1-2） |

### 4.2 アクセス制御（read は「slug を知る者だけ」・**列挙不可**）

> **Must Fix #1 反映（設計レビュー #533 / conditional-go）**: 当初案の「anon は `is_public=true` の行を read」だと、**slug が推測困難でも anon が公開中 snapshot を全件 SELECT で列挙できる**（他大会・他 club の公開分まで一覧できてしまう）。これを塞ぐ。

- **anon にテーブル直 SELECT を与えない**。読み取りは **`SECURITY DEFINER` の RPC `get_live_snapshot(slug text)`** 経由に限定する。この関数は **`slug` 完全一致かつ `is_public=true` の1行の payload だけ**を返す（一覧・全文 SELECT 不可＝**列挙不可**）。anon には関数 EXECUTE のみ付与し、`public_live_snapshots` テーブルには GRANT/RLS SELECT を与えない。
- **RPC 実装ガード（P1-a・受入条件化＝§8-11）**: `SECURITY DEFINER` の常道の落とし穴を塞ぐ。① `SET search_path = pg_catalog, public`（または空）で**固定**、② テーブル参照は `public.public_live_snapshots` と**完全修飾**、③ **dynamic SQL 禁止**（`slug` は引数バインドのみ・文字列連結しない）、④ `REVOKE EXECUTE ON FUNCTION get_live_snapshot(text) FROM PUBLIC;` → `GRANT EXECUTE ... TO anon;`（PUBLIC への暗黙付与を外す）。⑤ 返すのは `payload`（と `version`）だけで、他 club/他 slug へ波及する引数を取らない。
- `slug` は **高エントロピー（推測困難）＝実質 bearer secret**。大会ごとに発行し、終了で無効化（`is_public=false`）。QR/URL に載るのはこの slug。ローテーション（再発行で旧 slug 失効）も可能。
- **slug ライフサイクルの runbook 化（独立レビュー Should Fix #2・#532）**: QR は撮影で会場外へも拡散し得るため、「発行→無効化」を運用に固定する。**① session 単位（大会ごと）の発行（`start_live_session`）／② 大会終了時の確実な無効化（`stop_live_session`＝`is_public=false`。終了操作のチェックリストに含める）／③ 漏えい・誤配布時のローテーション（再発行で旧 slug 失効）**を運用 runbook（`docs/`）に手順化し、Phase 3 受入（#18）へ紐づける。
- **write** は運営者（authenticated・当該 `club_id`）だけ（RLS で club スコープ）。
- **Realtime 送信権限（P2-a 反映）**: subscribe するチャネル名は **slug**（know-the-slug で購読可）だが、**slug を知る anon viewer が同じチャネルへ送信できてはならない**。よって **Realtime Authorization（private channel）を前提**とし、**送信は運営者（authenticated）または DB trigger/RPC 起点に限定**、anon は **subscribe のみ**（send 権限なし）。最小構成は **DB trigger/publish RPC 起点の broadcast に限定**し、クライアント `channel.send` を使う場合も送信元を authenticated 運営に絞る。
- **代替（ポーリング専用なら）**: Supabase Storage に `snapshots/<slug>.json` を put（**バケットの list を無効化**・オブジェクトのみ public-read）。key=slug が bearer secret になり**列挙不可**。RPC を立てずに済むが Realtime は別途。
- `publishableKey`（anon/publishable key）のフロント露出は、anon 権限が **関数 EXECUTE（or storage object read）＋ private channel の subscribe のみ**に限定されるため許容（テーブル全走査も列挙も送信もできない）。この key の**公開ページへの配布方法は §5.2 で定義**（P1-c）。

### 4.3 配信セッション発行 & publish RPC — `club_id` の由来と `version` atomic 採番（P1 反映）

> **P1 反映（3巡目レビュー）**: publish の引数が `slug`/`payload` だけでは**新規 insert 時に `club_id` を決められない**。よって **slug 行の発行（`club_id` 確定）と publish（既存行 update）を分離**し、**publish は INSERT しない**（club_id を publish 時に発明しない）。

**① `start_live_session()`（`SECURITY DEFINER`・authenticated 運営のみ）**: 呼び出し元（`auth.uid()`）の membership から `club_id` を確定（active な club が一意＝沼津は単一。複数で曖昧なら error＝既存 `pickActiveClubId` と同方針）。**高エントロピー slug を採番**し、行を INSERT（`version=0` / `is_public=true` / `club_id`）して **slug を返す**。これが「📡 ライブ配信を開始」（§5.1）の実体。`stop_live_session(slug)` は所有検査のうえ `is_public=false`（無効化・ローテーション）。

**② `publish_live_snapshot(slug text, payload jsonb)`（`SECURITY DEFINER`・authenticated）**: **既存行の UPDATE のみ**（INSERT / ON CONFLICT なし）。`WHERE slug = $1 AND club_id ∈ (呼び出し元の membership)` で**行の所有を検査**し、`SET payload = $2, version = version + 1, updated_at = now()` で **atomic increment**、新 `version` を返す。行が無い/所有外なら error（**`club_id` を publish 時に発明しない**）。

- 実行権限: `REVOKE EXECUTE ... FROM PUBLIC` → `start_live_session` / `publish_live_snapshot` / `stop_live_session` はいずれも `GRANT EXECUTE TO authenticated`（anon には付与しない）。read の `get_live_snapshot` のみ `anon`。
- read RPC と同じ実装ガード（`SET search_path` 固定・`public.public_live_snapshots` 完全修飾・dynamic SQL 禁止）。
- 発行=`club_id` 確定 / publish=update-only により、`club_id` の由来が一意に定まり、`version` の単調性はリロード・複数タブ・再送に対して**サーバ側で保証**される（§7-1 の取りこぼし検知が成立）。

---

## 5. 実装スライス境界

### 5.1 運営側（送信グルー・`shogi_v4.html`）

- **`buildPublicLiveSnapshot(state)`**: 追加・純関数（§3.1）。テスト対象。
- **配信トグル `📡 ライブ配信`**: 明示オプトイン。ON にした時だけ `loadCloudDeps()` で supabase-js を遅延ロードし、**`start_live_session()` で slug を発行**（QR 生成・§4.3①）。OFF で `stop_live_session(slug)`（無効化）。**OFF 時の保存経路は現状と完全不変**（拘束ルール1/7・ローカルファースト不変）。
- **「📡 配信中」状態表示（J1 の担保）**: 配信 ON の間、ヘッダに配信中バッジと最終送信時刻・成否を常時表示（`setStatus` N4）。**運営者が「配信が切れている/OFFのまま」に気づける**こと自体が参加者体験の前提。停止操作もここから。
- **publish 発火点の throttle**: 「一手ごと」ではなく **確定状態**（手合せ確定・結果入力・ラウンド確定・保存）後にまとめて **publish RPC `publish_live_snapshot`（§4.3・version は DB 採番）** を呼ぶ。連打・編集中の中間状態は送らない（メッセージ数と課金の抑制）。
- 全て **fail-soft**: 送信失敗は status 表示のみ（既存クラウド送信と同じ・`setStatus` N4・STYLE-GUIDE §3）。運営アプリは無影響。

### 5.2 参加者側（公開ビュー・既存レンダラ再利用）

- **新規 `live.html` は作らない**。既存 `#scoreboard` 経路にパラメータを1つ足す（例 `?live=<slug>#scoreboard`）。`isScoreboardRoute()` 系の隣に **live 判定** を追加。
- live ルート時は、`renderScoreboard` のデータ源を **公開スナップショットの `state` 部分集合**にする（`withSourceState(normalizeState(snapshot.state), ...)` で `buildScoreboardClassTableHtml` / `calcFinal` / `computeDisplayRanks` を駆動）。→ 順位/星取ロジックの複製ゼロ（拘束ルール2・親機能の「ロジック複製しない」方針）。
- **read-only 徹底**: 運営画面への導線・操作UIを一切出さない（親機能 Codex Must Fix 1 の不変条件）。
- 取得: 初回 **RPC `get_live_snapshot(slug)`** 取得（§4.2・列挙不可）→ 5秒ポーリング（Phase 3）→ Broadcast 受信で即再取得/反映（Phase 4）。**「最終更新」時刻は envelope の `updated_at`（DB write 時刻・P1-2）を表示**（既存 `sbFormatUpdateTime` 流用）。
- **公開 config の配布（P1-c 反映）**: viewer は Supabase の `url` ＋ `publishableKey`（anon/publishable key）を知る必要があるが、既存運用は**gitignore 済みの `app/config.js`**（`shogi_v4.html` L9605 が click 時に読む＝運営/authenticated 用）で、**GitHub Pages には配信されない**。よって QR で開く公開ページ用に **read-only の公開 config を別途コミットして Pages で配信する**（例 `app/config.public.js` に `{ url, publishableKey }` のみ）。この key の権限は §4.2 で **RPC `get_live_snapshot` の EXECUTE ＋ private channel の subscribe のみ**に限定されるため、テーブル走査・列挙・送信はできず**露出は許容**（Supabase の publishable key は公開前提の設計）。運営用 `app/config.js`（gitignore・authenticated 経路）とは**別ファイルに分離**する。live ルート判定時のみ公開 config を読み、`buildScoreboardClassTableHtml` 等の描画へ進む（J3/J4 が落ちないための必須要件）。

### 5.3 受付タブレット（キオスク）— スマホを持たない参加者への担保

スマホを持たない参加者のため、**受付に共有タブレットを1台常設**し、そこでも戦況・自分の状況を確認できるようにする。技術的には**参加者ビューと同一**（`?live=<slug>#scoreboard` を開くだけ）で、追加の配信基盤は不要。ただし「複数人が入れ替わり触る共有画面」ゆえのキオスク固有の配慮を足す:

- **既定は全体星取表**。誰かが検索/行タップで個人ビューに入っても、**無操作が一定時間（既定60秒・受付運用に合わせ調整可）続いたら自動で星取表へ戻す**（次の人が前の人のビューのまま詰まらない）。選択は memory-only（MY-VIEW-001 と整合）なので、リロード/タイムアウトで自然に戻る。
- **画面を消さない（P2-b 反映・過信しない）**: 対応端末は Screen Wake Lock API で常時点灯。ただし **定期再描画は画面ロックを防げない**ため、非対応環境やロック防止を確実にしたい場合は **端末側で自動ロックを無効化し、iOS ガイドアクセス / Android 画面固定で運用する**ことを**運用条件**とする（保証文言は「対応端末で点灯維持・非対応時は端末設定で担保」に留める）。
- **タップ目標を大きく**: セレクタ・行を指で選びやすく（STYLE-GUIDE §2.2 の 44px 目標を優先適用）。
- **迷子防止**: read-only 徹底（運営UI・アドレスバー誘導なし）。可能ならブラウザのフルスクリーン/ガイドアクセスで固定（運用手順として `docs/` に記載）。
- **回線**: 受付タブレットは会場 Wi-Fi かセルラーで公開ビューへ接続（運営端末の localStorage には依存しない＝別端末でも同じ公開スナップショットを見る）。
- **受入**: キオスク特有の受入条件は §8-8/§8-9。

### 5.4 触らないもの

- 保存スキーマ・`sanitizeMatch`・`normalizeState`（新規保存フィールドを足さない・REFERENCE §3）。
- 既存クラウド送信（名簿 upsert）経路。配信は別テーブル・別関数で独立。
- 既存 `app/config.js`（gitignore・運営 authenticated 用）は変えない。公開ページ用 read-only config は**別ファイル追加**（§5.2 P1-c）。
- `index.html` / `.github` / `package*`（拘束ルール8）。CSS 挙動（ルール3）。

---

## 6. 段階ロードマップ

**「実用」の定義を体験基準にする**: 準リアルタイムに更新されることではなく、**参加者が入口にたどり着き（J2）・自分の状況を一目で把握でき（J5）・スマホが無くても受付端末で見られる（J2/J5）**まで到達して初めて「実用フェーズ」と呼ぶ。よって QR・自分ビュー・キオスクは polish ではなく**実用フェーズの構成要素**。

| Phase | 内容 | 到達点（体験基準） | 既存への影響 |
|---|---|---|---|
| **1** | `buildPublicLiveSnapshot(state)` 純関数＋単体テスト | 公開形の確定（配信路に依存しない） | 読むだけ・ゼロ改変 |
| **2** | `#scoreboard` に live ルート＋ローカル fixture 描画＋**検索/行タップ個人ビュー(MY-VIEW-001)同梱** | fixture で **星取表＋個人ビュー（相手名）**まで確認できる（J4/J5） | 追加経路のみ |
| **3（実用）** | Supabase upsert（運営「配信更新」＋**📡配信中表示**）＋参加者ポーリング＋**QR/短縮コード掲示物**＋**受付タブレット(キオスク)対応** | **誰でも入口に到達し（J2）自分を把握でき（J5）、スマホ非所持でも受付端末で見られる** | 保存末尾に throttle 付き upsert（トグル ON 時のみ）＋掲示/キオスク運用手順 |
| **4** | Realtime Broadcast 追加（受信→再取得／切断時ポーリング継続） | ~1秒即時 | 受信ハンドラ追加 |
| **5** | 通信状態インジケータ・差分送信・公開範囲監査・会場負荷テスト | 運用 polish | UI/運用 追加 |

- **各 Phase = 独立スライス**。**Phase 3 まで到達して初めて現場投入可能**（J1〜J7 が一通り繋がる）。Realtime(Phase 4) は体験を速くする上乗せ。
- リファクタと挙動変更を混ぜない（ルール7）。
- MY-VIEW-001 は本配信と**UX 上不可分**のため、別スライスだが Phase 2〜3 と**同一リリースで束ねる**前提とする。
- **配信元は常に運営端末1台（SoT 決定=案②・§0.1）**。級分担入力（#538）を将来導入しても、配信は「合体済みスナップショット1つ」を維持する（2台ライブ合体は将来拡張・当面非実装）。

## 7. 落とし穴（レビュー2件の合流・実装時チェック）

1. **初回取得と subscribe の隙間**: `version` を持ち、subscribe 後に必ず最新を再取得。Broadcast だけを真実源にしない（`version` は publish RPC が DB 側で atomic 採番＝§4.3・ローカル非依存）。
2. **iOS バックグラウンド**: timer/WebSocket が止まる → 画面復帰（focus/visibilitychange）で再取得（親機能の focus 保険と同型）。
3. **会場 Wi-Fi**: 一斉接続で WS 切断多発 → 常に **ポーリング fallback**。「最終更新」表示で鮮度を可視化。
4. **CDN/ブラウザキャッシュ**: `Cache-Control: no-store` 相当 or `?v=version` を付す。
5. **Supabase Free の自動 pause**: 7日無アクセスでプロジェクト停止 → 大会前日に確認 or keepalive ping（GitHub Actions 等）。
6. **課金トリガ**: 超過は 1M msg ごと $2.50 / 1000 peak 接続ごと $10。月1大会・数十接続なら実質ゼロだが、他イベント流用時に備えダッシュボードにアラート。
7. **payload 256KB 上限**: 全星取表が肥大化したら差分送信を検討（数十人規模は当面問題なし）。
8. **slug 推測・列挙**: read は RPC `get_live_snapshot(slug)` に限定しテーブル直 SELECT を anon に与えない（§4.2＝**列挙不可**）。slug は高エントロピー・大会ごとに無効化（`is_public=false`）・ローテーション可（ライフサイクルは runbook へ＝§4.2・受入 #18）。

## 8. 受入条件（実用フェーズ＝Phase 3 時点・体験基準 J1〜J7 に対応）

1. 配信 OFF（既定）では、保存・運営動作が現状と**完全一致**（外部通信ゼロ）。
2. 運営者が「📡 ライブ配信」を ON にすると `start_live_session()` が slug 行を発行（§4.3①）、以後の確定状態ごとに `publish_live_snapshot` が当該行を update し、**ヘッダに「📡 配信中」と最終送信時刻/成否が出る**（J1）。OFF で `stop_live_session`（無効化）。
3. **入口（J2）**: 会場に掲示する **QR/短縮URL から**、参加者が `?live=<slug>#scoreboard` に到達できる（手打ち不要）。
4. 参加者ページを開くと順位・星取・現在の手合せが表示され、5秒周期で更新される。「最終更新」時刻を表示（J4/J6）。
5. **星取表＋個人ビュー（J5）**: 既定は**相手が見える星取表**（升目=○/×＋相手番号・氏名列 sticky）。クラス絞り込み＋番号/名前検索で対局者を引け、**行タップで個人ビュー**が開き、現在順位・勝敗・**次の対戦（卓・相手名）**・**これまでの対戦（相手名）**が出る（MY-VIEW-001 同梱）。
6. 参加者ビューに運営UI・戻り導線が**一切出ない**（read-only 不変）。anon は **RPC `get_live_snapshot(slug)` で slug 一致の1行のみ取得でき、公開 snapshot を列挙できない**・write 不可（§4.2 Must Fix #1）。
7. **wire payload** に `member`/email/`grade`/会費区分/内部メモ/`lastModifiedBy` が**含まれない**（`players[cls]` は `id`/`name`/`yomi`/`entry_no` のみ・`match` は `{p1,p2,winner}`）。invariant は **`buildPublicLiveSnapshot` の出力（wire）** に対して定義する。viewer 上の `normalizeState` は空の既定値を補完しうるが**実値は復元せず送信もされない**（P2-1・§3.2）。
8. **キオスク（J2/J5・スマホ非所持者）**: 受付タブレットで同じ `?live` を開いて星取表を閲覧・検索/行タップで個人ビューを開け、**無操作60秒で星取表へ自動リセット**、画面が消えない（対応端末は Wake Lock、非対応時は端末の自動ロック無効/ガイドアクセスを運用条件＝P2-b）。
9. 配信失敗・オフライン・pause・キオスク回線断でも運営アプリは動作継続（fail-soft・status 表示のみ）。
10. `bash test/run_tests.sh shogi_v4.html` が **WARN=0**。純関数テスト: `buildPublicLiveSnapshot`（**出力が `state` 形＝`normalizeState`→`buildScoreboardClassTableHtml` で描ける**／`players` が `id`/`name`/`yomi`/`entry_no` のみ＝除外項目を含まない／`match` は `{p1,p2,winner}`＝`lastModifiedBy` を含まない／`slug`/`version`/`updated_at` を出力に含めない／**`state.rounds` と `classes[].rounds` を含む**／空・最終結果分岐）＋キオスク無操作リセット。
11. **RPC 実装ガード（P1-a）**: `get_live_snapshot` / `publish_live_snapshot` とも `SET search_path` 固定・`public.` 完全修飾・dynamic SQL 禁止・`REVOKE EXECUTE FROM PUBLIC`（read は `GRANT TO anon` / publish は `GRANT TO authenticated`）をマイグレーション/ポリシーテストで確認。anon のテーブル直 SELECT が拒否され、`get_live_snapshot` は slug 一致1行のみ返す（列挙不可）。
12. **version 単調性（P1-b）**: publish は RPC `publish_live_snapshot` の atomic increment で採番され、リロード・複数タブ・再送でも version が単調（クライアントは version を持たない）。
13. **公開 config 配布（P1-c）**: GitHub Pages に read-only 公開 config（`url`＋publishable key）が配信され、live ルートで読めて描画へ到達する（J3/J4）。key 権限は RPC EXECUTE ＋ private channel subscribe のみ（テーブル/列挙/送信不可）。運営用 `app/config.js`（gitignore）と分離。
14. **Broadcast 送信権限（P2-a）**: slug を知る anon viewer は subscribe のみ可・**同チャネルへ送信できない**（private/authorized・送信は運営 authenticated か DB trigger/RPC 起点）。
15. **`club_id` の由来・publish は update-only（P1・3巡目）**: `club_id` は `start_live_session()` が呼び出し元 membership から確定し発行時に行へ書く。`publish_live_snapshot` は **INSERT せず既存行 UPDATE のみ**（`slug` 一致 かつ 所有 `club_id` 検査）で publish 時に `club_id` を発明しない。純関数 `buildPublicLiveSnapshot` の出力に `slug`/`version`/`updated_at` を含めない（envelope の責務・P2/P1-2）。
16. **回戦数の正当性（P1-1・4巡目）**: 公開ビューが `state.rounds` / `classes[].rounds` を反映し、**非4回戦（例 3/5回戦）・クラス別回戦数の大会でも `roundsForClass` が正しい回戦数を返す**（4 回戦フォールバックで誤表示しない）。**非4回戦 fixture** で星取表の列数・終了判定（`results.length >= rounds`）が一致することをテスト。
17. **氏名公開の扱い（未成年含む・独立レビュー Should Fix #1）**: `display_mode` オプション（§3.2・例 `"full"`／`"given+no"`）が実装され、**既定値と氏名公開の扱い（同意/告知運用を含む）を主催者（人間）が明示決定した記録**が Issue/運用手順に残る。会場掲示・入口（QR 掲示物）に「氏名・成績をインターネット公開する」旨の告知が含まれる。
18. **slug ライフサイクル（独立レビュー Should Fix #2）**: 発行（`start_live_session`）→**大会終了時の確実な無効化**（`stop_live_session`・`is_public=false`・終了チェックリスト組込）→必要時ローテーションの運用 runbook が `docs/` に存在し、**無効化後に旧 slug で `get_live_snapshot` が取得不可**であることを確認。

## 9. 工程・ロールアウト

- 本書 = 設計（docs-only / L1–L2）。GitHub へ定型ヘッダ＋凍結マーカー（`verdict:`）を書き戻して1工程完了（`docs/ai-ops/AI-DEV-PIPELINE.md`）。
- レビュー: 別セッション・別素性（L4 code-review は Codex）。UI/クラウド/セキュリティ（RLS・公開範囲）を観点に含める。
- 実装（LIVE-BROADCAST-IMPL Phase1..）: **追加/最小改変中心**・Phase ごと Draft PR で停止（Ready化/merge/production は人間の明示承認まで未実施）。secret/実データ不使用（テスト fixture は架空のみ）。
- production 反映時: `index.html` + `shogi_v4.html` を公開し **`?v=N` インクリメント**（拘束ルール9）。Supabase 側（テーブル/RLS/RPC）はマイグレーションを別途記録。

---

正本ポインタ: 親機能 = `LIVE-MOBILE-SCOREBOARD-001`（`shogi_v4.html`）／クラウド既存実装 = CLOUD SYNC B-2b（#343・`loadCloudDeps`/`syncTournamentToCloud`）／Phase2 設計 = `docs/specs/20260620_data_persistence_phase2_stagea_design.md`／データモデル不変条件 = `docs/REFERENCE.md` §3／UI 規約 = `docs/STYLE-GUIDE.md`／関連 = `docs/specs/20260704_scoreboard_my_view_001_design.md`。
