# FRP-IMPL-004 完了レビュー / 手動確認メモ

| 項目 | 内容 |
|---|---|
| 日付 | 2026-06-18 |
| 対象 | FRP-IMPL-004 保存復元堅牢化 + 再生成ボタン制御 |
| base branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` |
| base SHA | `efdfa29c74d0ec2ea47fcbdf80c9d329acd85e6d` |
| 対象 PR | [#231](https://github.com/kazuo1970takahashi-sketch/shogi/pull/231) / [#232](https://github.com/kazuo1970takahashi-sketch/shogi/pull/232) / [#233](https://github.com/kazuo1970takahashi-sketch/shogi/pull/233) |
| 種別 | docs-only 完了レビュー。`shogi_v4.html` / `test/` の実装変更なし |

## 目的

FRP-IMPL-004 の目的は、FRP append で作成した 1 局目の部分手合いについて、保存復元の不変条件をテストで固定し、通常操作から既存手合いを破壊しやすい「組み合わせを再生成」経路を UI gate で保護することだった。

FRP append の保存構造は、既に `{p1,p2,winner,lastModifiedBy}` の正準 match と、保存しない leftover 派生で成立している。そのため 004 の主眼は新しい保存スキーマ追加ではなく、既存構造の安全性を明文化し、reload と再生成 UI の回帰を防ぐことに置いた。

## 完了内容

| PR | 内容 | 状態 |
|---|---|---|
| [#231 FRP-IMPL-004-DESIGN](https://github.com/kazuo1970takahashi-sketch/shogi/pull/231) | 保存復元堅牢化、再生成ボタン gate、004A/B/C 分割の設計を docs-only で追加。match-level に `round` / `table` / `source` / `generatedBy` を持たないこと、leftover は保存しないこと、`generatePairing` 本体を変えないことを整理。 | merged |
| [#232 FRP-IMPL-004A](https://github.com/kazuo1970takahashi-sketch/shogi/pull/232) | FRP append 手合いの保存復元 reload テストを追加。`shogi_v4.html` は無変更。 | merged |
| [#233 FRP-IMPL-004B](https://github.com/kazuo1970takahashi-sketch/shogi/pull/233) | `shouldShowRegenerateButton(cls)` と `repairBtn_` 出力 gate を追加し、部分手合い組成中の再生成ボタンを非表示化。初回 round 再生成 confirm を最小限強化。 | merged |

## 004A で固定した保存復元の不変条件

004A は保存スキーマを増やさず、append 済み `pairings` が reload 後も同じ意味で復元されることを固定した。

- append 済み `pairings[cls]` の組数と順序が保持される。
- 各 match の `p1` / `p2` が保持される。
- FRP append match の `winner:null` が保持される。
- FRP append match の `lastModifiedBy:'auto'` が保持される。
- `results[cls]` は FRP append で変更されず、reload 後も維持される。
- `players[cls]` の `id` / `name` / `entry_no` が reload 後の派生計算に使える形で保持される。
- leftover / 未割当者は保存値ではなく、`players - pairings(p1/p2)` から再派生される。
- match-level の `round` / `table` / `source` / `generatedBy` / `leftover` は保存しない。
- 卓番号は `pairings` の index+1、round は `results.length+1` の描画派生であり、保存フィールドではない。
- A/B クラスの `pairings` / `results` / 未割当派生が混線しない。
- `results` 空の初回 round 状態でも、保存復元で `pairings` が消えない。

## 004B の再生成ボタン gate

004B は「部分手合い組成中に通常操作で既存手合いを壊さない」ための UI gate を追加した。対象は `repairBtn_{cls}` の出力であり、`submitBtn_{cls}`、勝敗入力、通常の確定操作は gate 対象ではない。

`shouldShowRegenerateButton(cls)` の predicate は次の通り。

```js
function shouldShowRegenerateButton(cls){
  if(!isClassStarted(cls))return true;
  var results=(state&&state.results&&state.results[cls])||[];
  if(results.length!==0)return true;
  var pairings=(state&&state.pairings&&state.pairings[cls])||[];
  if(pairings.length===0)return true;
  if(getUnassignedFirstRoundPlayers(cls).length===0)return true;
  return false;
}
```

つまり、以下 4 条件がすべて真のときだけ `false` を返し、再生成ボタンを非表示にする。

| 条件 | 意味 |
|---|---|
| `isClassStarted(cls)` | クラスの 1 局目運用が開始済み |
| `state.results[cls].length === 0` | まだ 1 round も確定していない |
| `state.pairings[cls].length > 0` | すでに append 済み手合いがある |
| `getUnassignedFirstRoundPlayers(cls).length > 0` | 未割当者が残っている |

この状態が「初回 round の部分手合い組成中」。ここでは `repairBtn_` を HTML に出さないため、通常 DOM 上に click bind 対象も存在しない。

## 未割当0を非表示条件に含めない理由

未割当0の状態では、「FRP append の結果として全員がペア済みになった状態」と「通常開始で全員ペアリングした round1」を、現行 state だけでは識別できない。

- match-level に `source` / `generatedBy` / start source のような保存メタ情報は存在しない。
- 今回も match スキーマ拡張や保存メタ情報追加はしない。
- `sanitizeMatch` の正準形は `{p1,p2,winner,lastModifiedBy}` の 4 つであり、未知フィールド追加は reload で剥がれる。
- 通常開始 round1 の再シャッフル用途は既存運用として残す必要がある。

そのため、未割当0では由来を問わず再生成ボタンを表示してよい。ただし results 空かつ pairings ありの初回 round では、押下時に「現在の組み合わせを作り直す / 今ある手合いが破棄される」趣旨の confirm を出す。

## `generatePairing` 本体は不変

004B では `generatePairing` 本体を変更していない。`state.pairings[cls]=pairs` により、そのクラスの現在 pairings を全員上書きする性質は従来どおり。

UI gate は通常操作の保護であり、汎用 mutate 関数への FRP 判定追加ではない。したがって、コンソール、テスト、または別コードから直接 `generatePairing(cls)` を呼べば、現在の `pairings[cls]` は上書きされ得る。この点は 004B のスコープでは許容し、通常の運営画面操作で破壊しないことを優先している。

## 004C の判断

004A/B で主要安全価値は入っているため、004C は急がない判断でよい。特に、実機で運営画面を触る前に説明文を増やすと、かえって文言過多になりやすい。

004C に進む場合の最小方針は次の通り。

- 実機確認後に、運営者が迷った箇所だけに絞って文言を補う。
- 再生成 confirm の大筋は 004B のまま維持し、全文固定テストは増やさない。
- UI 文言変更のみを対象にし、`generatePairing` / 保存スキーマ / append ロジックには触れない。
- 変更する場合も docs と手動確認結果に基づく小 PR にする。

## 手動確認シナリオ

### A. 部分手合い組成中・未割当あり

目的: 未割当者が残っている初回 round の部分手合い組成中に、再生成ボタンが通常操作から消えていることを確認する。

1. AクラスまたはBクラスで FRP append により一部ペアだけ作る。
2. 未割当者が残っている状態にする。
3. 現在の組み合わせ表示で「組み合わせを再生成」ボタンが出ないことを確認する。
4. `submit` / 勝敗入力など他の操作が壊れていないことを確認する。

### B. 未割当0の初回 round

目的: 未割当0では再生成ボタンを表示し、押下時に破棄 confirm で保護することを確認する。

1. 全員がペア済みで未割当0の状態にする。
2. 「組み合わせを再生成」ボタンが表示されることを確認する。
3. 押下時に、現在の組み合わせを作り直す / 今ある手合いが破棄される趣旨の confirm が出ることを確認する。
4. cancel した場合、保存・再生成されないことを確認する。
5. OK した場合、従来どおり再生成されることを確認する。

### C. 勝敗入力済み

目的: winner 入力済みの既存保護 confirm が、初回 round の作り直し confirm より優先されることを確認する。

1. winner 入力済みの状態で再生成しようとする。
2. 既存の勝敗入力済み保護 confirm が優先されることを確認する。
3. cancel した場合、勝敗・pairings が保存変更されないことを確認する。

### D. A/B クラス独立

目的: gate と再生成操作が `cls` スコープで閉じ、別クラスを壊さないことを確認する。

1. A が部分手合い組成中で再生成ボタン非表示でも、B の通常開始・未割当0状態では B の再生成ボタンが表示されることを確認する。
2. B 側の操作で A の `pairings` / `results` が壊れないことを確認する。
3. 逆方向も必要に応じて確認する。

### E. reload / 保存復元

目的: 004A の保存復元不変条件を運営画面上でも確認する。

1. FRP append 後に保存・reload しても `pairings` が残ることを確認する。
2. `winner:null` / `lastModifiedBy:auto` が保持されることを確認する。
3. leftover は保存値ではなく再派生されることを確認する。
4. 未割当一覧が reload 後も `players - pairings(p1/p2)` として同じ参加者を示すことを確認する。

## 残 Nice to Have

- B9 heuristic を将来 `test_frp_impl_004b.js` の構造テストへ寄せる。
- `sanitizeMatch` 正準形の `Object.keys()` 完全一致テストを追加する。
- winner 入力済み match / `lastModifiedBy:'manual'` / results 非空 reload 後の append ブロックを追加で固定する。
- 004C の UI 文言は、実機確認後に必要なら最小限で実施する。

## 完了レビュー結論

FRP-IMPL-004A/B により、保存復元と通常 UI 上の再生成 gate は主要な安全ラインを満たしている。004C は「実機で見てから必要最小限」がよく、現時点では production 反映前の手動確認を優先する。

本メモは docs-only であり、`shogi_v4.html` / `test/` / `test/run_tests.sh` / `index.html` / `package*` / `.github` には触れない。
