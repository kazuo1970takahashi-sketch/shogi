# Codex P1 修正 完了報告書

- 対象: `shogi_v4.html`
- 作業日: 2026-05-01
- 作業者: Claude Code
- 依頼書: `claude_code_p1_fix_request.md`（髙橋さん作成）
- レビュー元: Codex 独立レビュー

---

## 1. 修正対応表

| 指摘番号 | 概要 | 修正対象関数 | 修正後の行番号 | 修正前の行番号 |
|---|---|---|---|---|
| **P1-1** | 削除クラッシュ修正 | `removePlayer` | shogi_v4.html: 481-485 (新規 alert 追加) / 486 から旧警告文を削除 | shogi_v4.html: 481-482 (旧 msg 連結警告) |
| **P1-2** | ペアリングアルゴリズム修正（同勝ち数優先） | `generatePairing` 内 `backtrack` | shogi_v4.html: 666-705 | shogi_v4.html: 662-687 |

---

## 2. 修正内容（要点）

### P1-1: `removePlayer` の安全策追加

**前**: 過去対局のある参加者でも開始後に削除できてしまい、`calcFinal` が `state.players` 前提で `opponents[match.p1].push(...)` を実行するため `Cannot read properties of undefined` で TypeError → 最終結果タブ・印刷・報告書すべて停止。

**後**: `state.started === true && pastMatches > 0` の場合は削除禁止（alert + return）。実態と乖離していた警告文「⚠ 過去N試合分の対戦履歴があります…」は削除した（採用方針: 案A）。

- 大会**開始前**（`state.started === false`）の削除は引き続き許可
- 進行中ペアリング登録中の削除禁止ロジック（既存）はそのまま残置
- `getName` の `(削除)` フォールバックは保険として残置（normalizeState で壊れたデータを読んだ場合に有効）

### P1-2: `backtrack` を勝数差バケット方式に変更

**前**: 候補を単純シャッフル → 勝数差を一切考慮しないため、Codex 実証で 2勝対0勝のような組合せが約80%発生。

**後**:
1. 各候補について `|wins[pj] - wins[pi]|` を計算してバケット化
2. バケットを勝数差昇順でソート
3. 各バケット内を Fisher-Yates でシャッフル
4. 連結して候補配列とする → 同勝ち数優先 + バケット内ランダム性維持

これにより:
- 同勝ち数で組める場合は必ず同勝ち数で組まれる
- 組めない時のみ勝数差±1, ±2... と広げる（バックトラッキング）
- 再戦回避は維持（既存通り、`allowRematch=false` で無理なら `true` で再試行）
- くじ引き性は同勝ち数グループ内で維持

ES5 構文を維持。`Object.keys(...).map(Number)` の代替として `for...in + hasOwnProperty + Number(dk)` を使用。

---

## 3. テスト結果

### 3-1. 新規追加: `test/test_pairing_properties.js`

```
=== ペアリング性質テスト ===

[テスト1] 全員1回だけ登場
  ✓ 200試行で各選手は最大1ペア、ペア数も期待通り

[テスト2] 再戦回避（無理ない範囲）
  ✓ 再戦なしが可能なケースで再戦を回避（200試行検証）

[テスト3] 勝数差最小性 — 同勝ち数で組める時は必ず同勝ち数で組まれる
  ✓ 同勝ち数で組めるケース 100 試行 全て同勝ち数で組まれた

[テスト4] 削除クラッシュ非再現（開始後・過去対局あり参加者の削除がブロックされる）
  ✓ 4-a: 開始前は削除可能（confirm承認時）
  ✓ 4-b: 開始後・過去対局あり → 削除拒否
  ✓ 4-c: 開始後・過去対局なし → 削除可能
  ✓ 4-d: 削除ブロック後 calcFinal はクラッシュしない

=== 結果: PASS=7, FAIL=0 ===
```

### 3-2. 修正前ファイルでの再現確認（テストの妥当性）

`shogi_v4_before_p1.html`（修正前バックアップ）に対して同テストを実行:

```
[テスト1] 全員1回だけ登場
  ✓ 200試行で各選手は最大1ペア、ペア数も期待通り

[テスト2] 再戦回避（無理ない範囲）
  ✓ 再戦なしが可能なケースで再戦を回避（200試行検証）

[テスト3] 勝数差最小性 — 同勝ち数で組める時は必ず同勝ち数で組まれる
  ✗ 勝数差最小性: trial=0 で失敗
      同勝ち数で組めるはずなのに p3(w=1)-p1(w=0) が組まれた

[テスト4] 削除クラッシュ非再現
  ✓ 4-a: 開始前は削除可能（confirm承認時）
  ✗ 4-b: 削除拒否されていない
      after.length=3
  ✓ 4-c: 開始後・過去対局なし → 削除可能
  ✗ 4-d: calcFinal がクラッシュした

=== 結果: PASS=4, FAIL=3 ===
```

