# Codex 実装再レビュー依頼 — shogi_v4 Phase A-1（v5 実装修正後）

**依頼日時**: 2026-05-05 07:15 JST
**依頼者**: 髙橋一雄
**対象プロジェクト**: shogi_v4（沼津支部 月例将棋大会 運営ツール）
**対象 PR**: https://github.com/kazuo1970takahashi-sketch/shogi/pull/1
**対象ブランチ**: `feat/phase-a1-branch-master`（commit `b219617`、main から +15 commits）
**レビュー種別**: **再レビュー**（前回 Must Fix 反映後の検証）
**根拠**: DevSecOps v1.2 Slim 6.2節「修正後の再レビュー」サイクル

---

## 0. 用語に関する注記（v1.2 Slim 5.3節準拠）

| エージェント | 役割 |
|---|---|
| Claude.ai | 設計／調査／依頼文 |
| Claude Code | 実装／Git |
| **Codex（本依頼の実施主体）** | **独立レビュー（実装コード検証）** |
| ChatGPT | 設計メタレビュー（GitHub 連携） |

---

## 1. 再レビューの背景

### 1.1 これまでの経緯

| 時系列 | フェーズ | 担当 | 結果 |
|---|---|---|---|
| 2026-05-04〜05 | 設計 v1〜v3 | Claude.ai | v3 完成 |
| 2026-05-05 | 設計メタレビュー（v3） | ChatGPT | **B+ / Conditional Go**（Must Fix 3件） |
| 2026-05-05 | 設計反映 v4 | Claude.ai | 全件反映 |
| 2026-05-05 | 設計再レビュー（v4） | ChatGPT | **A- / Go**（実装着手 OK） |
| 2026-05-05 | Phase A-1 実装 | Claude Code | PR #1 作成（commit `7d97048`）|
| 2026-05-05 | **実装レビュー（v4 実装）** | **Codex** | **B / Must Fix 5件 + Minor 1件** |
| 2026-05-05 | 仕様書 v5 + 実装修正 | Claude.ai + Claude Code | PR #1 更新（commit `b219617`、+6 commits）|
| **本依頼** | **実装再レビュー** | **Codex** | **判定待ち** |

### 1.2 前回（v4 実装）レビューでの指摘と修正対応

| # | Codex 指摘 | 重要度 | 対応 commit | 修正内容 |
|---|---|---|---|---|
| MF #1 | tournament_id が大会日ではなく保存日 | P1（データ整合性）| `f620967` | `ensureTournamentId(state, master, tournamentDate)` 第3引数追加 |
| MF #2 | 同名複数候補で confirm Cancel が cands[0] へ誤紐付け | P1（データ事故リスク）| `391efb1` | confirm 廃止 → 同期スキップ |
| MF #3 | 破損マスタが saveData 経由で空上書き | P1（復旧不能事故）| `92a74c2` | `_loaded_with_corruption` フラグ + saveBranchMaster スキップ |
| MF #4 | `crypto.randomUUID` 不在時に不正 ID | P2（古環境）| `cf8ee87` | 明示 throw |
| MF #5 | F9 マイグレーションが対話ウィザードでない | P2（仕様乖離）| **コード修正なし** | 仕様書 v5 §3.4.5 で「A-1 では複数候補は新規扱い」と明文化 |
| Minor | `isValidYmd` の実在検証なし | Minor | `b219617` | `Date` オブジェクトで実在検証 |

### 1.3 修正規模

```
docs/specs/20260505_0217_shogi_design_phaseA_reception_v5.md       | +924  （新規）
docs/reviews/20260505_0141_codex_review_response_v4_implementation.md | +274  （新規、レビュー記録）
shogi_v4.html                                                       |  +60 / -23
test/test_branch_master.js                                          | +152 / -2
合計                                                                 | +1410 / -25
```

PR #1 全体（実装 + 修正）：main から +15 commits、+2497 / -25 行。

---

## 2. レビュー対象

### 2.1 GitHub 参照

