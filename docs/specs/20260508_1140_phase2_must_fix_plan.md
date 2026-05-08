# Phase 2 修正サイクル Plan(Must Fix 1 件 + Codex P3 + リネーム A 案)

**作成日時**: 2026-05-08 11:40 JST
**対象 PR**: #28 (feat/phase2-master-reset-import)
**ベース commit**: `c74fe51`(PR #28 最新)
**実機 origin**: `localhost:8080` または `172.20.10.3:8080`(Mac テザリング)
**本番**: `https://kazuo1970takahashi-sketch.github.io/shogi/`(commit `b311ad8`、Phase 1 マージ済)

---

## 1. 修正対象 3 件と原因究明結果

### 1.1 [Must Fix] 過去参加者パネル不在

#### 原因究明(read-only 調査)

`renderPastParticipantsPanel`(L1779-1791):
```js
function renderPastParticipantsPanel(filter){
  var section=document.getElementById('past-participants-section');
  if(!section)return;
  var master=loadBranchMaster();
  var members=(master&&Array.isArray(master.members))?master.members.filter(function(m){return !m.deleted;}):[];
  if(members.length===0){section.style.display='none';return;}  // ← マスタ空なら非表示
  section.style.display='block';
  ...
}
```

`#past-participants-section`(L106): 初期 `display:none`。`renderPastParticipantsPanel` で master 生存件数 > 0 のときのみ `display:block`。これは **A-T 以前からの仕様**(A-4.4 / A-4.5 でも踏襲)。

#### Phase 2 が破壊したわけではない

- 本番 URL(commit `b311ad8`)= **既存 localStorage に過去テストデータあり** → section visible
- localhost:8080 = **別 origin、初期 localStorage 空** → 設計通り section hidden
- → ユーザーが「Phase 2 で破壊された」と認識したのは、**localStorage の origin 違い**による誤解の可能性が高い

#### Phase 2 import 完了後の挙動(コード上)

`bindPhase2ImportModalEvents` 実行成功時(L2210-2230 周辺):
```js
saveBranchMaster(result.newMaster);
modalEl.remove();
showMsg('22 名(A 18 / B 4)を取り込みました','ok');
renderMasterTab();
if(typeof renderPastParticipantsPanel==='function'){
  var ppSearch=document.getElementById('pp-search');
  renderPastParticipantsPanel(ppSearch?ppSearch.value:'');
}
```

renderPastParticipantsPanel('') を呼んでいるので、import 後に section.display='block' になるはず。**コードに不具合は無い**。

しかし実機(iPhone Safari)で「import 後にすぐに section が見えない」体験となる場合、原因は:
- ユーザーがマスタタブにいて、参加者登録タブに切り替えて初めて section visible に気づく
- しかも切り替えた瞬間に「過去参加者から選ぶ」セクションをスクロールで見つける必要がある

#### 修正方針(Must Fix #1)

防御的修正 + UX 改善:

**(a) `applyPhase2Import` / `applyMasterReset` 完了後に明示的に `#past-participants-section` の display を再保証**(safety net)。renderPastParticipantsPanel の中身は触らず、呼び出し側(`bindPhase2ImportModalEvents`)で master.length > 0 なら直接 display='block' を強制設定。Safari の race を防ぐ。

**(b) Phase 2 import 完了後に参加者登録タブへ自動切替**:`showTab('reg')` を呼ぶ → ユーザーが探す手間なく、過去参加者パネルがすぐ見える状態になる。これは Phase 2 専用 import の UX 改善で、既存 import モーダルには影響しない(既存挙動維持)。

**(c) リセット完了後はタブ切替しない**:マスタが空になるため、過去参加者パネルは設計通り hidden。ユーザーがマスタタブにいるまま「次は import を実行」する流れが自然。

### 1.2 [Codex P3] runbook サンプル不整合

`docs/operations/20260510_tournament_setup.md` L55-57:
```
- A 級: 片山凱翔(A、city=御殿場市)
- B 級: 高橋一雄(B、city=沼津市)等  ← 実データは city=御殿場市
- city 長め: city が最も長い 1 件
```

#### 実データ確認(`data/import/20260412_participants.json`)

- A 級 1 件目: 片山凱翔(A、city=御殿場市) ✅
- B 級 1 件目: 泉井 輝(B、city=御殿場市)
- B 級 高橋一雄: city=御殿場市(沼津市は誤り)
- city 最長: 古谷賢作(A、city=伊豆の国市、5 文字)

#### 修正方針

L55-57 のサンプル記載を実データに合わせる:
- B 級 サンプルを「泉井 輝(B、city=御殿場市)」に変更
- city 長め: 「古谷賢作(A、city=伊豆の国市、5 文字)」を明示

### 1.3 [追加] ヘッダー「リセット」リネーム

`shogi_v4.html` L95:
```html
<button type="button" class="btn-danger btn-sm no-print" id="resetBtn">リセット</button>
```

マスタタブに新規追加した「📛 マスタをリセット」と同名(両方とも「リセット」)で本番ミス誘発リスク。Plan §1.5 で「resetAll() = state リセットのみ、マスタ不変」確認済 → **機能変更なしの label 変更**。

#### 修正方針

- L95 ボタン textContent を「リセット」→「**大会データをリセット**」に変更
- id は `resetBtn` のまま維持(既存 e2e セレクタ互換)
- e2e で文字列「リセット」を resetBtn の text として参照しているテストは無し(grep 確認済、`#mr-confirm-text` の input value のみ)

---

## 2. 実装方針

### 2.1 production code 修正

| # | 箇所 | 内容 |
|---|---|---|
| A | `shogi_v4.html` L95 ヘッダーボタン | textContent: 「リセット」→「大会データをリセット」 |
| B | `bindPhase2ImportModalEvents` 実行成功処理 | `saveBranchMaster` の直後、`renderMasterTab()` の前に `showTab('reg')` を追加し、`renderPastParticipantsPanel('')` の後に section.display='block' を明示再保証 |

### 2.2 e2e 追加(`shogi_phase2_import.spec.js` 拡張)

| # | テスト名 | 仕様対応 |
|---|---|---|
| 1 | Phase 2 import 完了後、参加者登録タブが自動的に active になる | UX 改善検証 |
| 2 | Phase 2 import 完了後、`#past-participants-section` が visible になる | Must Fix #1 |
| 3 | Phase 2 import 完了後、過去参加者パネル展開で 22 名表示 | §6 #7 補強 |
| 4 | リセット直後はマスタ空のため `#past-participants-section` が hidden(設計通り) | 仕様確認 |
| 5 | ヘッダーボタン textContent が「大会データをリセット」 | リネーム検証 |
| 6 | ヘッダーボタン押下で state リセット(マスタ不変) | 機能変更なし検証 |

### 2.3 runbook 修正

`docs/operations/20260510_tournament_setup.md` L55-57(サンプル 3 件)を実データに合わせる。

---

## 3. ステップ(Step 1〜3 連続実行)

| Step | 内容 | コミット予定 |
|---|---|---|
| 0 | Plan commit(本ドキュメント) | docs(phase2-fix): add Must Fix Plan |
| 1 | 実装(3 件まとめて) | fix(phase2): autoswitch tab + header label rename + runbook samples |
| 2 | e2e 追加 + 全緑確認 | test(phase2-fix): add tab autoswitch + section visible + header label e2e |
| 3 | PR #28 push + Body 修正履歴追記(GitHub 上) | (Step 2 と同 push) |

---

## 4. リスク

- (低) `showTab('reg')` 自動切替で「マスタタブで作業中だったユーザーが切替に違和感を感じる」 → 仕様書 §6 #7「過去参加者パネルに 22 名表示」を確実に達成する UX として正当化
- (低) ヘッダー「大会データをリセット」label が長くなる → 既存 layout(headerflex)で改行されないか確認、e2e で text 検証 + 視覚 snapshot 更新
- (低) e2e の追加で全 e2e の総数が変動 → 既存 670 件 + 追加分緑になる前提

---

**END(Plan 出力、即 Step 1〜3 へ進む)**
