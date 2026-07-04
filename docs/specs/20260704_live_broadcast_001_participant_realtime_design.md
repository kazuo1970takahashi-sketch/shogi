# LIVE-BROADCAST-001 — 参加者向けリアルタイム戦況配信 設計

| 項目 | 内容 |
|---|---|
| ID | LIVE-BROADCAST-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-07-04 |
| ステータス | Draft（第三者AIレビュー2件を反映済み・実装は後続 LIVE-BROADCAST-IMPL 群） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（HEAD は branch ref を正とする） |
| 対象ファイル（実装は別PR） | `shogi_v4.html`（配信送信グルー・公開ビュー経路）。参加者ビューは既存 `#scoreboard` レンダラを再利用（新規 `live.html` は作らない＝§5.2） |
| 親機能 | LIVE-MOBILE-SCOREBOARD-001（`#scoreboard` 閲覧ビュー・`withSourceState` データ源差し替え）／CLOUD SYNC B-2b（#343・supabase-js v2 遅延ロード・fail-soft）／DATA-PERSISTENCE-PHASE2 Stage A |
| 準拠 | CLAUDE.md 拘束9ルール・REFERENCE §3 データモデル不変条件・STYLE-GUIDE §1/§2/§3/§4 |
| 関連スライス | SCOREBOARD-MY-VIEW-001（対局者を探す＋個人ビュー層・本配信の公開ビュー上にそのまま載る） |

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

現 `state` から **公開してよい情報だけ** を取り出す純関数。**保存スキーマは触らない**（`state` を読むだけ・REFERENCE §3）。既存 `buildCloudSyncPayload`（#343）とは別物（あちらは名簿正本の upsert 用）。

出力 JSON（案）:

```
{
  "schema_version": 1,
  "slug": "numazu-2607",            // 大会ごとの公開識別子（推測困難なランダム付与）
  "version": 42,                    // 単調増加。取りこぼし検知・キャッシュ回避に使う
  "updated_at": "2026-07-04T05:12:30Z",
  "title": "沼津支部月例将棋大会",
  "status": "in_progress|final",
  "classes": [
    {
      "id": "A", "name": "A級", "rounds": 4, "done": false,
      "standings": [ { "rank": 1, "no": 12, "name": "山田太郎", "yomi": "やまだたろう",
                       "wins": 3, "losses": 1, "b": 7, "c": 5,
                       "marks": ["○#5","×#3","○#8","－"] } ],
      "current_pairings": [ { "table": 1, "p1_no": 12, "p2_no": 5, "decided": false } ]
    }
  ]
}
```

### 3.2 公開範囲（プライバシー）

- 出すのは **会場で既に公開の情報のみ**: 表示名・参加者番号・順位・勝敗・卓番号・対戦相手番号。
- **絶対に混ぜない**: `member_id` / email / 内部メモ / 支部マスタ由来の非公開項目。純関数側でホワイトリスト列挙し、`state` から機械的に写経しない（列追加で漏れる事故を防ぐ）。
- フルネームを避けたい運用のために、将来 `display_mode: "given+no"`（姓＋番号）等のオプションを持てる余地を残す（本スライスでは表示名そのまま）。

### 3.3 なぜこの形が差し替え耐性を持つか

- viewer は Phase 3（REST 取得）でも Phase 4（Broadcast payload）でも **同じ JSON** を受け取り、`withSourceState` 相当で `state` に流し込み、既存 `buildScoreboardClassTableHtml` で描く。配信路が変わっても描画資産は不変。
- `version` 単調増加により「初回取得 → subscribe の隙間で更新を取り逃す」問題（§7①）を検知・再取得できる。

---

## 4. データ配信面（Supabase）

### 4.1 テーブル `public_live_snapshots`（1大会1行）

| 列 | 型 | 用途 |
|---|---|---|
| `slug` | text (PK) | 公開識別子。QR/URL に載る。大会ごとに無効化可能 |
| `club_id` | uuid | 既存 club スコープ（RLS 用） |
| `version` | int | 単調増加 |
| `payload` | jsonb | §3.1 の公開スナップショット |
| `is_public` | bool | 配信 ON/OFF（停止で false） |
| `updated_at` | timestamptz | 最終更新 |

### 4.2 RLS（read-only 公開）

- **write は運営者（authenticated・当該 club）だけ**。参加者/anon は `is_public=true` の行を **read のみ**。
- 参加者はログイン不要（anon read）。`publishableKey` のフロント露出は **read-only 用途に限定**されるため許容（既存クラウド設計と同方針）。
- Broadcast は **public チャネルで直接 publish させない**。運営者の authenticated write（upsert）を起点に発火させる（DB trigger→Realtime、または write 直後にクライアントから同一 payload を `channel.send`）。参加者は subscribe のみ。

