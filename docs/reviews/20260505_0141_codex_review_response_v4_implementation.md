# Codex 実装レビュー結果（v4 実装、PR #1）— shogi_v4 Phase A-1

**レビュー実施日**: 2026-05-05
**レビュー対象**:
- リポジトリ: kazuo1970takahashi-sketch/shogi
- PR: https://github.com/kazuo1970takahashi-sketch/shogi/pull/1
- ブランチ: feat/phase-a1-branch-master
- 対象 commit: 7d97048（実装7 + テスト1 + 依頼文1 = 計9コミット）
- 仕様書: docs/specs/20260504_2341_shogi_design_phaseA_reception_v4.md
- 依頼文: docs/reviews/20260505_0141_shogi_codex_implementation_review_request_phase_a1.md

**判定**: **Must Fix（実装修正）/ main マージ保留**
**等級**: **B**
**実装コードの修正**: 未実施（レビューのみ）

---

## 0. 実機確認結果

依頼通りローカルで以下を実行：

```bash
bash test/run_tests.sh shogi_v4.html
```

結果：
- 既存テスト: PASS=50, FAIL=0, WARN=0
- 新規支部マスタテスト: PASS 75件 / FAIL 0件
- 総合: 全テスト合格

```bash
node test/test_branch_master.js shogi_v4.html
```

結果：支部マスタ機能テスト: PASS 75件 / FAIL 0件

**ただし、テストは緑だが、仕様・データ安全性の観点で main マージ前に修正すべき問題がある。**

---

## 1. Review Findings（5点）

### Finding 1. [P1] tournament_id が大会日ではなく保存日で生成される

**対象**: shogi_v4.html:485-488

`syncBranchMasterOnSave()` は `report.date` を `tournament_date` として渡しているが、`ensureTournamentId()` 側は `todayYmd()` 固定で tournament_id を作っている。

過去大会や日付入力済み大会を別日に保存すると、仕様の `t_YYYY_MM_DD` が大会日ではなく保存日になり、`tournament_ids` と `last_attended` が食い違う。

**問題箇所**:

```javascript
function ensureTournamentId(state,master){
  if(state&&typeof state.tournament_id==='string'&&state.tournament_id)return state.tournament_id;
  var base='t_'+todayYmd().replace(/-/g,'_');
```

仕様書上は `tournament_id` は `t_ + YYYY_MM_DD` 形式で、大会日ベースに見える設計。実装では `getTournamentDateFromReport(state.report)` で大会日を取得しているのに、ID 生成では使っていない。

**対応方針**:
- `ensureTournamentId(state, master, tournamentDate)` のように大会日を渡す
- base ID は `tournamentDate` から生成する
- 既存 `state.tournament_id` がある場合は従来どおり保持する
- 同日重複時の `_2`, `_3` suffix は現行ロジックを維持する

### Finding 2. [P1] 同名複数候補で Cancel が先頭候補へ紐付けてしまう

**対象**: shogi_v4.html:563-579

仕様書 3.4.4 は、同名候補が複数なら必ずユーザー確認し、確認未完了の場合は自動マスタ更新を中断する方針。
現実装では confirm のキャンセルが `cands[0]` への紐付けになっている。

```javascript
var msg='「'+pn+'」と同名の登録が'+cands.length+'件あります。\n\nOK＝新規参加者として登録\nキャンセル＝最初の候補に紐付け';
var goNew=(typeof confirm==='function')?confirm(msg):true;
if(goNew){
  ...
}else{
  member=cands[0];
  attachMemberIdToPlayer(p,member);
}
```

これは誤タップや意味の取り違えで、別人を任意の先頭候補へ統合するリスクがある。
A-1 の confirm だけでは「複数候補から正しく選ぶ」UI にはなっていない。

**対応方針**:
- A-1 では複数候補時に先頭候補へ自動紐付けしない
- confirm で十分な選択 UI が作れないなら、複数候補時は該当 participant の同期をスキップする
- 少なくとも Cancel を「既存候補へ紐付け」にしない
- 本格的な候補選択 UI は A-2 または F9 ウィザード拡張でよい

### Finding 3. [P1] 破損マスタが saveData 経由で上書きされ得る