| 参照対象 | パス・URL |
|---|---|
| **PR**（推奨レビューUI）| https://github.com/kazuo1970takahashi-sketch/shogi/pull/1 |
| 対象ブランチ | `feat/phase-a1-branch-master` |
| 対象コミット範囲 | `main` → `b219617`（+15 commits、うち修正分は最後の +6） |
| **仕様書 v5**（修正の根拠）| `docs/specs/20260505_0217_shogi_design_phaseA_reception_v5.md` |
| 前回レビュー記録 | `docs/reviews/20260505_0141_codex_review_response_v4_implementation.md` |
| 実装本体 | `shogi_v4.html` |
| 新規テスト | `test/test_branch_master.js`（111 アサーション、+36） |
| 既存設計思想 | `HANDOFF.md` |

### 2.2 ローカル実行

```bash
cd <作業ディレクトリ>
git clone https://github.com/kazuo1970takahashi-sketch/shogi.git || (cd shogi && git fetch origin)
cd shogi
git checkout feat/phase-a1-branch-master
git pull origin feat/phase-a1-branch-master

bash test/run_tests.sh shogi_v4.html
```

期待される結果：
- 既存テスト（第1〜3層 + ペアリング性質 + タブ選択 + JSON フィクスチャ + 支部マスタ）：**PASS=50, FAIL=0**
- 支部マスタ機能テスト（test_branch_master.js）：**PASS=111, FAIL=0**

---

## 3. レビュー観点（前回指摘の修正検証が中心）

### ★★★ 必須判定：Must Fix 5件の修正検証

#### MF #1: tournament_id が大会日ベースで生成されるか

**前回指摘**：`ensureTournamentId` が `todayYmd()` 固定で、`syncBranchMasterOnSave` から渡される `tournament_date` を使っていなかった。過去大会を別日に保存すると `tournament_id` が保存日ベースになり `last_attended` と食い違った。

**修正方針**（v5 §3.3 / §3.4.2）：
```javascript
function ensureTournamentId(state, master, tournamentDate) {
  if (state && typeof state.tournament_id === 'string' && state.tournament_id) return state.tournament_id;
  var date = isValidYmd(tournamentDate) ? tournamentDate : todayYmd();
  var base = 't_' + date.replace(/-/g, '_');
  // ...
}
```

**確認項目**：
- `ensureTournamentId` の第3引数 `tournamentDate` が追加されているか
- `syncBranchMasterOnSave` から `getTournamentDateFromReport(state.report)` を渡しているか
- `tournamentDate` が無効な場合のみ `todayYmd()` にフォールバックするか
- `report.date = "2026年4月15日"` の状態で saveData 相当を実行 → `tournament_id === "t_2026_04_15"` になるか（実機テスト）
- 既存 `state.tournament_id` がある場合は保持されるか
- 同日重複時の `_2`, `_3` suffix が大会日ベースで付くか

**判定**：**OK / Minor / Must Fix が残っている**

#### MF #2: 同名複数候補で同期スキップされるか

**前回指摘**：confirm の Cancel が `cands[0]` への紐付けになっており、誤タップで別人統合のリスクがあった。

**修正方針**（v5 §3.4.2 / §3.4.4）：
- confirm を廃止
- 複数候補時は `continue` でスキップ
- `pendingSkippedNames` で集計し、ループ後に `showMsg` で1度だけ通知
- participant の `member_id` は付与しない
- 該当 members の `tournament_ids` には追加しない

**確認項目**：
- confirm ダイアログが廃止されているか（コード grep）
- 複数候補時に participant の `member_id` が付与されないか
- 該当 members の `tournament_ids` に新 ID が追加されないか
- 該当 members の `attendance_count` が増えないか
- 他の参加者（同名でない）の同期は正常に行われるか
- 保留通知（showMsg）が複数件あっても1度だけ呼ばれるか

**判定**：**OK / Minor / Must Fix が残っている**

#### MF #3: 破損マスタが saveData 経由で上書きされないか

**前回指摘**：`loadBranchMaster` 単体では破損 raw を保持していたが、`syncBranchMasterOnSave` 経由で空マスタが上書き保存される穴があった。

**修正方針**（v5 §3.5）：
- `loadBranchMaster` の catch 節で `_loaded_with_corruption: true` フラグ付き空マスタを返却
- `saveBranchMaster` は永続化前に `clone` を作り、フラグを除外（永続化対象に含めない）
- `syncBranchMasterOnSave` はフラグを検出すると `saveBranchMaster` をスキップし、`save()` のみ実行