→ テストは P1-1, P1-2 のリグレッションを正しく検出する。

### 3-3. 既存テスト（`run_tests.sh`）

```
==========================================
  3層テスト: shogi_v4.html
==========================================

【第1層】スモークテスト  → 全PASS（5項目）
【第2層】重点回帰テスト  → 全PASS（28項目）
【第3層】既知バグ再発テスト(過去発覚した10種類) → 全PASS（10項目）

【ペアリング性質テスト】
  ✓ ペアリング性質テスト 全PASS

==========================================
  結果: PASS=43, FAIL=0, WARN=0
==========================================
```

### 3-4. 関数本体ハッシュ比較（リグレッション検出）

`run_tests.sh shogi_v4.html shogi_v4_before_p1.html` の比較結果:

```
【比較】shogi_v4_before_p1.html との関数本体ハッシュ比較
  ⚠ 2個の関数で本体ハッシュ差分あり(変更意図と一致するか要確認):
      - generatePairing: 8e274621 -> 3aa79ee8
      - removePlayer: ed2ad0a7 -> 9af21cc6
```

→ 意図した 2 関数のみ変化、他 33 関数は完全一致。

### 3-5. 出力比較テスト（before/after）

| テスト | 結果 |
|---|---|
| `compare_render.js`（renderTournament 4ケース） | PASS=4, FAIL=0 — HTML完全一致 |
| `compare_results.js`（renderResults 12ケース、スマホ/PC両モード） | PASS=12, FAIL=0 — HTML完全一致 |
| `compare_modals_v2.js`（モーダルDOMツリー 5ケース） | PASS=5, FAIL=0 — DOMツリー完全一致 |
| `test_tab_selection.js`（タブ選択 6ケース） | PASS=6, FAIL=0 |

→ 修正は `removePlayer` の動作と `generatePairing` のペア決定アルゴリズムのみに閉じており、レンダリング・モーダル・タブ選択への影響なし。

---

## 4. git diff（主要部分）

### removePlayer (shogi_v4.html: 481-486 周辺)

```diff
       var rm=state.results[cls][r][mi];
       if(rm.p1===id||rm.p2===id)pastMatches++;
     }
+  }
+  // 大会開始後で過去対局がある参加者は削除禁止（calcFinalがstate.players前提のため、TypeErrorで最終結果タブが落ちる）
+  if(state.started&&pastMatches>0){
+    alert(name+'は過去'+pastMatches+'試合分の対戦履歴があるため、大会開始後は削除できません。\n\n誤って登録した場合は「リセット」で大会をやり直してください。');
+    return;
   }
   var msg=name+'を削除しますか？';
-  if(pastMatches>0)msg+='\n\n⚠ 過去'+pastMatches+'試合分の対戦履歴があります。削除しても履歴は残りますが、順位表で名前が「(削除)」と表示されます。';
   if(!confirm(msg))return;
```

### generatePairing 内 backtrack (shogi_v4.html: 666-705)

```diff
   function backtrack(idx,allowRematch){
     while(idx<sorted.length&&pairedArr[idx])idx++;
     if(idx>=sorted.length)return true;
-    // 相手候補をランダムな順番で試す
-    var candidates=[];
+    // 候補を勝数差で評価。同勝ち数グループ内はランダム順、グループ間は勝数差昇順
+    var pi=sorted[idx];
+    var piWins=wins[pi.id]||0;
+    // 勝数差ごとにバケット化
+    var buckets={};
     for(var j=idx+1;j<sorted.length;j++){
       if(pairedArr[j])continue;
-      var pi=sorted[idx],pj=sorted[j];
+      var pj=sorted[j];
       if(!allowRematch&&played[pi.id].indexOf(pj.id)>=0)continue;
-      candidates.push(j);
+      var diff=Math.abs((wins[pj.id]||0)-piWins);
+      if(!buckets[diff])buckets[diff]=[];
+      buckets[diff].push(j);
     }
-    // candidatesをシャッフル
-    for(var ci=candidates.length-1;ci>0;ci--){
-      var cj=Math.floor(Math.random()*(ci+1));
-      var ct=candidates[ci];candidates[ci]=candidates[cj];candidates[cj]=ct;
+    // 勝数差昇順でバケットを並べ、各バケット内をシャッフルしてフラット化
+    var diffs=[];
+    for(var dk in buckets){if(buckets.hasOwnProperty(dk))diffs.push(Number(dk));}
+    diffs.sort(function(a,b){return a-b;});
+    var candidates=[];
+    for(var di=0;di<diffs.length;di++){
+      var bucket=buckets[diffs[di]];
+      // Fisher-Yatesでバケット内をシャッフル
+      for(var bi=bucket.length-1;bi>0;bi--){
+        var bj=Math.floor(Math.random()*(bi+1));
+        var bt=bucket[bi];bucket[bi]=bucket[bj];bucket[bj]=bt;
+      }
+      for(var bk=0;bk<bucket.length;bk++)candidates.push(bucket[bk]);
     }
     for(var ci=0;ci<candidates.length;ci++){
```

