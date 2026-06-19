# GITIGNORE-DATA-SAFETY-001 結果メモ

- 日付: 2026-06-19
- branch: `chore/gitignore-data-safety-001`
- base: orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `cd14bb15a78319d8a982755e1adab1aa4af845bb`（#239 直上）

## 目的

orphan base の `.gitignore` に `data/` の無視設定が無く、実参加者マスタ等の **実データ / ローカル投入データを誤って repo に取り込むリスク**が残っていた（#194 の棚卸しで確認された安全上の小穴）。本 PR は単独・最小でこの穴を塞ぐ。

## 変更内容（`.gitignore` のみ）

「# ローカル限定」ブロックの直後、「# ai-requests のうちローカル限定のもの」の直前に 1 コメント + 1 パターンを追記:

```
# 実データ・ローカル投入データ（実参加者マスタ等）は repo に含めない（端末ローカル限定 / 先頭スラッシュで repo 直下のみ）
/data/
```

### `/data/`（先頭スラッシュ）を採用した理由

- 実データの置き場はリポジトリ直下の `/data/`。先頭スラッシュで **repo 直下のみに限定**し、将来 `test/data/` 等の正当な追跡対象を誤って無視しない。
- これは #194（本安全指摘の発生元）が同一文面意図で選んだ形と一致させ、後日の MEMBERS-CANDIDATE-MASTER-RECUT-001 再切り時の重複・齟齬を最小化する目的。
- 検証要件 `git check-ignore data/test.json`（repo 直下）はこの形でも満たす。

## 検証

- `git diff --name-only` = `.gitignore` と本結果メモのみ。
- `git check-ignore data/test.json` → `data/test.json`（ignore 判定 ✓）。
- `git status --short` で `data/` 配下の検証ファイルが追跡候補に出ない。
- 既存 tracked ファイルへの影響なし（`.gitignore` への追記のみ・パターン削除なし）。

## 非実施・据え置き

- `data/` 以外の ignore 追加なし。
- `shogi_v4.html` / `index.html` / `test/` / `.github` / `scripts` / `docs/ops` / production / 実データには未接触。
- #194 は無変更で open 据え置き。
- Ready 化 / merge / branch 削除 / rebase / force push / deploy / release / production 反映はいずれも未実施（Draft で停止）。
- main `832bc5a` / production `9693a83` / orphan base `cd14bb1` 不変。
