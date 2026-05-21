# SHOGI-TOUR-APPHQ-003D-4｜E2Eの実データ依存解除方針

- Task ID: SHOGI-TOUR-APPHQ-003D-4
- 対象プロジェクト: SHOGI-TOUR｜将棋大会運営アプリ
- 親プロジェクト: APP-HQ｜全アプリ開発司令塔
- Repo: kazuo1970takahashi-sketch/shogi
- 作成日: 2026-05-21
- 文書種別: 方針（docs-only）
- 状態: ドラフト

---

## 1. 目的

本文書は、E2E テスト `test/e2e/shogi_phase2_import.spec.js` が実データ確定 JSON `data/import/20260412_participants.json` に依存している状態を解消するための方針を定める。

本文書では以下を整理する。

- 現在の問題
- 実データ fixture 依存が危険な理由
- E2E を維持するための選択肢（案 A〜E）
- 一時 skip / 削除を使う場合の復元条件
- 完全架空 fixture で復元する方針
- 後続タスクの順序
- Risk Level
- Approval Phrase / 承認境界
- 今回（003D-4）でやらないこと

本文書は **方針のみ** であり、E2E 実装変更、完全架空 fixture 作成、対象 JSON の削除・置換・履歴改変・force push・GitHub Pages 操作は一切行わない。

---

## 2. 現在の問題

- E2E `test/e2e/shogi_phase2_import.spec.js` が `data/import/20260412_participants.json` を参照している（SHOGI-TOUR-APPHQ-003D-2 の参照確認結果、一致行は表示せずファイル名のみで確認）。
- `data/import/20260412_participants.json` は人間ローカル判定（SHOGI-TOUR-APPHQ-003C）で **A 実データ確定** と判定された。
  - 含まれていた項目種別: 氏名 / 住所 / 最終クラス / 最終対局日
  - 実値は AI に共有していない。本文書にも一切記載しない。
- 実データ確定ファイルを E2E fixture として使うことは不適切。
- 対象 JSON を削除すると E2E が `ENOENT` で失敗する（SHOGI-TOUR-APPHQ-003D-2 / PR #169 のレビューで指摘済み）。
- 実データ撤去と E2E 維持を両立するには、E2E 側の **実データ依存解除** が必要。

---

## 3. 実データ fixture 依存が危険な理由

- E2E 実行環境（local / CI）に実データが渡る。
- Playwright の trace / screenshot / video / debug output に実データが混入する可能性がある。
- CI ログ・artifact・retry ログに実データが残る可能性がある。
- AI レビュー・外部ツール（CI 連携 / Webhook / Slack 等）に実データが渡る可能性がある。
- `fixture` として扱うことで、実データが正当なテスト資産のように **残り続ける** リスクがある。
  - 将来の開発者が架空データと **誤認** し、安易に複製・公開する可能性がある。
  - 実データ削除を行いづらくする（テストが落ちるという理由で先送りされる）。
- E2E 公開系（CI artifact、Pages preview 等）への実データ流出経路を増やす。

---

## 4. 対応方針候補（案 A〜E）

| 案 | 内容 | メリット | デメリット | 推奨度 | 条件 |
|---|---|---|---|---|---|
| A | 対象 E2E を **完全架空 fixture** へ切り替える | E2E を維持できる。実データ依存を恒久的に断てる。 | 完全架空 fixture 設計コストが必要。 | **高** | 完全架空 fixture の設計が完了している（003F）。 |
| B | 対象 E2E を **一時 skip** する | 短期的に CI を壊さず、実データ撤去（003H）へ進めやすい。 | テスト負債化リスク（放置で恒久 skip 化）。 | 中 | 復元条件・期限・責任者を明記する。 |
| C | 対象 E2E を **削除** する | 実データ依存を確実に断てる。 | 回帰テストが失われる。 | 低〜中 | 完全架空 fixture で後続復元する計画（Task ID・期限）が必要。 |
| D | 実データ JSON を残したまま E2E を維持する | なし | 実データ fixture 依存が継続。実データ撤去が前進しない。 | **不可** | — |
| E | 匿名化・仮名化したデータへ置換する | 実データに近い構造を保てる | 再識別リスク・元データ由来・加工漏れリスク。 | **原則不可** | 完全架空データを使う方針のため採用しない。 |

---

## 5. 推奨方針

- **推奨は案 A**（完全架空 fixture へ切り替え）。E2E を維持しつつ、実データ依存を恒久的に断つ。
- ただし、完全架空 fixture 作成（003F）に時間がかかり、**実データ撤去（003H）を急ぐ必要がある** 場合は、案 B の **一時 skip** を短期策として許容し得る。
- 案 C（削除）は、当該 E2E の回帰価値が小さい場合、または短期的に復元見込みがある場合の最終手段とする。
- 案 D・E は採用しない。

### 一時 skip（案 B）採用時の必須条件