**対象**: shogi_v4.html:1825-1831

`loadBranchMaster()` 単体では破損 localStorage を保持する。

```javascript
try{
  return normalizeBranchMaster(JSON.parse(raw));
}catch(e){
  // 破損時は空マスタを返すが、既存 localStorage は触らない
  return createEmptyBranchMaster();
}
```

しかし `saveData()` 経路では、`loadBranchMaster()` が返した空マスタをそのまま同期・保存する。

```javascript
function syncBranchMasterOnSave(){
  try{
    var master=loadBranchMaster();
    var date=getTournamentDateFromReport(state.report);
    ensureTournamentId(state,master);
    updateBranchMasterFromTournament(state,master,{tournament_id:state.tournament_id,tournament_date:date});
    saveBranchMaster(master);
    save();
  }catch(e){
    ...
  }
}
```

つまり壊れた `shogi_branch_master` がある状態で JSON バックアップ保存を押すと、既存の破損データを空ベースの新マスタで上書きし得る。
ChatGPT 注意 #2 の「normalizeBranchMaster 空返却時に既存 localStorage を上書きしない」は、load 単体では守っているが、運用経路全体では満たしていない。

**対応方針**:
- JSON parse 失敗時は「破損マスタ由来の空マスタ」と分かるフラグを持たせる
- 破損時は `syncBranchMasterOnSave()` で `saveBranchMaster()` しない
- 大会JSON保存自体は継続する
- テストに「破損 `shogi_branch_master` がある状態で saveData 相当を実行しても raw が保持される」を追加する

### Finding 4. [P2] crypto.randomUUID 不在時に不正な member_id を生成する

**対象**: shogi_v4.html:367-378

`crypto.randomUUID` が無い環境では raw が空文字になり、最初の生成で `m_` が返る。

```javascript
var raw=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'';
var id='m_'+String(raw).replace(/-/g,'').slice(0,12);
```

仕様の `m_` + 12文字 を満たさず、古い iOS Safari 等では参加者1人目から不正IDが保存される可能性がある。

**対応方針**:
- `crypto.randomUUID` 不在時は明示的に throw する
- または `crypto.getRandomValues` 等で 12文字相当のフォールバックを実装する
- 生成 ID が必ず `m_` + 12文字 になることをテストする
- スマホ運用前提なので、古い iOS Safari でどうするか方針を明確にする

### Finding 5. [P2] マイグレーションが仕様上の対話ウィザードになっていない

**対象**: shogi_v4.html:812-823

UI は複数JSON選択と実行のみで、検出参加者のプレビューや同名候補の「統合 / 別人」選択がない。

```javascript
parseTournamentJsonFiles(files).then(function(tournaments){
  var master=loadBranchMaster();
  var summary=mergeTournamentParticipantsIntoMaster(tournaments,master);
  saveBranchMaster(master);
  ...
});
```

さらに同名複数候補は常に新規作成される。

```javascript
if(cands.length===1){
  member=cands[0]; matched++;
}else{
  // 0件 → 新規。複数 → 自動統合しない → 新規作成
  member=createMemberFromParticipant(p,master,meta.tournament_date);
  master.members.push(member); added++;
}
```

自動統合しない点は守っているが、仕様書 4.4 の対話的な確認フローとしては不足している。

**対応方針**:
- マイグレーション前に検出結果を表示する
- 同名複数候補は「統合 / 別人」をユーザーが選べるようにする
- A-1 最小実装として割り切るなら、仕様書側に「A-1 では複数候補は新規扱い」と明記する

---

## 2. A〜H 観点別判定（要約）

| 観点 | 判定 | 主な指摘 |
|---|---|---|
| A. 仕様書 v4 との整合 | **Must Fix** | F2 で MF1/MF2/MF3、F9 で MF5。F1/F3/F11/F10 は OK |
| B. ChatGPT 実装時注意 5点の強制 | **Must Fix** | #2 が saveData 経路で破られる |
| C. 既存大会運営の非破壊 | OK 寄り Minor | 既存 50 テスト緑、build/bind/coordinator 維持 |
| D. テスト品質 | Minor | 75 件は良いが、saveData 経路保護等の重要テストが不足 |
| E. パフォーマンス・スケール | OK | 100〜300名規模なら問題なし |
| F. 実装の堅牢性 | **Must Fix** | MF1〜4 に集約 |
| G. コード品質 | Minor | confirm で複数候補選択を表現する設計が弱い、isValidYmd の名前と実装の乖離 |
| H. ブラウザ互換性 | Minor〜Must Fix | crypto.randomUUID フォールバック要否（MF4） |

