## MEMBER-UPSERT-RPC-001: 会員 upsert を RPC 化し「INSERT は完全な行・UPDATE は指定列だけ」にする

Issue #909（#901 の Codex 2巡目 P1 r3802131305 から分離した重車線）。
**便1＝migration と実 PG 検証のみ。**クライアント（`pushMemberEditToCloud` /
`pushMemberDeleteStateToCloud`）の切り替えは、作者が Supabase へ適用したことを確認してから
便2で行う（適用前にクライアントが RPC を呼ぶと名簿編集の保存が全部失敗するため・作者裁定 2026-08-18）。

### 何が問題だったか

#901 は編集 push を「送信前に members を読む → 操作していない欄はクラウド値を採用して upsert」に
した。本題（ふりがなの誤字を直しただけで区分・級・市町村が既定値と NULL で潰れる＝実測 500円/人の
誤徴収）は塞がったが、**「読んでから書く」構造そのものに由来する穴が2つ残った**。

- **穴①** 読み取り失敗 ＋ その会員の初回 push → 属性が NULL の行ができる。
  まっさらな別端末が pull すると `mergeCloudMembersIntoMaster` の非空ガードで属性が入らず、
  `normalizeBranchMaster` が 支部員/一般/市町村なし へ確定する。⚠ は push した端末にしか
  出ないので、**被害を受ける側からは気づけない**。
- **穴②** select→upsert の窓で他端末の更新を巻き戻す（#907 の 1.・#901 が新設した窓）。
  受付席と本部席で同時に名簿を触る場面が該当する。

### 何を変えたか

`supabase/migrations/20260818120000_member_edit_upsert_preserving_attrs.sql` を追加（純追加・冪等）。

- `app_upsert_member_edit(p_club, p_member_id, p_name, p_yomi, p_member_kind, p_grade, p_city,
  p_set_member_kind, p_set_grade, p_set_city, p_deleted_at, p_touch_deleted_at)`
- `insert ... on conflict do update set` は **set 句に挙げた列だけ**を更新する。これを使って
  **新規行は excluded（＝端末のローカル値）で完全な行／既存行は `p_set_*` が true の列と
  name・yomi（・deleted_at）だけ**を 1文・1トランザクションで書く。事前 select が要らないので
  **穴①も穴②も原理的に生じない**
- 未更新列は `coalesce(excluded.x, m.x)` ではなく **`case when p_set_x then excluded.x else m.x end`**。
  coalesce だと未操作でも既存 NULL が端末値で埋まり保全にならず、`p_set_x=true` での
  **NULL への明示クリアもできなくなる**（反証パネル M10 で実測）
- `p_touch_deleted_at=false`（既定）なら既存の `deleted_at` に触れない＝編集 push が tombstone を
  復活させない。`true` で削除／復元の両方を同じ関数で扱う
- `p_set_*` の既定は **false**＝呼び出し側が渡し忘れてもクラウドを壊さない側に倒れる
- **security invoker**。RLS はそのまま有効で `members_insert` / `members_update` の
  `app_is_active_organizer(club_id)` が効く＝**この RPC で権限は一切増えない**。anon に EXECUTE を与えない
- 区分・級は関数内で whitelist 検証。**`p_set_*` が false でも新規行の INSERT には載る**ため、
  検証は「渡された値が非 NULL のとき常に」行う
- 返り値 `{inserted, member_kind, grade, city, deleted_at}` は**実際に残った値**。便2の
  クライアントは「端末の表示と違う値が残った欄」を推測ではなく実値で ⚠ に出せる

### 意図的にやらなかったこと

- **「0 行だったら失敗させる」分岐を置かない。** RLS 違反は raise する（黙って 0 行にはならない）＝
  U22–U24 で実証済み。到達しない分岐を防御として置くと、テストがその死んだ枝を守ることになる
  （#901 で退役済みモーダルに実装して 26/26 緑になった失敗と同じ形）
- **name / yomi は常に更新する**（現行の upsert と同じ）。「削除 push が別端末で直した氏名を
  巻き戻しうる」性質は本 RPC でも変わらないが、これは #909 の対象外＝#907 系の別件。
  ここで一緒に変えると属性列の保全という本題の効果と混ざって切り分けられなくなる
- クライアントの切り替えと、それに伴う `_fetchCloudMemberAttrs` / `_withReadTimeout` /
  `EDIT_ATTR_UNREAD_NOTE` / `DELETE_ATTR_UNREAD_NOTE` の削除は**便2**

### テスト

`test/member_upsert_rpc_pgtest.sh`（**実 PostgreSQL 16.13 で 35 checks・FAIL=0**）。
全 migrations を実 PG に適用したうえで、**実際に RPC を呼んで行の実値を前後で比較する**
（「set 句に case when があるか」のようなソース形状の存在チェックはしない → [[pin-must-exercise-behavior]]）。
保全の判定は列ごとの比較に加えて **行全体の md5** でも取り、列を1つ見落とす形の抜けを塞ぐ。

主なもの: U2 未操作の3属性が1バイトも変わらない／U6 押した欄は既定値方向でも上書き／
U7 `p_set_city=true` なら NULL への明示クリアもできる／U8 新規行は `p_set_*` 全 false でも
3属性が入る（穴①）／U10・U10b `p_touch_deleted_at=false` は削除状態にも生存にも触れない／
U15 新規行でも不正な語彙は拒否（INSERT に載るため）／U25 anon は
**permission denied for function**（失敗理由まで一致）／U29 SECURITY INVOKER／
**U31 端末Y の更新が巻き戻らない（穴②の直接の証明）**。

### 反証パネル（変異を当てて赤を確かめた）

12 変異中 **11 が赤・素通り1**。

| 変異 | 結果 |
|---|---|
| M1–M3 member_kind / grade / city を無条件上書き（#901 の実害そのもの） | 赤 |
| M4 新規行の INSERT で member_kind を落とす（穴①を再現） | 赤 |
| M5・M11 deleted_at を無条件代入 | 赤（U10 / U10b） |
| M6・M7 whitelist 検証を無効化 | 赤 |
| M8 security invoker → definer | 赤（U22–U24・U29） |
| M9 anon にも EXECUTE を付与 | 赤（U25・U27） |
| M10 city を `coalesce(excluded, m)` に | 赤（U7・U31） |
| **M12 `revoke ... from anon` を消す** | **素通り（35/0 のまま緑）** |

M12 が素通りするのは、効いているのが `from public` の revoke だけで、anon には明示 grade が
無いため **`from anon` の行が今日は no-op** だから。既存 `app_hard_delete_members` と読み比べ
やすいよう行自体は残したが、**「anon を締めている根拠」はこの行ではなく U25/U27**（実際に呼んで
permission denied を確認）であることを SQL のコメントにも書いた。

`bash test/run_tests.sh shogi_v4.html` = **PASS=260 / FAIL=0 / WARN=0**（本 pgtest 追加で 259→260）。