採用 PR で以下をすべて満たすこと。これらを満たさない skip の merge は **不可**。

1. **skip 理由を明記する**（PR 本文 / コミットメッセージ / spec 内コメント）。
2. **復元条件を明記する**（例: 「SHOGI-TOUR-APPHQ-003F の完全架空 fixture 作成後」「003F 完了 PR の merge 後」「指定の fixture path が存在することを前提に再有効化」）。
3. **復元期限を明記する**（絶対日付 `<YYYY-MM-DD>` を最低 1 つ含む。条件のみで日付なしは不可）。
4. **復元責任者または後続 Task ID を明記する**（個人名 or Task ID。例: `SHOGI-TOUR-APPHQ-003D-4A` または `SHOGI-TOUR-APPHQ-003F`）。
5. **spec 内に負債マーカーを残す**（例: `// TODO: SHOGI-TOUR-APPHQ-003D-4B / 003F 完了後に復元 / 期限 <YYYY-MM-DD>`）。
6. **003F 完了後の再有効化を blocking 条件にする**（003F merge PR の checklist に当該 spec の再有効化を含める）。
7. **復元責任を任意で他者に再委任する場合は別 PR で明示的に行う**（暗黙のスライドを禁止）。

---

## 6. 完全架空 fixture 方針

完全架空 fixture を作成する際の指針（具体的設計は 003F で行う）。

- **実データ由来の匿名化・仮名化は使わない**（再識別リスクが残るため）。
- 実名・実住所・実支部・実大会日付・実参加履歴を使わない。
- 明らかに架空と分かる命名規則を使う（例: `テスト 太郎`、`テスト県テスト市 1-2-3`、`テスト支部` 等、もしくはより無味乾燥な `Fixture User 001` 等）。
- 実大会と誤認されない日付・地域・属性を使う（例: 過去日付なら明確に架空年度、未来日付なら明示的に架空、地域名は実在しない名称を採用）。
- ファイル名にも `synthetic` / `dummy` / `fixture` 等のマーカーを含める。
  - 例: `test/fixtures/import/synthetic_participants_v1.json`
- fixture の docs（README / コメント）に **完全架空データである旨を明記** する。
- E2E で必要な **最小件数** にする（実大会規模を模倣しない）。
- import 機能の回帰確認に必要な **構造** だけを持たせる（実データの構造そのものをコピーしない。必要なフィールドだけ）。
- 値域・enum・必須項目の境界条件を fixture で明示的にカバーする（正常系・境界系・異常系を区別する）。

---

## 7. E2E 修正時の禁止事項

E2E 参照解除を実装するタスク（003D-4A 想定）で守るべき制約。

- `data/import/20260412_participants.json` を開かない。
- 実データ JSON の値を参照しない。
- 実データ JSON から fixture を派生・生成しない（コピー、抽出、サンプリング、加工いずれも禁止）。
- 実データ JSON をコピーしない（別ディレクトリへの複製、別ファイル名での保存も禁止）。
- 実データ JSON の構造・値を E2E に **再現** しない（値の置換だけの「マスク」を含む）。
- CI ログ / Playwright trace / screenshot / video に実データが出る操作をしない（fixture が完全架空であれば自動的に守られる）。
- 実データを含むスクリーンショットを保存しない。
- Playwright trace に実データが残らない fixture 構成にする（trace 設定変更が必要なら別タスクで扱う）。
- E2E 修正 PR の diff・本文・コメント・レビュー結果に実データを露出させない（SHOGI-TOUR-APPHQ-003D-3 と同様の diff 露出評価を行う）。

---

## 8. 後続タスク候補

| Task ID | 内容 | Risk Level |
|---|---|---|
| SHOGI-TOUR-APPHQ-003F | 完全架空 fixture 設計 | Level 3 |
| SHOGI-TOUR-APPHQ-003D-4A | E2E の実データ参照解除実装（案 A or B or C を採用） | Level 3 |
| SHOGI-TOUR-APPHQ-003D-4B | 一時 skip 採用時の復元条件管理（採用された場合） | Level 3 |
| SHOGI-TOUR-APPHQ-003H | 実データ撤去実行 Runbook | Level 3〜4 |
| SHOGI-TOUR-APPHQ-003E | Git 履歴対応要否判断 | Level 3〜4 |
| SHOGI-TOUR-APPHQ-003G | GitHub Pages 公開済み影響確認 | Level 4 候補 |

---

## 9. 推奨実施順

### 標準ルート（推奨）

1. **003F**: 完全架空 fixture 設計
2. **003D-4A**: E2E 参照解除実装（案 A: fixture 差替え）
3. **003H**: 実データ撤去実行 Runbook（撤去実行はこの後）
4. **003E**: Git 履歴対応要否判断
5. **003G**: GitHub Pages 公開済み影響確認

### 暫定ルート（撤去を急ぐ場合）