---

## 3. ChatGPT 実装時注意 5点の強制状況

| # | 注意 | 判定 | 備考 |
|---|---|---|---|
| 1 | replace を slice より前 | **OK** | 固定 UUID テストで `m_1234567890ab` 確認済 |
| 2 | normalizeBranchMaster 空返却時に既存 localStorage を上書きしない | **Must Fix** | load 単体は OK。saveData 経路で破られる（MF3） |
| 3 | A-1 のマスタ同期は saveData 時のみ | **OK** | grep 確認、save / resetAll / 編集に呼び出しなし |
| 4 | normalizeState で player.member_id 保持 | **OK** | テストで保持確認 |
| 5 | resetAll() で shogi_branch_master を消さない | **OK** | grep 確認、確認文言更新済 |

---

## 4. main マージ前に最低限直すべきもの

### 必須 1. tournament_id を大会日ベースで生成する
- 現状: `ensureTournamentId()` が `todayYmd()` を使う
- 修正: `getTournamentDateFromReport()` で得た日付を ID 生成にも使う

### 必須 2. 同名複数候補で先頭候補に自動紐付けしない
- 現状: Cancel = `cands[0]`
- 修正: 複数候補時は同期スキップ、または明示選択 UI

### 必須 3. 破損マスタを saveData 経由で上書きしない
- 現状: parse 失敗 → 空マスタ返却 → sync → saveBranchMaster
- 修正: parse 失敗を検知した場合はマスタ同期をスキップ、大会JSON 保存は継続、raw localStorage は保持

### 推奨 4. crypto.randomUUID 不在時の処理
- 現状: `m_` が生成され得る
- 修正: throw するか、`crypto.getRandomValues` fallback

### 推奨 5. F9 の仕様差分を解消
- 選択肢 A: 実装を仕様に寄せ、プレビューと同名候補選択 UI を追加する
- 選択肢 B: A-1 仕様を修正し、「同名複数候補は自動統合せず新規登録」と明記する

---

## 5. 追加すべきテスト 8項目

1. `report.date = "2026年4月15日"` の状態で別日に saveData 相当を実行しても、`tournament_id === "t_2026_04_15"` になる
2. 既存 `state.tournament_id` がある場合は保持される
3. 同日 tournament_id が既存にある場合、`_2`, `_3` suffix が大会日ベースで付く
4. 破損 `shogi_branch_master` がある状態で `syncBranchMasterOnSave()` 相当を実行しても localStorage の raw が保持される
5. 同名複数候補で confirm cancel 時に `cands[0]` へ member_id が付かない
6. crypto.randomUUID 不在時に `m_` だけの ID が保存されない
7. `2026-99-99` のような不正日付が `normalizeBranchMaster` で補正される
8. マイグレーション同名複数候補の仕様に合わせたテストを追加する

---

## 6. 総合結論

実装は Phase A-1 の骨格としてはかなり進んでいる。特に F1 データ層、F3 ワンクリック呼び出し、F5a 漢字検索、F10/F11 最小マスタタブは良い。

一方で、main に入れるには以下のデータ安全性リスクが残っている：

1. tournament_id が大会日ではなく保存日になる
2. 同名複数候補で誤統合が起き得る
3. 破損マスタが saveData 経由で上書きされ得る
4. crypto.randomUUID 不在時に不正 ID が保存され得る
5. F9 マイグレーションが仕様書の対話ウィザードとズレている

したがって、判定は **Must Fix（実装修正）**。
main へのマージは **保留**。
等級は **B**。

設計 v4 の A- に対して、実装は主要骨格には届いているが、データID・同名異人・破損マスタ保護の3点が main 投入前の品質線を下回っている。

---

**END OF REVIEW**
