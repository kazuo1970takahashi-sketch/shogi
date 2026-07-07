# MEMBER-ATTR-SNAPSHOT-001 設計 — 会員属性の大会スナップショット保存＋結果一覧表示

- 起票: #607（2026-07-05 実機テスト由来・改修候補③／大粒3件①）
- 種別: docs-only 設計（`shogi_v4.html` 無改変・本 PR は docs のみ）
- 関連: #343（クラウド同期 Stage B・entries スキーマ）／#544（一覧 UX）／#326 FEE-JOSEI／#500 CITY-UNIFY
- canonical_decision: PMO-OPS v2.1-final

## 0. 作者確定（本設計の前提）

1. **クラウド保持方式＝案 A（entries に列追加）**。`entries` に `member_kind` / `grade` / `city` の3列を追加し、送信時に**大会当時の値**でスナップショットする。既存 `sos`/`sodos` の「専用フラット列」パターンと一貫。
2. **結果表示＝3属性すべて**（支部員区分・会費区分・市町村）を結果一覧/報告書に出す。
3. ローカルは現状維持（後述のとおり既にスナップショット済み）。当日運営コアは無改変・fail-soft。

## 1. 背景 / 課題

支部員区分・会費区分・市町村は「会員の現在値」しか正本を持たないため、**区分変更・転居があると過去大会の集計根拠が後から変わって見える**。大会単位で当時の属性を固定し、結果一覧にも表示したい（#607）。

## 2. 現状調査（実コード・orphan HEAD 基準）

- **当日 state**: `state.players[cls][i]` は登録時にマスタから `member`（支部員区分 'member'/'other'）・`grade`（会費区分 'ippan'/'chu'/'josei'）・`city`（市町村・自由入力 maxlen20）をコピー保持する（`addPlayerFromMaster` / `finalizeAddPastParticipants` → `normalizeMasterFeeFields`）。**＝player レコード自体が登録時点スナップショット**。
- **ローカル履歴**: `saveCurrentTournamentToArchive`（`shogi_archive`）は `snapshot: archiveDeepClone(state)` で state 丸ごと保存。**＝ローカル履歴は3属性を大会時点で既にスナップショット済み**（本設計でローカル追加作業は不要）。
- **クラウド送信**: `buildCloudSyncPayload`（L9696〜）の `entries.push`（L9730）は `app_tournament_id, member_id, class, final_rank, wins, losses, draws, sos, sodos, participated` のみ。**member_kind/grade/city を持たない**。同じ関数の `membersOut` は `_cloudMemberFieldCols(mm2)` で**現在マスタ値**を members へ載せる（＝正本は現在値）。
- **クラウド読取/表示**: `fetchCloudEntriesForTournament`（L14242）の SELECT は `final_rank,class,wins,losses,sos,sodos,player_id`。属性は別途 `players → members(...)` から引くため、**過去大会でも members の現在値**が出る。
- **表示関数**: `formatParticipantLabel(player,{includeCategory})` は支部員区分のみ任意併記可（'沼津支部員'/'他'）。**会費区分・市町村は結果一覧/報告書に未表示**。

### 現状の要約（gap の切り分け）

| 面 | 大会当時の属性を辿れるか | 備考 |
|---|---|---|
| ローカル当日 state | ○ | player レコードが保持 |
| ローカル履歴/バックアップ | ○ | state 丸ごと保存済み |
| クラウド entries | ✕ | 成績のみ・属性列なし ← **本設計の対象1** |
| 結果一覧/報告書の表示 | △（区分のみ任意） | 会費/市町村は非表示 ← **本設計の対象2** |

## 3. スキーマ追補（Phase 1 先頭スライス・B-0 相当）

新規 migration `supabase/migrations/<ts>_member_attr_snapshot_entries.sql`（追加のみ・冪等）:

```sql
alter table public.entries
  add column if not exists member_kind text,   -- 大会当時の支部員区分 'member'|'other'（null=旧行/未取得）
  add column if not exists grade       text,   -- 大会当時の会費区分 'ippan'|'chu'|'josei'
  add column if not exists city        text;   -- 大会当時の市町村（自由入力・正規化済み）
comment on column public.entries.member_kind is '大会当時の支部員区分スナップショット（送信時の player レコード由来）';
comment on column public.entries.grade       is '大会当時の会費区分スナップショット';
comment on column public.entries.city        is '大会当時の市町村スナップショット';
```

