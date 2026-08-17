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

### Codex レビューで塞いだクラス（PR #899・1巡目 P1×4/P2×2 → 2巡目 P1×5/P2×8）

指摘を**クラス単位**で潰し、同型の未指摘も一緒に塞いだ。

| クラス | 直し |
|---|---|
| A 実行環境の同一性 | 鍵に `platform/arch`・**実 Chromium のパス**（build revision 入り）・`TZ`・`LC_ALL/LANG` を追加。鍵の書式版 v1→v2。同じ checkout を別 OS で共有しても取り違えない |
| B 観測と作用の間に変わる | force push を `--force-with-lease=<ref>:<観測値>` に。**verify → fetch の間に bundle が差し替わっていないか**（size＋mtime）も追加 |
| C 残骸の持ち越し | 失敗時に `.force` を `.force.failed` へ隔離。**孤児マーカー**を警告。失敗ごとに `refs/land/failed/<bundle名>` の不変 ref を残し、**復旧コマンドは確定 SHA**を指す |
| D 時計・数値の異常 | age が負（未来）／`date` 異常／**TTL が非数値**（`[ -ge ]` がエラーで偽を返し**ヒット側へ落ちていた**）／**TTL の桁あふれ**を全部 fail closed |
| E 検査が結線を測っていない | grep を捨て、①架空チェッカー ②本物のチェッカー ③`run_e2e.sh` 本体、の3層で実測 |
| F 記録の真正性 | TTL の基準を **mtime から記録の中身の epoch へ**（`cp` で復元しても延びない）。旧書式は fail closed。**保存の直前に鍵を作り直し**、開始時と一致したときだけ記録（検査中に入力が変わった実行を保存しない） |
| G 取り違え | 処理対象を**専用名へ claim** してから触る。置き直された修正版を未処理のまま退避しない／verify→push の間に中身が差し替わらない／同名の置き直しも普通に処理される |
| H 残す痕跡 | `--dry-run` は ref を1本も作らない／`--once` は失敗があれば非0／Ctrl-C 後は新しい push を始めない／失敗は `_landed/failed/` に**試行ごと一意名**＋`refs/land/failed/<sha>`／隔離名も `.gitignore`／`origin` URL の userinfo をマスク（PAT をログに残さない）／鍵生成の失敗経路でも tmp を掃除 |
| I 引数の受け渡し | `--extra` を文字列連結ではなく**配列**で渡す（**パスに空白がある macOS 環境**でキャッシュが一度も効かなくなるのを防ぐ） |

### 実測（cloud 2コア・同一 tree）

| | 所要 | 結果 |
|---|---|---|
| フル（キャッシュ無し） | **312秒** | 14/14 PASS |
| 変異と無関係な差分を入れて再実行 | **58秒** | 12/14 PASS ＋ スキップ2件 |

**1巡あたり −254秒。**#853 と同じ4巡なら約16分の短縮。
変異が当たる領域を触ったときは鍵が変わってフル実行に戻ることを実ファイルで確認済み。

### テスト

- `test/test_land_script_001.sh`（**39件**）— 使い捨て sandbox（bare repo を origin に見立てる・network 不使用）
- `test/test_mutation_cache_001.sh`（**54件**）— 鍵の性質に加え、**結線そのものを動かす3層**:
  ①架空チェッカーに本物の lib を source させて実行（初回=実行／2回目=skip／入力変更=再実行／失敗は記録しない／CI・`MUT_FULL=1` は必ず実行）
  ②**本物のチェッカー2本**を鍵を先に記録した状態で起動し、数秒で `MUTCACHE-SKIP` を出すことを実測（結線が切れていれば時間切れで赤）
  ③**`run_e2e.sh` そのもの**を sandbox で走らせ、合図あり／なしの両方向で集計を実測（`node` は PATH stub）
- `bash test/run_tests.sh shogi_v4.html` = PASS=256 / FAIL=0 / WARN=0