---

## 5. 実装スライス境界

### 5.1 運営側（送信グルー・`shogi_v4.html`）

- **`buildPublicLiveSnapshot(state)`**: 追加・純関数（§3.1）。テスト対象。
- **配信トグル `📡 ライブ配信`**: 明示オプトイン。ON にした時だけ `loadCloudDeps()` で supabase-js を遅延ロード（既存パターン流用）。**OFF 時の保存経路は現状と完全不変**（拘束ルール1/7・ローカルファースト不変）。
- **「📡 配信中」状態表示（J1 の担保）**: 配信 ON の間、ヘッダに配信中バッジと最終送信時刻・成否を常時表示（`setStatus` N4）。**運営者が「配信が切れている/OFFのまま」に気づける**こと自体が参加者体験の前提。停止操作もここから。
- **publish 発火点の throttle**: 「一手ごと」ではなく **確定状態**（手合せ確定・結果入力・ラウンド確定・保存）後にまとめて upsert。連打・編集中の中間状態は送らない（メッセージ数と課金の抑制）。
- 全て **fail-soft**: 送信失敗は status 表示のみ（既存クラウド送信と同じ・`setStatus` N4・STYLE-GUIDE §3）。運営アプリは無影響。

### 5.2 参加者側（公開ビュー・既存レンダラ再利用）

- **新規 `live.html` は作らない**。既存 `#scoreboard` 経路にパラメータを1つ足す（例 `?live=<slug>#scoreboard`）。`isScoreboardRoute()` 系の隣に **live 判定** を追加。
- live ルート時は、`renderScoreboard` のデータ源を **公開スナップショット**にする（`withSourceState(snapshot,...)` で `buildScoreboardClassTableHtml` を駆動）。→ 順位/星取ロジックの複製ゼロ（拘束ルール2・親機能の「ロジック複製しない」方針）。
- **read-only 徹底**: 運営画面への導線・操作UIを一切出さない（親機能 Codex Must Fix 1 の不変条件）。
- 取得: 初回 REST 取得 → 5秒ポーリング（Phase 3）→ Broadcast 受信で即再取得/反映（Phase 4）。「最終更新」時刻を常時表示（既存 `sbFormatUpdateTime` 流用）。

### 5.3 受付タブレット（キオスク）— スマホを持たない参加者への担保

スマホを持たない参加者のため、**受付に共有タブレットを1台常設**し、そこでも戦況・自分の状況を確認できるようにする。技術的には**参加者ビューと同一**（`?live=<slug>#scoreboard` を開くだけ）で、追加の配信基盤は不要。ただし「複数人が入れ替わり触る共有画面」ゆえのキオスク固有の配慮を足す:

- **既定は全体星取表**。誰かが検索/行タップで個人ビューに入っても、**無操作が一定時間（既定60秒・受付運用に合わせ調整可）続いたら自動で星取表へ戻す**（次の人が前の人のビューのまま詰まらない）。選択は memory-only（MY-VIEW-001 と整合）なので、リロード/タイムアウトで自然に戻る。
- **画面を消さない**: 常時点灯（Screen Wake Lock API・非対応環境は定期再描画で代替）。
- **タップ目標を大きく**: セレクタ・行を指で選びやすく（STYLE-GUIDE §2.2 の 44px 目標を優先適用）。
- **迷子防止**: read-only 徹底（運営UI・アドレスバー誘導なし）。可能ならブラウザのフルスクリーン/ガイドアクセスで固定（運用手順として `docs/` に記載）。
- **回線**: 受付タブレットは会場 Wi-Fi かセルラーで公開ビューへ接続（運営端末の localStorage には依存しない＝別端末でも同じ公開スナップショットを見る）。
- **受入**: キオスク特有の受入条件は §8-8/§8-9。

### 5.4 触らないもの

- 保存スキーマ・`sanitizeMatch`・`normalizeState`（新規保存フィールドを足さない・REFERENCE §3）。
- 既存クラウド送信（名簿 upsert）経路。配信は別テーブル・別関数で独立。
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

## 7. 落とし穴（レビュー2件の合流・実装時チェック）

