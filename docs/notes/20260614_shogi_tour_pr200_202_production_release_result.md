# SHOGI-TOUR PR #200 / #201 / #202 production 反映 完了記録

- 作成日: 2026-06-14
- 対象リポジトリ: kazuo1970takahashi-sketch/shogi
- 種別: docs-only 完了記録（実装変更なし）
- 派生元: main = `1940fc1`（PR #201 squash merge 後）

## 1. 概要

PR #200 の成果（スマホ星取表ビュー公開 / 報告書PDFのFAX文言削除 / PDFファイル名改善）が、
PR #201 経由で `main` に file 単位で採用され、PR #202 で production / GitHub Pages 公開版まで
反映された。本書はその完了記録（docs-only / 実装・production には一切触れていない）。

## 2. 各 PR の役割と commit SHA

| PR | 役割 | merge/squash commit SHA | base / target | commit 日時 (JST) |
|----|------|--------------------------|----------------|--------------------|
| #200 | feature を orphan clean base へ merge | `212231b231a22968a087119bf65b89f6e11267b5` | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` | 2026-06-14 20:25:04 |
| #201 | `main` へ file 単位 adopt / squash merge | `1940fc165be9b5ae113960f842bd979c615536d7` | `main` | 2026-06-14 22:20:27 |
| #202 | production release / GitHub Pages 公開反映 | `d8d5db1cc10240ba04f37f11e98787b7491417b5` | `production` | 2026-06-14 22:42:42 |

補足（topology、`git show -s` で確認）:

- PR #200 merge `212231b` の親 = `7e30119`（clean base tip）+ `24296c5`（`feature/shogi-tour-live-mobile-scoreboard-001` tip）。`212231b` は `origin/chore/shogi-tour-apphq-003h-2d-orphan-clean-base` に含まれる。
- PR #201 squash `1940fc1` の親 = `85b90f8`（単一親 = `main` への squash）。**現 `origin/main` HEAD = `1940fc1`**。
- PR #202 merge `d8d5db1` の親 = `ea9eb32`（直前の production HEAD）+ `64117a6`（release branch tip）。**現 `origin/production` HEAD = `d8d5db1`**。
- PR #202 の head branch 名は `release/shogi-tour-pr201-main-1940fc1-to-production`（PR #201 の main commit `1940fc1` を production へ載せた、という系譜を名前に内包）。

## 3. 反映経路（clean base → main → production）

```
feature/shogi-tour-live-mobile-scoreboard-001 (tip 24296c5)
  └─[PR #200 merge 212231b]→ chore/shogi-tour-apphq-003h-2d-orphan-clean-base
       └─[PR #201 squash 1940fc1]→ main (85b90f8 → 1940fc1)
            └─[PR #202 merge d8d5db1]→ production (ea9eb32 → d8d5db1) = GitHub Pages 公開元
```

- clean base は `main` と共有履歴を持たない orphan のため、`main` へは file 単位 adopt（PR #201, squash）で取り込む運用。
- production は公開専用ブランチ。`main` の commit を直接 fast-forward せず、release branch を切って `--base production` で載せる運用。

## 4. production release 完了日時

**2026-06-14 22:42:42 JST**（PR #202 merge commit `d8d5db1` の commit 日時）。

## 5. 公開URL 確認結果

- 公開URL（root）: <https://kazuo1970takahashi-sketch.github.io/shogi/> → **HTTP 200**
- アプリ本体: <https://kazuo1970takahashi-sketch.github.io/shogi/shogi_v4.html> → **HTTP 200**
- Pages source: `production:/`（production ブランチのルート）
- **byte-identical 検証**: 公開中の `shogi_v4.html` が production HEAD `d8d5db1:shogi_v4.html` と差分なし（`diff` 一致）。公開版 = production HEAD であることを確定。
- 公開ファイル内に反映内容の feature marker が存在することを確認:
  - `LIVE-MOBILE-SCOREBOARD-001`（スマホ星取表ビュー）
  - `scoreboard-view`（星取表ビュー DOM）
  - `REPORT-UX-007A`（FAX削除対応）
  - `buildSafePdfFilename`（PDFファイル名生成）

## 6. production tree の構成確認

production HEAD `d8d5db1` の recursive tree = **以下の 2 ファイルのみ**:

- `index.html`
- `shogi_v4.html`

test / docs / fixture / `.gitignore` 等は production に含まれない（最小公開の運用維持）。

## 7. 反映内容の確認

### 7.1 報告書PDFのFAX文言削除

- 報告書出力（`downloadReport`）から FAX 文言を削除済み（FAX が実在しないため出力に載せない）。
- `#rep-fax` 入力欄 / `state.report.fax` schema フィールドは **保存・読込互換のため残置**するが、報告書出力では一切参照・出力しない（`REPORT-UX-007A` / FAX削除対応コメントで明文化）。
- footer の事務局名は `state.report.officeName` から取得。

### 7.2 スマホ星取表ビュー公開

- `LIVE-MOBILE-SCOREBOARD-001 §1`: スマホ閲覧用リアルタイム星取表ビュー（閲覧専用）。
- `#scoreboard` / `#viewer` / `#mobile-standings` hash で起動。運営画面はそのまま維持し、閲覧専用ビューを別タブで開く。操作UI（ボタン / 入力）は閲覧ビューに出さない read-only 設計。

### 7.3 PDFファイル名改善

- `buildSafePdfFilename` / `sanitizeFilenamePart` により「YYYY年M月度{大会名}{種別}」形式の安全なファイル名を生成。

## 8. 運用維持の確認

- `main` / `production` / Pages source（`production:/`）の **分離運用を維持**。
  - `main` HEAD = `1940fc1`（PR #201）
  - `production` HEAD = `d8d5db1`（PR #202）= Pages 公開元
- 本タスクでは以下を **一切実施していない**:
  - branch 削除なし
  - 追加の release / deploy / publish なし
  - GitHub Pages 設定変更なし
  - `main` / `production` への直接 push なし
  - 実装ファイル（`shogi_v4.html` / `index.html`）変更なし
  - production への変更なし

## 9. 残タスク候補（将来判断）

1. release / adopt / feature branch（`feature/shogi-tour-live-mobile-scoreboard-001` / `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` / `release/shogi-tour-pr201-main-1940fc1-to-production` 等）を削除するか判断。
2. production / clean base への CI 拡張検討（現状 workflow trigger は `main` scoped のため、production 宛 PR では CI が走らない＝「no checks reported」）。
3. 報告書 FAX 入力欄（`#rep-fax` / `state.report.fax`）の将来整理（出力未使用のまま schema 互換目的で残置 → 将来 schema から整理するか）。

## 10. 本記録のスコープ

本タスクは **docs-only**。実装変更なし / test 変更なし / workflow 変更なし / production 変更なし /
release・deploy・publish なし / Ready 化なし / merge なし / branch 削除なし / `main`・`production` 直接 push なし。
変更ファイルは docs / HANDOFF のみ。