**確認項目**：
- `loadBranchMaster` の catch 節で `_loaded_with_corruption: true` を返却しているか
- `saveBranchMaster` の `clone` 構造が `_loaded_with_corruption` を除外しているか
- `syncBranchMasterOnSave` でフラグ検出 → `saveBranchMaster` スキップ → `save()` 実行の順か
- 破損 `shogi_branch_master` がある状態で saveData 相当を実行しても localStorage の raw が保持されるか（実機テスト）
- 大会JSON 保存自体（`save()`）は継続するか
- ユーザー通知（showMsg）が出るか

**判定**：**OK / Minor / Must Fix が残っている**

#### MF #4: crypto.randomUUID 不在時に明示 throw されるか

**前回指摘**：`raw=''` で `m_` だけの不正 ID が保存され得た。

**修正方針**（v5 §3.3）：
```javascript
function generateMemberId(master) {
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    throw new Error('crypto.randomUUID が利用不可な環境です。古い iOS Safari 等の場合、ブラウザを更新してください。');
  }
  // ...
}
```

**確認項目**：
- `generateMemberId` の冒頭で crypto.randomUUID 不在時に throw するか
- throw メッセージに `crypto.randomUUID` への言及と古い iOS Safari 案内があるか
- crypto 不在環境で `m_` だけの不正 ID が保存されないか（throw が呼び出し階層全体で守られているか）

**判定**：**OK / Minor / Must Fix が残っている**

#### MF #5: マイグレーション仕様の明文化

**前回指摘**：F9 マイグレーションが対話ウィザード仕様（プレビュー、統合/別人選択）になっていない。

**対応方針**：仕様修正で解消。
- 仕様書 v5 §3.4.5 で「A-1 では同名複数候補は新規 member 作成（自動統合せず別人扱い）」と明文化
- 仕様書 v5 §4.4 で「A-1 では対話 UI 省略、A-2 で提供」と明文化
- 既存 `mergeTournamentParticipantsIntoMaster` は既にこの動作なのでコード修正なし

**確認項目**：
- 仕様書 v5 §3.4.5 / §4.4 の記述が妥当か
- `mergeTournamentParticipantsIntoMaster` の実装が仕様書 v5 §3.4.5 通りか（既に v4 実装の段階で正しい）
- 通常マスタ同期（v5 §3.4.4：複数候補時はスキップ）とマイグレーション（v5 §3.4.5：複数候補時は新規）で動作差を持たせる設計判断は妥当か

**判定**：**OK / Minor / 仕様修正が不十分**

### ★★ Minor 改善検証

#### Minor: isValidYmd の実在検証

**前回指摘**：`/^\d{4}-\d{2}-\d{2}$/` のみで `2026-99-99` 等を素通ししていた。

**修正方針**（v5 §3.5）：
```javascript
function isValidYmd(s) {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
```

**確認項目**：
- `2026-99-99` → false
- `2026-02-30` → false
- `2026-13-01` → false
- `2026-02-29` → false（2026 はうるう年でない）
- `2024-02-29` → true（うるう年）
- `1900-02-29` → false（100年ルール）
- `2000-02-29` → true（400年ルール）
- 正常な日付（`2026-04-15`）は true のまま

**判定**：**OK / Minor / Must Fix が残っている**

### ★★ 新たに導入された設計に潜む問題

修正で新たに導入されたコードに、新たなリスクが入り込んでいないか検証してください：

#### A. `_loaded_with_corruption` フラグの扱い
- フラグがマスタ本体の永続化に紛れ込んでいないか（saveBranchMaster の clone 設計の妥当性）
- 他の関数（renderMasterTab, mergeTournamentParticipantsIntoMaster 等）でフラグの扱いに齟齬はないか
- フラグのライフサイクル（loadBranchMaster で付与 → syncBranchMasterOnSave で検出 → どこかで剥がれる？）

#### B. `pendingSkippedNames` 通知の実装
- `showMsg` が存在しない環境（テスト等）でクラッシュしないか
- 通知メッセージの可読性（複数名の連結表示）
- 通知が他の showMsg 呼び出しと競合しないか

