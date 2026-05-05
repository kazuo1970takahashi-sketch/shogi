# Claude Code キックオフ：A-T Stage 1（既存272件の偽陽性検証）

**作成日時**: 2026-05-05 20:46 JST
**前提**: ChatGPT レビュー A / A- 判定取得後に着手
**仕様書**: `docs/specs/20260505_2046_shogi_at_spec_v1.md`

---

## ミッション

A-4.2（PR#9）でマージされた A/B クラスボタンが実機・PC ともに動かないにもかかわらず、e2e 272 件・単体 595 件・Codex・ChatGPT のいずれもこのバグを検出できなかった。

**Stage 1 のゴール**：「なぜ既存テストがこのバグを見逃したか」を**実証ベースで特定**し、報告書として `docs/specs/` に commit する。次の Stage 2（`expectClickable` ヘルパ実装）の根拠資料となる。

---

## ブランチ作成と着手

```bash
cd ~/AI_Workspace/shogi
git checkout main && git pull
git checkout -b feat/phase-a-t-test-hardening

# 仕様書一式を docs/specs/ に配置（Claude.ai から受領済みの 4 ファイル）
# - 20260505_2046_shogi_at_spec_v1.md
# - 20260505_2046_shogi_at_chatgpt_review_prompt.md
# - 20260505_2046_shogi_at_claude_code_kickoff.md
# - 20260505_2046_shogi_at_codex_review_prompt.md

git add docs/specs/20260505_2046_shogi_at_*.md
git commit -m "docs(a-t): A-T 仕様書 v1 + 4者依頼文一式を追加

- UI テスト基盤強化フェーズの仕様書本体
- ChatGPT レビュー依頼プロンプト
- Claude Code Stage 1 キックオフ
- Codex フェーズ境界レビュー依頼"

git push -u origin feat/phase-a-t-test-hardening
```

push 完了後、ChatGPT レビュー依頼を実行（コピペ1回）。

---

## Stage 1 の作業内容

### Task 1.1：既存 e2e テストの実態調査

```bash
# A-4.2 関連の e2e テストファイルを完全把握
ls -la test/e2e/
wc -l test/e2e/*.spec.js

# A/B ボタンを click している箇所の詳細
grep -nE "pp-add-btn|suggest-add-btn" test/e2e/shogi_app_a4_2.spec.js
grep -nE "\.click\(|page\.click|locator.*click" test/e2e/shogi_app_a4_2.spec.js

# force click が使われていないか
grep -rn "force.*true\|{ force: true }" test/e2e/

# dispatchEvent / 直接 evaluate でクリックを偽装している箇所
grep -rn "dispatchEvent\|evaluate.*click" test/e2e/
```

### Task 1.2：A-4.2 リグレッションを e2e が検出できなかった原因の特定

仮説リストを順に検証：

| # | 仮説 | 検証方法 |
|---|------|---------|
| H1 | `force: true` で `pointer-events: none` を無視してクリックしている | grep で確認 |
| H2 | `evaluate(el => el.click())` で DOM から直接 click() を呼んでいる | 同上 |
| H3 | DOM 上のボタンを click せず、関数 `addPlayerFromMaster` を直接呼んでアサートしている | テストコード精読 |
| H4 | playwright の selector が実 DOM とズレており、silent fail で pass している | strict mode 設定確認 |
| H5 | クリック後の検証が「想定通りの DOM 変化」ではなく「関数が呼ばれた」だけで終わっている | アサート内容を精読 |
| H6 | テスト用 fixture が実際の last_class ハイライト分岐を通っていない | fixture 内容確認 |

### Task 1.3：A/B ボタンが実際に押せない原因の特定（実装側）

```bash
# pp-add-btn の生成箇所すべて
grep -n "pp-add-btn" shogi_v4.html

# CSS 側で pp-add-btn または pp-add-btn-highlight に効いている指定
grep -nB2 -A8 "\.pp-add-btn" shogi_v4.html | head -80

# ハイライト適用ロジック
grep -nB2 -A5 "pp-add-btn-highlight" shogi_v4.html
```

特に確認：
- `.pp-add-btn-highlight` に `pointer-events: none` が指定されていないか
- 親要素（行）で `pointer-events: none` を継承していないか
- z-index やフッター固定要素のオーバーレイ
- A-4.2 PR#9 でレイアウトをいじった diff（`git log --oneline | head -20` から該当 commit を特定して `git show`）

