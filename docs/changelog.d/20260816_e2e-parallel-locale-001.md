## E2E-PARALLEL-001: e2e ランナーと変異チェッカーの並列化＋テスト基盤の互換性2件

テスト基盤のみ（配信物・実装は無変更）。

### 何を変えたか

- `test/run_e2e.sh`: スイートと変異チェッカーを既定4並列で実行（`E2E_JOBS` で変更・`=1` で従来の直列）。出力はジョブ別に貯めて従来の順序で表示・各見出しに実測秒数
- `test/tools/chg_inline_error_881_mutation_check.sh` / `bulk_inline_error_887_mutation_check.sh`: 対照＋kill 実行を既定3並列で（`MUT_JOBS`）。判定ロジック・台帳・出力形式は無変更
- `test/run_tests.sh` / `test/run_e2e.sh`: locale が UTF-8 でない環境（cloud/CI の POSIX）で `C.UTF-8` を自動設定（Ruby の US-ASCII 偽 FAIL 対策・UTF-8 環境には触らない）
- bash 3.2 の「変数展開直後の全角文字」潜在3箇所を `${var}` 化（`run_tests.sh` / `test_auto_merge_gate_decision.sh` / `test_chg_inline_error_pins_881.sh`）

### 実測（cloud・同一 tree）

直列 約840秒 → 4並列 533秒 → チェッカー内部も並列で **286秒**（13/13 PASS・約3倍）
