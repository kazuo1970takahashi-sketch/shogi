## STYLE-GUIDE-N5-DANGER-FACE-001: 通知分類に N5「止めた理由の提示」を追加し、danger の面色を §1 に登録

docs-only（`docs/STYLE-GUIDE.md` のみ・v1.1 → **v1.2**）。実装は1バイトも変えていない。

### なぜ

#881（対戦相手変更モーダルの入力エラー9件を native alert から画面内表示へ）の設計に反証パネルを当てたところ、
**正本に「操作を止めた理由を画面内で伝える」分類が無く、使える色も登録されていない**ことが分かった。

- §3 の4分類は N1=confirm / N2=成功 / N3=**注意（止めない・fail-soft を明記）** / N4=進行状況。
  #881 の9件は**すべて `return` で保存を拒否するハードブロック**で、どれにも当てはまらない
- N3 の warn 色を流用すると「止めない」の意味が反転し、**#884（選べるまま印を出す便）が使う枠を先に潰す**
- danger の面色として自然な `#a50e0e`/`#fdecea`/`#d93025` は `#storage-warn`（?v=55）で先に確立していたが
  **§1 の表に無く**、新規コンポーネントが「正本に無い色」を使う状態になっていた

§8-3「ガイド自体の変更は docs-only PR（作者承認必須）。実装スライスと混ぜない」に従い、
#881 の実装より**先に**この便を出す。

### 変更

| § | 変更 |
|---|---|
| 冒頭 | 改定履歴に v1.2 を追加 |
| §1 色 | **danger の面色**（`#a50e0e` 文字・`#fdecea` 地・`#d93025` 枠）を後追い登録。「danger は2段構え（文字・ボタンの `#A32D2D` と面の3色セット）」「以後これを唯一の danger 面色とする」を明記 |
| §3 | **4分類 → 5分類**。**N5「操作を止めた理由の提示（ハードブロック）」**を追加（発生元の画面内スロット・`role="alert"`・danger 面色・§4.3 の「次の行動を1つ」必須・**内部スクロールで本文を隠さない**） |
| §3.1（新設） | **N3 / N5 / info の使い分け**。色は severity だけを表し、「押した結果か／開いたときの状態か」は色で表さない。**まだ押していない段階で danger を出さない**。**色だけに意味を載せない**（D型色覚で文字色の色差 ΔE≈1.7＝識別閾未満まで縮むことを実測） |
| §3.2（新設） | **画面内スロットの置き場所**。`showMsg` は出し先が `#reg-msg` 固定でタブをまたぐと見えない（rect 0×0 を実測）。`showToast` はモーダル表示中に使わない（`body` 直下＝focus trap の `inert` の内側で AX ツリーから消える。`ignoredReasons:["inertElement"]` を実測） |
| §3 例外 | alert が正当なのは致命的事象のみ。**入力の間違い（選び直せば続行できるもの）は N5** と明記 |
| §9 | **M9**（`#storage-warn` の3色が §1 未登録だった → v1.2 で登録・class 化は M4 に含める）と **M10**（#881 の9件を N5 へ・候補ゼロ案内は info として据え置き）を追加。M1 の移行先に N5 を追記 |

### 根拠（すべて production `dccf0e0` = v140 の byte を実 Chromium で実測）

- `showMsg('…','warn')` を対局管理タブ＋モーダル表示中に呼ぶと `#reg-msg` に文字列は入るが
  祖先の `pane-reg` が `display:none` のため **rect 0×0 / inViewport false**
- `#app-toast` は `body` 直下。`openChangePairingModalFocus`（#877）が modal 以外の body 直下すべてに
  `inert` を付けるため、CDP の完全 AX ツリーで **`ignored:true / ignoredReasons:["inertElement"]`**。
  対照として `inert` を外すと `role:"status", ignored:false`
- danger 面色と warn 面色の色差（Viénot–Brettel–Mollon 変換）: 文字色 normal ΔE76 = 40.9 →
  **deuteranopia 1.7**（識別閾 ≈2.3 未満）、背景 8.7 → 6.6
- `#storage-warn` の3色は `shogi_v4.html` 全体で **1〜2回**（L527・L530）＝ここだけのインライン

### 検証

- `bash test/run_tests.sh shogi_v4.html` → **PASS=251 FAIL=0 WARN=0**（変更前と同数）
- `docs/STYLE-GUIDE.md` を読む検査2本（§4.1 用語辞書を参照）は無改変で緑:
  `test_bulk_entry_001.js` 121/0 ／ `test_master_sync_clarity_001.js` 70/0
- 実装ファイル（`shogi_v4.html` / `index.html` / `sw.js` / `app/`）は**1バイトも変更していない**