1. **初回取得と subscribe の隙間**: `version` を持ち、subscribe 後に必ず最新を再取得。Broadcast だけを真実源にしない。
2. **iOS バックグラウンド**: timer/WebSocket が止まる → 画面復帰（focus/visibilitychange）で再取得（親機能の focus 保険と同型）。
3. **会場 Wi-Fi**: 一斉接続で WS 切断多発 → 常に **ポーリング fallback**。「最終更新」表示で鮮度を可視化。
4. **CDN/ブラウザキャッシュ**: `Cache-Control: no-store` 相当 or `?v=version` を付す。
5. **Supabase Free の自動 pause**: 7日無アクセスでプロジェクト停止 → 大会前日に確認 or keepalive ping（GitHub Actions 等）。
6. **課金トリガ**: 超過は 1M msg ごと $2.50 / 1000 peak 接続ごと $10。月1大会・数十接続なら実質ゼロだが、他イベント流用時に備えダッシュボードにアラート。
7. **payload 256KB 上限**: 全星取表が肥大化したら差分送信を検討（数十人規模は当面問題なし）。
8. **slug 推測**: 完全秘密でなくても十分ランダムにし、大会ごとに無効化（`is_public=false`）。

## 8. 受入条件（実用フェーズ＝Phase 3 時点・体験基準 J1〜J7 に対応）

1. 配信 OFF（既定）では、保存・運営動作が現状と**完全一致**（外部通信ゼロ）。
2. 運営者が「📡 ライブ配信」を ON にし更新すると、`public_live_snapshots` の当該 slug 行が upsert され、**ヘッダに「📡 配信中」と最終送信時刻/成否が出る**（J1）。
3. **入口（J2）**: 会場に掲示する **QR/短縮URL から**、参加者が `?live=<slug>#scoreboard` に到達できる（手打ち不要）。
4. 参加者ページを開くと順位・星取・現在の手合せが表示され、5秒周期で更新される。「最終更新」時刻を表示（J4/J6）。
5. **星取表＋個人ビュー（J5）**: 既定は**相手が見える星取表**（升目=○/×＋相手番号・氏名列 sticky）。クラス絞り込み＋番号/名前検索で対局者を引け、**行タップで個人ビュー**が開き、現在順位・勝敗・**次の対戦（卓・相手名）**・**これまでの対戦（相手名）**が出る（MY-VIEW-001 同梱）。
6. 参加者ビューに運営UI・戻り導線が**一切出ない**（read-only 不変）。anon は read のみ（write 不可＝RLS）。
7. 公開 JSON に `member_id`/email/内部メモが**含まれない**（純関数のホワイトリスト検証）。
8. **キオスク（J2/J5・スマホ非所持者）**: 受付タブレットで同じ `?live` を開いて星取表を閲覧・検索/行タップで個人ビューを開け、**無操作60秒で星取表へ自動リセット**、画面が消えない（Wake Lock か定期再描画）。
9. 配信失敗・オフライン・pause・キオスク回線断でも運営アプリは動作継続（fail-soft・status 表示のみ）。
10. `bash test/run_tests.sh shogi_v4.html` が **WARN=0**。`buildPublicLiveSnapshot` の純関数テスト（公開範囲・version 単調増加・空/最終結果分岐）＋キオスク無操作リセットの単体テストを追加。

## 9. 工程・ロールアウト

- 本書 = 設計（docs-only / L1–L2）。GitHub へ定型ヘッダ＋凍結マーカー（`verdict:`）を書き戻して1工程完了（`docs/ai-ops/AI-DEV-PIPELINE.md`）。
- レビュー: 別セッション・別素性（L4 code-review は Codex）。UI/クラウド/セキュリティ（RLS・公開範囲）を観点に含める。
- 実装（LIVE-BROADCAST-IMPL Phase1..）: **追加/最小改変中心**・Phase ごと Draft PR で停止（Ready化/merge/production は人間の明示承認まで未実施）。secret/実データ不使用（テスト fixture は架空のみ）。
- production 反映時: `index.html` + `shogi_v4.html` を公開し **`?v=N` インクリメント**（拘束ルール9）。Supabase 側（テーブル/RLS）はマイグレーションを別途記録。

---

正本ポインタ: 親機能 = `LIVE-MOBILE-SCOREBOARD-001`（`shogi_v4.html`）／クラウド既存実装 = CLOUD SYNC B-2b（#343・`loadCloudDeps`/`syncTournamentToCloud`）／Phase2 設計 = `docs/specs/20260620_data_persistence_phase2_stagea_design.md`／データモデル不変条件 = `docs/REFERENCE.md` §3／UI 規約 = `docs/STYLE-GUIDE.md`／関連 = `docs/specs/20260704_scoreboard_my_view_001_design.md`。