- **nullable**（旧行は null＝未取得）。CHECK 制約は付けない（fail-soft・将来値の追加余地）。RLS は entries 既設ポリシーを継承（active organizer）。
- 後方互換: 既存行の backfill は**行わない**（過去の正確な当時値は復元不能ゆえ捏造しない）。読取側で null → members 現在値へフォールバック（§5）。

## 4. 送信側（Phase 1・`buildCloudSyncPayload` 最小改変）

`entries.push` に3フィールドを追加。**スナップショット源は当日 player レコード `p`（登録時点値）であり、現在マスタ `mm2` ではない**（当時値を固定する目的の核心）。

```
entries.push(stamp({
  app_tournament_id:appTid, member_id:mid, 'class':cls,
  final_rank:..., wins:row.A, losses:(row.played-row.A), draws:0,
  sos:row.B, sodos:row.C, participated:true,
  // MEMBER-ATTR-SNAPSHOT-001: 当時値を player レコードから固定（現在マスタは使わない）
  member_kind:snapMemberKind(p), grade:snapGrade(p), city:snapCity(p)
}));
```

- 正規化は**マスタ用と同一ロジックを流用**（`player.member`→member_kind 'member'/'other'、`player.grade`→'ippan'/'chu'/'josei' 既定 ippan、`player.city`→trim+maxlen20+空→''）だが**入力は player レコード**。純関数 `buildEntryAttrSnapshot(player)`（build 層・副作用なし）に切り出しユニットテスト可能化。
- ⚠ **前提修正（§11 M1）**: 当日 player レコードは現状 `member`/`grade` は持つが **`city` を持たない**（`addPlayerFromMaster` L2736 が city を写していない・`normalizeMasterFeeFields` L2683 は `{member,grade}` のみ返す）。そのため city のスナップショットは §11 の先頭スライス（登録時に player へ city を写す）を前提とする。フィールド名は **`player.member`**（`member_kind` ではない）に注意。
- **冪等**: 再送は同じ当日 state（凍結済み）から同値を upsert（`onConflict:tournament_id,player_id`）＝上書きしても不変。
- **既定挙動不変**: 属性が無い player でも null/''（fail-soft）。当日運営（localStorage）無改変・送信路の順序不変。

## 5. 読取側（Phase 1・`fetchCloudEntriesForTournament` 最小改変）

- SELECT に3列追加: `... ,member_kind,grade,city,player_id`。
- **フォールバック**: entry の `member_kind==null`（旧行）のとき、突き合わせた `members` の現在値を用い、表示に「※現在値」注記を付す純関数 `resolveEntryAttr(entry, memberCurrent)` を用意（当時値優先・欠損時のみ現在値＋注記）。当時値がある行は注記なし。

## 6. 表示側（Phase 2・結果一覧/報告書）

- `formatParticipantLabel` を拡張、または結果ビルダー側で3属性を併記。表示は `docs/STYLE-GUIDE.md` 準拠（順序＝支部員区分／会費区分／市町村、括弧併記 or 小さめ補助行）。
- 会費区分の表示語彙は既存ヘルプと統一（一般／中学生以下／女性）。市町村は空なら非表示。
- 対象は当日アプリの結果一覧・報告書、およびクラウド過去大会ビュー（§5 の当時値/フォールバックを表示）。app/ 管理ページは後続スライス。

## 7. 後方互換 / 不変条件

- ローカル履歴・JSON バックアップの形式は無改変（player が既に3属性を保持）。
- クラウド旧 entries（null）は読取フォールバックで破綻しない。
- 当日運営コア（`syncTournamentToCloud`/`buildCloudSyncPayload` の送信順・localStorage）無改変・例外を投げない。
- secret/実データ不使用（fixture 架空）。`bash test/run_tests.sh shogi_v4.html` **WARN=0 維持**。

## 8. Phase 分割