### Task 1.4：Stage 1 報告書の作成

以下を `docs/specs/20260505_HHMM_shogi_at_stage1_report.md` として作成（HHMM は調査完了時の JST）：

#### 報告書テンプレート

```markdown
# A-T Stage 1 報告書：既存272件の偽陽性検証結果

**作成日時**: YYYY-MM-DD HH:MM JST
**対象**: shogi_v4 e2e 272 件 / 単体 595 件
**目的**: A-4.2 リグレッションを既存テストが検出できなかった原因の特定

## 1. A-4.2 バグの実装側の原因（最終特定）

- 直接原因：（CSS or DOM or イベントバインドの具体箇所）
- 該当行：shogi_v4.html L????
- A-4.2 PR#9 のどの diff で混入したか：commit XXX

## 2. e2e 272 件が検出できなかった原因

検証した 6 仮説の結果：

| # | 仮説 | 結果 | 該当箇所 |
|---|------|------|---------|
| H1 | force: true 利用 | ✓/✗ | …… |
| H2 | evaluate 経由 click | ✓/✗ | …… |
| H3 | 関数直接呼び出し | ✓/✗ | …… |
| H4 | selector ズレ silent fail | ✓/✗ | …… |
| H5 | アサート不足 | ✓/✗ | …… |
| H6 | fixture が分岐通過せず | ✓/✗ | …… |

主要因：H?
副要因：H? + H?

## 3. 偽陽性に分類されるテスト一覧

| ファイル | 行 | 偽陽性の理由 |
|---------|----|------------|
| …… | …… | …… |

合計：N 件 / 272 件中

## 4. Stage 2 への申し送り事項

- expectClickable ヘルパで対処すべき偽陽性パターン
- 書き直しが必要なテストの優先度
- 既存テスト名・selector の互換性保持可否

## 5. A-4.2 修正の見通し（Stage 4 で着手）

- 修正規模：（行数・箇所数）
- 修正方針：（CSS 修正 / DOM 構造変更 / イベントバインド改修）
- A-4.2.1 hotfix として独立 PR にすべきか、A-T 内で同梱するか
```

### Task 1.5：commit & push

```bash
git add docs/specs/20260505_HHMM_shogi_at_stage1_report.md
git commit -m "docs(a-t): Stage 1 報告書 - 既存272件の偽陽性検証結果

- A-4.2 リグレッションの実装側原因特定
- e2e 272 件のうち偽陽性 N 件を分類
- Stage 2 (expectClickable) への申し送り事項記録"

git push
```

---

## Stage 1 完了報告フォーマット（Claude.ai に返す内容）

以下をチャットで返してください：

```
## A-T Stage 1 完了報告

### A-4.2 バグの直接原因
（1〜3 行）

### 既存 e2e が検出できなかった主要因
（仮説 H? が該当、3〜5 行で説明）

### 偽陽性テスト件数
N 件 / 272 件

### Stage 2 着手前に確認したい論点
（あれば箇条書き、なければ「なし」）

### 報告書ファイルパス
docs/specs/20260505_HHMM_shogi_at_stage1_report.md
```

これを受けて Claude.ai が次の Stage 2 着手判断を出します。

---

## 重要な禁止事項

1. **Stage 1 では実装側のバグ修正を行わない**（特定するだけ）
2. **既存テストを書き換えない**（Stage 2 で一括書き換え）
3. **新規テストを追加しない**（Stage 4 まで待つ）
4. **shogi_v4.html のロジックに触らない**

A-T は「検出基盤を整える」フェーズ。修正欲求を抑えて調査と記録に徹する。

---

## トラブル時の対応

- 仮説検証で結論が出ない → 仮説を追加して再調査、報告書に記録
- 偽陽性の定義が曖昧で線引き困難 → Claude.ai に判断を投げる
- 6 仮説以外に原因が見えた → 報告書に「H7 新規仮説」として追記
- A-4.2 PR#9 の diff が大きすぎて特定困難 → 二分探索（git bisect）で commit 単位に絞り込む

---

**Stage 1 着手は ChatGPT レビュー A / A- 判定後**。それまでは仕様書 push までで停止。
