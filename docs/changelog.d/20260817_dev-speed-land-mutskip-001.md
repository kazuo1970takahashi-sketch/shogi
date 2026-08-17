## LAND-BUNDLE-001 / E2E-MUT-SKIP-001: 段取り損失をなくす2本（受け渡し自動化・変異チェックの条件付き実行）

開発の段取りのみ（配信物 `shogi_v4.html` / `index.html` / `sw.js` / manual は**無変更**）。

2026-08-17 に #853（PR 起票→マージ 206分）を実測分解したところ、
**155分（75%）が工程の重さではなく段取りの損失**だった。その内訳の上位2つを潰す。

### 1. `scripts/land.sh` — bundle の受け渡しを自動化（実測 −95分/回 の想定）

cloud から GitHub への push は全遮断なので、変更は必ず作者の端末を経由する。
#853 ではこの受け渡しで3回失敗し**約95分**を捨てた（プレースホルダ混入・repo パス誤り・checkout 衝突）。

- 作者は**セッション開始時に1回 `bash scripts/land.sh` を起動しておくだけ**
- cowork が repo 直下に bundle を置くと、verify → 一時 ref へ fetch → `origin` へ push → `_landed/` へ退避 まで自動
- **作業ツリーには触らない**（checkout も merge もしない）＝作者が production 系や release 枝に居ても衝突しない
- 保護枝（`production` / 開発本流 / `main` / `master`）への push は既定で拒否
- 非 fast-forward は失敗として `.failed` に残し、復旧コマンドをそのまま出す。上書きは `<name>.bundle.force` を添えたときだけ（旧 SHA をログに残す）
- 起動時に既にあった `*.bundle` は対象外（過去の残骸を勝手に push しない）。`--include-existing` で対象化
- `--once` / `--dry-run` / `--repo <path>` / `POLL=` あり

### 2. `E2E-MUT-SKIP-001` — 変異チェックを毎回走らせない（実測 −236秒/回）

`run_e2e.sh` の総仕事量の 70%（484/687秒）が #881/#887 の動的変異チェックだが、
**#853 は chg-modal も bulk-edit も1行も触っていないのに4巡とも全部走っていた**。

変異チェックが実証しているのは「**その検査自身が変異を殺せるか**」だけで、
その値を決める入力は閉じている（チェッカー本体／変異ジェネレータ／e2e スイート／
**変異が当たる HTML 領域＋前後400字**／node・playwright 版）。
これを1個の sha256 に畳み、**前回 PASS 時と byte 単位で同一なら走らせない**。

- `test/tools/mutation_input_key.js`（鍵の生成）＋ `test/lib/mutation_cache.sh`（記録の読み書き）
- 記録は `.mutcache/`（**.gitignore 済み＝クリーン checkout に無い＝CI は必ずフル実行**）
- `MUT_FULL=1` でいつでも強制フル。`$CI` が非空なら鍵を作らない
- 記録するのは FAIL=0 で完走したときだけ。TTL 24時間。**ヒットしても mtime を延ばさない**
- skip は PASS と別に数える（見出しに【SKIP】・最終行に「PASS ＋ スキップ N 件」）。`MUTCACHE-SKIP` を合図に `run_e2e.sh` が集計

畳めない残余リスク（変異領域**以外**の HTML 変更で検査が弱まる場合）は
①素の e2e（対照）は常に走る ②CI は必ずフル実行 ③TTL の3つで受ける。
詳細は `test/tools/mutation_input_key.js` のヘッダに全部書いてある。

### 実測（cloud 2コア・同一 tree）

| | 所要 | 結果 |
|---|---|---|
| フル（キャッシュ無し） | **292秒** | 14/14 PASS |
| 変異と無関係な差分を入れて再実行 | **56秒** | 12/14 PASS ＋ スキップ2件 |

**1巡あたり −236秒。**#853 と同じ4巡なら約16分の短縮。
変異が当たる領域を触ったときは鍵が変わってフル実行に戻ることを実ファイルで確認済み。

### テスト

- `test/test_land_script_001.sh`（25件）— 使い捨て sandbox（bare repo を origin に見立てる・network 不使用）
- `test/test_mutation_cache_001.sh`（24件）— 架空の HTML/ジェネレータ/スイートで鍵の性質を固定（実ブラウザ不使用・数秒）
- `bash test/run_tests.sh shogi_v4.html` = PASS=256 / FAIL=0 / WARN=0