- **Phase 1（データ保持）**: (1) migration（entries 3列）(2) 送信 `buildEntryAttrSnapshot` 結線 (3) 読取 SELECT＋`resolveEntryAttr` フォールバック。テスト＝純関数ユニット＋送信ペイロード GOLDEN（当時値が player 由来であることを固定）。
- **Phase 2（表示）**: 結果一覧/報告書に3属性表示（当日＋クラウド）。テスト＝表示 GOLDEN（会費語彙・空 city 非表示・当時値/現在値注記）。
- **Phase 3（任意）**: app/ 管理ページの鏡写し。

## 9. レビュー / 進め方

- **Review Level L3+**（スキーマ migration＋クラウド書き込み経路＝データ整合）。設計 → design-review（別素性）→ Phase 実装（各 Draft PR・orphan base・Draft 停止）。
- 実装は本設計 go / conditional-go 後に着手。`?v` bump は別 release PR。

## 10. 構造化フィールド

- related_issue: #607 ／ related: #343（entries スキーマ）・#544（一覧 UX）・#326・#500
- canonical_decision: PMO-OPS v2.1-final

```yaml
cowork-status: design-done
reviewer: claude-code
task: 607
```

🤖 PMO-OPS v2.1-final / 実装ライン=Claude Code

## 11. design-review 反映（conditional-go 条件の消化・#666 レビュー）

別素性の design-review で **conditional-go**（Must Fix 1 / Should 4）。以下を設計に反映し go 相当とする。

### M1（Must Fix・block 事由）＝ city のスナップショット源を実在化

- **事実**: 当日 player レコード（`state.players[cls][i]`）は `member`/`grade` は持つが **`city` を持たない**。`normalizeMasterFeeFields`（L2683）は `{member,grade}` のみ返し、`addPlayerFromMaster`（push は L2736）/`finalizeAddPastParticipants` は player に city を載せない（コメント L2818「participant 側に city は無い」）。一方 **source のマスタ member は city を保持**（名簿正規化 L1982 `city:normalizeCity(m.city)`）。
- **解決（Phase 1 の先頭スライス＝1-0 として追加）**: 登録時に **player へ city を写す**。`addPlayerFromMaster` の player オブジェクトに `city:normalizeCity(member.city)` を追加（source マスタ member の city 由来）。`finalizeAddPastParticipants` の一括経路も同様。**追加のみ・既存挙動不変**（新フィールド付与のみ・当日運営の分岐/表示は無改変）。これで `snapCity(p)=normalizeCity(p.city)` が当時値を返し、ローカル履歴にも city が乗る。
- **後方互換**: 本スライス以前に保存した過去大会（ローカル履歴/クラウド）は city 欠落＝当時値復元不能ゆえ捏造せず、読取フォールバック（members 現在値＋「現在値」注記）に委ねる。member/grade は player に既存ゆえ本スライス不要。

### Should

- **S1**: 読取フォールバックのため `fetchCloudEntriesForTournament` の `players → members(...)` 埋め込みに `member_kind,grade,city` を追加（現状 `members(name,yomi)` のみ）。entry の当時値が null のときのみ members 現在値を用い「現在値」注記。
- **S2**: player 側フィールド名は **`player.member`**（`member_kind` ではない）。送信正規化で member_kind へ写す。実装コメントに明記し取り違え事故を防ぐ。
- **S3**: 「現在マスタ ≠ 当日 player」ケースを作り、entries の member_kind/grade（及び city）が **player 由来で固定**されることを GOLDEN で pin（現在値に引きずられない回帰）。`WARN=0` ゲート維持。
- **S4**: 新 migration の timestamp は既存最新 `20260705153000` より後に採番する。

### Phase 分割（改訂）

- **Phase 1-0**: 登録時に player へ city を写す（追加のみ・当日運営無改変）＋テスト（player に city 付与・既存フィールド不変）。
- **Phase 1-1**: entries 3列 migration（S4 採番）。
- **Phase 1-2**: 送信 `buildEntryAttrSnapshot(player)` 結線（S2/S3）＋読取 SELECT 3列＋`resolveEntryAttr` フォールバック（S1）。
- **Phase 2**: 結果一覧/報告書に3属性表示。**Phase 3**: app/ 鏡写し。

```yaml
cowork-status: design-reviewed
verdict: conditional-go
reviewer: claude-code-reviewer
task: 607
resolved: [M1, S1, S2, S3, S4]
```
