# shogi A-4.2.1 hotfix revert Codex Gate Review 依頼

**作成日時**: 2026-05-07 19:06 JST
**対象 PR**: revert(a-4-2-1): 効かない event handler 変更を revert(真の原因は別レイヤー)
**ブランチ**: `revert/a-4-2-1-pp-add-btn-event`(main `a542821` 起点で revert)
**仕様書**: なし(revert 単独、運用上の即決判断)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge

---

## 1. revert 理由(背景)

A-4.2.1 hotfix(PR #19、commit `a542821`)は「event handler 戦略変更で iOS Safari 実機問題が治る」という前提だったが、**髙橋さんの実機 Web Inspector 観察で前提が誤りと判明**:

- `.pp-add-btn` の click event handler は **元々呼ばれていた**(handler 不在ではなかった)
- 髙橋さん報告「過去参加者から選ぶときにクラス A/B を選択できない」の真原因は **別レイヤー**:
  - **過去参加者パネルで既登録者の A/B ボタンが押せて、押すと `duplicate_member` で silent fail**
  - UX バグであり、handler 戦略変更では解消できない
- 真原因は **A-4.3 機能拡張(クラス変更 + マスタ表示)で別途対応** 予定

「**効かない修正を main に残さない**」原則に従い、本 PR で revert。

---

## 2. revert 内容

`git revert a542821 --no-edit` で `a542821` を inverse 適用:

- `shogi_v4.html`: A-4.2.1 hotfix で追加した `.pp-add-btn` の `mousedown` / `touchstart` / `click` 3 段 listener を削除、元の `click` 単独 listener に復元
- `docs/specs/20260507_1750_shogi_a_4_2_1_codex_review_prompt.md`: A-4.2.1 hotfix 用 Codex review request を削除(revert に含まれる)

### 変更ファイル(本 revert PR)

- `shogi_v4.html`(-19 / +1、A-4.2.1 hotfix の handler 変更を逆転)
- `docs/specs/20260507_1750_shogi_a_4_2_1_codex_review_prompt.md`(削除、139 行)
- `docs/specs/20260507_1906_shogi_a_4_2_1_revert_codex_review_prompt.md`(本 review request、新規)

---

## 3. 受け入れ条件 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | revert clean(マージ conflict なし) | `git revert a542821 --no-edit` | ✅ clean revert(`eef3e33`) |
| 2 | production が `890c2a1`(A-4.2.1 適用前)と完全一致 | `git diff 890c2a1..HEAD -- shogi_v4.html \| wc -l` | ✅ **0**(完全一致) |
| 3 | 既存 465 件緑維持 | `npx playwright test` | ✅ **465 passed** |
| 4 | 単体 50 件緑維持 | `npm test` | ✅ **PASS=50** |

---

## 4. 実装上の判断ポイント(Codex の論点候補)

### 4.1 revert の clean 性

`a542821`(A-4.2.1 squash merge commit)を起点 `890c2a1` から fast-forward した状態で `git revert a542821` を実行。conflict なし。

`git diff 890c2a1..HEAD` は **shogi_v4.html を含めて全 0**(本 revert PR の Codex review request md を除く)。即ち、production 状態は A-4.2.1 hotfix 適用前と byte-for-byte 等価。

### 4.2 既存 e2e 緑維持の根拠

A-4.2.1 hotfix は handler 種別変更のみで JS ロジックは無変更だったため、revert でも JS ロジックは無変更のまま戻る。Playwright `.click()` は元の `click` 単独 listener でも安定動作するため、465 件緑維持。

### 4.3 A-T フェーズの 3 層 regression 防止層への影響

A-T で構築した:
- L1: 構造的 e2e(Stage 2a/2b/2c)
- L2: Mutation 監視(Stage 4)
- L3: Visual regression(Stage 6)

すべて **無変更**。本 revert は production 修正の取り消しのみで、テスト基盤は触らない。

### 4.4 「効かない修正を main に残さない」原則

A-4.2.1 hotfix は当初「実機根本治癒」と宣言したが、髙橋さんの実機 Web Inspector で前提崩しが判明。**前提崩しが確定した修正を main に残すと将来の混乱要因になる**ため、即座に revert する運用判断。

memory「PoC 速度優先」「技術選定は利用者最適で随時見直し」整合。

### 4.5 真原因への対応(A-4.3 申し送り)

真原因「過去参加者パネルで既登録者の A/B ボタン押下時の duplicate_member silent fail」は **A-4.3 機能拡張(クラス変更 + マスタ表示)**で対応予定。本 revert は A-4.3 着手の前提を整える(誤った修正の removal)。

A-4.3 では:
- 既登録者の A/B ボタンを押せないように disabled にする(UI レベル)
- もしくは既登録者の押下で「現在のクラス → 別クラス変更」フローに遷移する(機能拡張)

これらは本 revert PR のスコープ外、別 PR で対応。

---

## 5. コミット履歴

```
eef3e33 Revert "fix(a-4-2-1): A-4.2 hotfix - pp-add-btn を mousedown + touchstart 化 (#19)"
a542821 fix(a-4-2-1): A-4.2 hotfix - pp-add-btn を mousedown + touchstart 化 (#19)
890c2a1 feat(stage-8): A-T フェーズ区切り総括 + 完了レポート (#18)
```

revert 単一 commit + 本 review request commit。

---

## 6. Codex への確認依頼

下記 4 観点を A 判定基準として独立検証をお願いします。

1. **revert clean**: `git revert a542821` が conflict なく適用され、`eef3e33` として 1 commit に集約されているか
2. **production が 890c2a1 と完全一致**: `git diff 890c2a1..HEAD -- shogi_v4.html` が 0 行
3. **既存 e2e 緑維持**: 465 e2e + 50 unit すべて緑、A-4.2 回帰 unit test も緑(本 revert で test 基盤に影響なし)
4. **A-T フェーズ 3 層 regression 防止層が無変更**: L1/L2/L3 すべて触らず、本 revert は production 修正の取り消しのみ

**特に注視してほしい点**:
- revert 判断の妥当性(handler が元々呼ばれていたという髙橋さんの実機観察を真として、A-4.2.1 hotfix が「効かない修正」だった結論)
- A-4.3 申し送りの方針が現実的か(UI disabled or クラス変更フロー化、本 revert PR のスコープ外であることが明確か)
- 「効かない修正を main に残さない」運用原則が memory「PoC 速度優先」「dislike waste」と整合しているか

判定 A 以上であれば squash merge → main 同期 → A-4.2.1 hotfix 完全 rollback → A-4.3 着手準備完了。