現行公開からの実データ撤去を急ぐ必要がある場合は、以下の暫定ルートを許容する。

1. **003D-4A（暫定）**: E2E 一時 skip（案 B）を採用。§5 の必須条件をすべて満たす。
2. **003H**: 実データ撤去実行 Runbook（撤去実行）
3. **003F**: 完全架空 fixture 設計
4. **003D-4B**: 完全架空 fixture を使って一時 skip した E2E を **必ず復元** する
5. **003E**: Git 履歴対応要否判断
6. **003G**: GitHub Pages 公開済み影響確認

暫定ルートを採用する場合、ステップ 4（復元）を実施しないままステップ 5・6 を進めることは **禁止**（テスト負債を恒久化させないため）。

---

## 10. Risk Level

| 項目 | Risk Level | 備考 |
|---|---|---|
| 本方針文書作成（本タスク） | **Level 3 相当** | docs-only だが、実データ fixture 依存解除・E2E 修正方針・実データ撤去順序に関わるため |
| 完全架空 fixture 設計（003F） | Level 3 | 実装はないが再識別リスク回避設計が必要 |
| E2E 参照解除実装（003D-4A） | Level 3 | 案 A・B・C いずれも E2E 構成変更を伴う |
| 一時 skip / 削除（案 B / C） | Level 3 | 復元条件管理が必須 |
| 実データ撤去実行（003H） | **Level 3〜4** | 採用方式（diff 露出評価結果）に依存 |
| Git 履歴改変 / force push（003E 実行） | **Level 4** | 全 branch・全 clone・CI / 連携系・GitHub Pages 影響 |
| GitHub Pages 公開済み影響確認（003G） | **Level 4 候補** | 公開系・外部キャッシュに関わる |

---

## 11. Approval Phrase / 承認境界

- 本方針文書作成は docs-only だが **Level 3 相当**。Draft PR 作成までを本タスクの範囲とし、Ready 化・merge は別承認。
- E2E 参照解除実装（003D-4A）は **別 PR・別承認**。
- 完全架空 fixture 作成（003F）は **別 PR・別承認**。
- **一時 skip / 削除を採用する場合**は、§5 の必須条件（理由 / 復元条件 / 復元期限 / 復元責任者 or 後続 Task ID / 負債マーカー / 復元 blocking）をすべて満たした PR でのみ承認可。条件未充足の skip / 削除 merge 承認は不可。
- **実データ撤去実行（003H）**は、通常の Ready 化 / merge 承認だけでは不十分。SHOGI-TOUR-APPHQ-003D-3 §10 で定義した承認境界に従う（対象ファイル / 実行方式 / 影響範囲 / rollback / 実行者 / 確認項目を明示）。
- **Git 履歴改変 / force push / GitHub Pages 設定変更**は標準 Approval Phrase では解除不可。Level 4 相当として専用 Runbook と明示承認が必要。

---

## 12. 今回（003D-4）でやらないこと

- `data/import/20260412_participants.json` の削除
- `data/import/20260412_participants.json` の置換
- `data/import/20260412_participants.json` の本文表示
- `test/e2e/shogi_phase2_import.spec.js` の本文表示
- `test/e2e/shogi_phase2_import.spec.js` の修正
- E2E の skip / 削除
- 完全架空 fixture / sample data の作成
- Git 履歴改変（`filter-repo` / `filter-branch` / rebase 履歴書換 等）
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
- 本タスク branch の Ready 化 / merge / 削除

---

## 関連タスク

- [SHOGI-TOUR-APPHQ-003｜実データ確定時の撤去・架空化方針](./shogi_tour_apphq_003_data_import_runbook.md)
- [SHOGI-TOUR-APPHQ-003A｜data import 構造確認手順](./shogi_tour_apphq_003a_data_import_structure_check.md)
- [SHOGI-TOUR-APPHQ-003D｜実データ撤去ポリシー](./shogi_tour_apphq_003d_real_data_removal_policy.md)
- [SHOGI-TOUR-APPHQ-003D-3｜実データ確定JSONのdiff露出なし撤去方式 設計](./shogi_tour_apphq_003d3_diff_safe_removal_design.md)
- SHOGI-TOUR-APPHQ-003D-4A（予定 / E2E 参照解除実装）
- SHOGI-TOUR-APPHQ-003D-4B（予定 / 一時 skip 採用時の復元）
- SHOGI-TOUR-APPHQ-003E（予定 / Git 履歴対応要否判断）
- SHOGI-TOUR-APPHQ-003F（予定 / 完全架空 fixture 設計）
- SHOGI-TOUR-APPHQ-003G（予定 / GitHub Pages 公開済み影響確認）
- SHOGI-TOUR-APPHQ-003H（予定 / 実データ撤去実行 Runbook）
- [SHOGI-TOUR-APPHQ-008｜開発環境分離方針](./shogi_tour_apphq_008_environment_separation.md)