---

## 5. 完了基準チェック

| 基準 | 状態 |
|---|---|
| P1-1 修正完了: 大会開始後・過去対局あり参加者の削除が禁止される | ✅ |
| P1-2 修正完了: 200回試行で同勝ち数優先が必ず守られる | ✅（同勝ち数で組めるケース 100 試行で全PASS。試行 200 のうち約100ケースは同勝ち数組合せ不可能なので除外集計） |
| 新規テスト `test_pairing_properties.js` 作成、4観点すべてPASS | ✅（PASS=7） |
| `bash test/run_tests.sh shogi_v4.html` → PASS | ✅（43/43） |
| `compare_render.js`, `compare_results.js`, `compare_modals_v2.js`, `test_tab_selection.js` → 全PASS | ✅ |
| ハッシュ差分は `generatePairing`, `removePlayer` のみ | ✅ |
| HANDOFF.md 更新（現在の状態 / 機能修正履歴 / 持ち越し項目） | ✅ |
| 報告書（このファイル）作成、対応表含む | ✅ |

---

## 6. やっていないこと・引っかかった点（正直ベース）

### 6-1. P2 系には一切手を付けていない

依頼書「P2系（今回スコープ外）」のとおり、以下は**そのまま**にした:

- `run_tests.sh` の Traceback 握り潰し問題
- `save()` の catch 握り潰し
- 賞金額の食い違い（アプリ7000円 vs index.html 14000円）
- 報告書入力欄が state に保存されない
- 「保存」ボタン文言の改善

### 6-2. `run_tests.sh` 実行時の Traceback について

`run_tests.sh` を本リポジトリ（`/Users/takahashikazuo/Documents/New project/shogi_handoff/`）で実行すると、第3層補足の `for f in /home/claude/test/data_*.json` 部分で `Traceback (most recent call last):` が出力される（ファイルが存在しないため）。これは P2 案件として依頼書で除外されているため**修正していない**。run_tests.sh の集計には影響せず PASS=43 / FAIL=0 で完走する。

### 6-3. テスト3「200回試行」の解釈について

依頼書「200回試行で全回成功」の文言は、test_pairing_properties.js 内では「乱数 seed を変えて 200 ケース生成し、そのうち**同勝ち数で組めるケース全てで全PASS**」という形に実装した（同勝ち数組合せ不可能なケースをスキップ）。実際に検証されたケースは 100 件で全PASS（FAIL=0）。サンプル数が文字通り 200 でなく 100 になった点を明示しておく。必要であれば seed 範囲を拡大して再検証可能。

### 6-4. Property test の sandbox 制限

`generatePairing` は内部で `save()` を呼ぶ。テスト用 sandbox は `localStorage` をモックしているため、`save()` の呼び出しは無害化される（throw なし）。`save()` の catch 握り潰し（P2案件）も間接的に効いており、本テストでは発覚しないことになる。これは P2 で別途対応されるべき。

### 6-5. `index.html` には触っていない

依頼内容は `shogi_v4.html` の P1 修正のみであり、`index.html` の賞金額不整合などは P2 スコープなので**触っていない**。

### 6-6. 修正前バックアップの取り扱い

作業中に `shogi_v4_before_p1.html` をプロジェクトルートに作成した。比較テストとレポートで使用したが、本番デプロイ時には**不要**なので、配布前に削除を推奨。

```bash
rm "shogi_v4_before_p1.html"
```

（本報告書では削除せず残置。髙橋さんの確認後に判断ください）

---

## 7. 修正後の流れ（依頼書より、進捗）

1. ✅ Claude Code Desktop で実装・自己テスト ← **本報告まで完了**
2. ⏳ 髙橋さんに報告
3. ⏳ Codex 再レビュー（フェーズ境界Codex必須ルール）で P1 修正の妥当性確認
4. ⏳ 髙橋さんが実機（スマホ）で動作確認
5. ⏳ 本番デプロイ

以上、よろしくお願いします。
