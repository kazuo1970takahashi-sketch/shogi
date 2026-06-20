# PIPELINE-V2-PROPAGATE-001 実装結果ノート（#264 / PMO-OPS v2.1-final 反映）

発行: Claude Code（実装ライン） / 2026-06-20 / Issue #264（HOLD 解除・v2.1-final 反映指示 コメント 4757445184）

## 目的
AI 開発パイプラインの合意（PMO-OPS v2.1-final）を**実装ラインが必ず読む場所＝repo 内**に正本配置し、テンプレで構造的に携えさせ、ラベルで状態を一意化して、書き戻しループ消失・ラベルずれ・孤児レビューのドリフト再発を断つ。

## 成果物（base = orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `626bab2`）
1. **正本ドキュメント `docs/ai-ops/`（新規・1か所に収束）**
   - `AI-DEV-PIPELINE.md` — 工程・状態機械（`stage:`）・結果書き戻しプロトコル・**凍結マーカー（§3-1）**・単一ライター reconciler・drift detector・移行対応表（**cut over は reconciler 稼働後**）・§8-3 v2.1-final 4条件。
   - `AGENT-ROLES-AND-SOD.md` — SoD G1〜G6・L0–L4 レビュー要否・**§5 役割境界（継続監視/定期実行は scheduled actor／起動駆動・自律ポーリング不可）**・**§6 レビュアー SPOF escalation**。
   - `CODEX-RESULT-PROTOCOL.md`（repo 版）— 凍結 YAML enum＋Codex ネイティブ形式（P0–P3/👍）の判定変換。
2. **テンプレで強制（周知 by construction）**
   - `.github/pull_request_template.md` — 書き戻しプロトコル・stage 定義・**凍結マーカー雛形**・構造化フィールド（`related_pr`/`supersedes`/`superseded_by`/`canonical_decision`）・**レビュアー素性欄**。
   - `.github/ISSUE_TEMPLATE/cowork-dispatch.md`（新規）— 同上＋トリアージ枠。
3. **必読リンク** — `CLAUDE.md`（新規・実装着手前に必読の anchor）＋ `HANDOFF.md` 冒頭に必読リンクを追加。
4. **ラベル作成（作成のみ・張替えはしない）** — `stage:`×11 / `flag:`×5 / `closed:`×4 = 20 を `gh label create`。移行対応表は docs に明記。**既存ラベル（needs-codex 等）からの cut over はしない**（reconciler 稼働後に一括・v2.1-final 条件2）。
5. **テスト掃除（L2）** — `test/run_tests.sh` が参照していた**実在しない外部 .js テスト 35 本**（`test_report_ux_001.js`/`test_report_ux_003.js` ほか）の `if [ -f … ] … warn` 参照を登録解除。**baseline WARN=35→0**（PASS/FAIL は 73/0 で不変）。

## v2.1-final 4条件の織り込み（必須）
1. **マーカー文法の凍結（唯一の実装 must）**: `verdict` を**小文字 ASCII `go | conditional-go | block`** に固定、キー固定、1コメント1ブロック、最新優先。`AI-DEV-PIPELINE.md §3-1` を唯一の正本とし、`.github/` テンプレと `CODEX-RESULT-PROTOCOL.md` を同 enum に統一。旧 `判定: GO`/`verdict: GO` は人間可読の併記としてのみ許容（機械判定の正ではない）。
2. **空振り期間の回避**: `§7` 移行対応表に「**cut over は reconciler（scheduled actor）稼働後**・それまでは cowork が既存ラベルで手動 reconcile」を明記。本 PR はラベル**作成のみ**。
3. **レビュアー SPOF の手当て**: `AGENT-ROLES-AND-SOD.md §6` に「review SLA 超過 → 人間レビュー or 代替レビュアーへ escalation／無回答 default=前進させない（安全側）」を明記。
4. **役割境界（capability を仮定しない）**: `AGENT-ROLES-AND-SOD.md §5` に「継続監視・定期実行・ゼロ記憶監査の定例化は scheduled actor の担当／Claude Code・Codex は起動駆動・自律ポーリングしない」を明記。

## スコープ収束（#268 との重複解消）
- 設計レビュー用 PR #268 は `docs/pmo/AI-DEV-PIPELINE-v2.md` に正本を置いていた。本 #264 の正本配置は **`docs/ai-ops/AI-DEV-PIPELINE.md`**（#264 指定）。**置き場所を `docs/ai-ops/` の1か所に収束**させた。
- 本 PR は base = orphan clean base から切り、`docs/pmo/` には**触れない**（#268 のファイルを取り込まない＝二重管理を作らない）。**#268 は本 PR に supersede されるため `closed:superseded` でのクローズを推奨**（クローズは人間操作。本環境では `gh pr close` 不可のため未実行）。`docs/ai-ops/AI-DEV-PIPELINE.md` は §8-3 を含む v2.1-final 全文を内包し、#268 の内容を機能的に包含する。

## 検証
- `bash test/run_tests.sh shogi_v4.html` … **PASS=73 / FAIL=0 / WARN=0**（baseline 73/0/**35** から WARN のみ 0 へ・回帰なし）。
- `bash -n test/run_tests.sh` … 構文 OK。残存 `if [ -f test_*.js ]` ブロック = 26（実在する present テストのみ）。
- `shogi_v4.html` / `index.html` … **無改変**（当日運営不変）。

## 制約（遵守）
追加/最小改変中心・`shogi_v4.html` 当日運営は無改変・**Draft PR で停止**（Ready化/merge/squash/branch削除/production は人間の明示承認まで未実施）・secret/実データ不使用。