#### C. `ensureTournamentId` の第3引数追加
- 既存の呼び出し元で第3引数を渡し忘れているケースはないか（grep 推奨）
- フォールバック動作（`isValidYmd(tournamentDate) ? tournamentDate : todayYmd()`）の妥当性

#### D. `generateMemberId` の throw が呼び出し階層全体で守られているか
- `createMemberFromParticipant` が generateMemberId を呼ぶ際、catch で握りつぶしていないか
- マイグレーション・通常同期の両経路で throw が伝播するか

#### E. テスト追加 +36 アサーションの実効性
- false-positive のテストはないか
- 修正前のコードを残してもテストが通ってしまう構造になっていないか
- 仕様書 v5 §7.7 の Codex 提案 8項目をどの程度カバーしているか

### ★ 既存大会運営が壊れていないか（再確認）

- 既存 50 テスト全件緑か（実機で確認）
- 既存 build/bind/coordinator パターンを維持しているか
- 既存タブ（reg/tournament/result）の挙動が変わっていないか
- マスタなしで起動しても従来通り動くか

---

## 4. 期待するアウトプット

### 4.1 形式

各 Must Fix（#1〜#5）+ Minor + 新規導入箇所（A〜E）+ 既存非破壊について判定とコメント。

### 4.2 判定の解像度

| 解像度 | 意味 | 後続アクション |
|---|---|---|
| **OK** | そのまま main にマージしてよい | main マージへ |
| **Minor** | 軽微な改善提案あり（A-2 で対応可）| バックログ化 |
| **Must Fix（実装修正）**| マージ前に修正が必要 | 再度 fix コミット → 再々レビュー |
| **Must Fix（仕様修正）**| 仕様書の不備が露呈 | 仕様書 v6 + 実装やり直し |
| **Critical**| 既存運営を壊している、データ消失リスクなど | 即停止、main マージ禁止 |

### 4.3 等級判定

- **前回（v4 実装）**：B / Must Fix
- **設計レビュー基準（v4 仕様書）**：A- / Go

今回の修正で実装が **設計の A- に追いついたか / 越えたか / 落ちているか** を判定してください。

### 4.4 main マージ判断

最後に、**「main にマージしてよいか」** の明示的な Yes/No を含めてください。

---

## 5. 特に避けたい落とし穴

1. **修正範囲の確認不足**：Must Fix 5件の修正が **コードレベルで本当に守られているか** を、grep やテスト実行で確認してほしい
2. **新たな穴の見逃し**：修正コードに新たなバグが潜んでいないか
3. **テストの false-positive**：修正前のコードで通ってしまうテストがないか
4. **既存機能の破壊**：50 既存テストが緑でも、目視で確認すべき領域があるか

---

## 6. レビュー所要時間の目安

- ★★★ Must Fix 5件 + Minor の検証：30-60分相当
- ★★ 新規導入箇所の検証：30-60分相当
- 全観点：60-120分相当

時間制約があれば ★★★ のみで構わない。

---

## 7. レビュー後のフロー（v1.2 Slim 6.2 節準拠）

```
本再レビュー（Codex）
  → Claude.ai が反映方針を判断
  → 髙橋さん最終確認
  → 判定別の次ステップ
```

| 判定 | 次ステップ |
|---|---|
| **OK** | feat ブランチを main にマージ → 実機スマホ確認 → 次回月例大会で運用試験 |
| **Minor** | A-2 バックログに記録、main マージへ進む |
| **Must Fix（実装修正）** | feat ブランチで修正コミット → Codex 再々レビュー |
| **Must Fix（仕様修正）** | 仕様書 v6 → ChatGPT 設計再々レビュー → 実装やり直し |
| **Critical** | 即停止、root cause 分析後に方針再検討 |

---

## 8. 安全のためのお願い

- レビュー作業中、**実装コードの修正は行わないでください**（レビューのみ、修正は Claude Code 担当）
- ローカル shogi リポジトリで作業する場合、`feat/phase-a1-branch-master` 以外への push は不要
- main へのマージは行わないでください（Kazuoさん の判断後に Claude Code が実施）
- v1.2 Slim 4.4 節の「越境禁止」原則：他プロジェクト（shogi-coach / golf-compe / bp-matching / x-support / file-organizer）への干渉は不可

---

**END OF REQUEST**
