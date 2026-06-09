# SHOGI-TOUR-APPHQ-003D-4C｜E2E spec内の実データ由来期待値をdiff露出させずに解除する方式設計

## 1. 目的

SHOGI-TOUR-APPHQ-003D-4C は、E2E spec (`test/e2e/shogi_phase2_import.spec.js`) 内に残っている **実データ由来に見える参照・期待値** を、**GitHub PR diff 上に旧値を露出させずに** 解除するための方式を設計する文書である。

本文書では以下を整理する。

- PR #174 No Go の原因
- E2E spec 通常編集が危険な理由
- fixture が実データの件数・分布・日付へ寄ってしまう問題
- diff-safe 解除方式の候補
- `shogi_v4.html` 側の固定 validator 問題
- 推奨方式
- 後続タスク順序
- Risk Level
- Approval Phrase / 承認境界

本文書は docs-only であり、以下は今回行わない。

- E2E spec / fixture / 対象JSON / `shogi_v4.html` / CI 設定 / GitHub Pages 設定の変更
- PR #174 の diff 本文表示
- 実データ由来に見える旧期待値の再掲

## 2. これまでの経緯

| Task ID | 内容 |
|---|---|
| 003C | `data/import/20260412_participants.json` が実データ確定。AIには実値を共有していない。 |
| 003D-3 | 通常削除 PR は diff 露出リスクがあるため、diff 露出なし撤去方式を設計。 |
| 003D-4 | E2E の実データ依存解除方針を作成。 |
| 003F | 完全架空 fixture 設計を作成（PR #172、merge済み）。 |
| 003F-1 | 完全架空 fixture `test/fixtures/import/participants_synthetic_minimal.json` を 4 件版で main に追加（PR #173、merge済み）。 |
| 003D-4A / PR #174 | E2E 参照切替を試行 → **Codex レビューで No Go** → Close / Not Merged / branch 削除済み。main にも反映されていない。 |

### PR #174 No Go の理由

1. **E2E spec の旧期待値リテラルが削除行として GitHub diff に露出した。**
2. **その旧期待値は、氏名・地域・読み等の実データ由来に見える値だった。**
3. **synthetic fixture が 22 件 / A=18 / B=4 / 固定の `last_played` 値に寄り、実データの件数・クラス分布・大会日付の再現に見えるリスクがあった。**

### 現在の main 状態（HEAD = `0d4eae4`）

- `data/import/20260412_participants.json`: main に残存（実データ確定 / 未変更 / 未削除）
- `test/e2e/shogi_phase2_import.spec.js`: main 上は **未変更**（実データ JSON 参照あり、実データ由来らしき期待値あり）
- `test/fixtures/import/participants_synthetic_minimal.json`: main に反映済み（**4 件版**）
- PR #174 の変更は main に **入っていない**

## 3. PR #174 No Go の教訓

- **通常 PR で E2E spec を直接編集すると、削除行として旧期待値リテラルが GitHub diff に出る。**
- 旧期待値が実データ由来に見える場合、**diff そのものが情報露出になる**。GitHub PR ページ・PR メール通知・GitHub API・Codex / 外部レビューツール経由でも露出する。
- したがって、E2E spec 内の **旧値を含む通常の参照切替 PR は安全ではない**。
- 実データ JSON だけでなく、**実データ由来に見える期待値を含む spec も diff-safe 対象** として扱う必要がある。
- 今後、E2E spec 内の旧値を削除・置換する場合は、GitHub PR diff 露出を **事前評価** することを必須化する。

## 4. fixture が実データ再現に寄ってしまう問題

- PR #174 では、E2E 経路の検証ロジックが固定の件数・分布・日付を要求していたため、synthetic fixture を **実データ件数・クラス分布・固定日付に寄せざるを得なくなった**。
- これは完全架空 fixture 方針（003F：機械的・連番・実データ独立）と相性が悪い。
- **22 件 / A=18 / B=4 / 特定の日付** のような条件は、たとえ氏名や地域が `Fixture User NNN` / `Dummy City NNN` であっても、**全体として実データ再現に見える**。
- 完全架空 fixture は、件数・クラス分布・日付も実データから独立させる必要がある。
- E2E 検証ロジックやアプリ側の固定期待値に合わせて fixture を実データに寄せるのではなく、**検証ロジック側を synthetic 対応に分離する方針** が必要。

## 5. `shogi_v4.html` 側の固定 validator 問題

- PR #174 試行により、`shogi_v4.html` 側の検証ロジックまたは固定期待値が **実データ寄りの値（件数・クラス分布・日付）を要求している** 可能性が判明した。
- 固定期待値がある限り、synthetic fixture 側が実データ形状に寄ってしまう。
- したがって、E2E 参照切替だけでなく、**validator / expected values の分離** が必要。
- ただし、`shogi_v4.html` の変更は **アプリ本体変更** であり、Level 3 以上として別 PR・別承認が必要。
- 今回の 003D-4C では設計のみとし、`shogi_v4.html` は変更しない。

> 注: 本文書では、`shogi_v4.html` 内の具体的な定数名・値は引用しない。実データ由来に見える値の引用は PR diff 露出と同じ性質を持つため、抽象レベル（「件数」「分布」「固定日付」）で扱う。

## 6. diff-safe 解除方式の候補

| 案 | 内容 | 評価 | メリット | デメリット |
|---|---|---|---|---|
| **A** | 既存 E2E spec を通常 PR で直接編集（PR #174 と同じアプローチ） | **不可** | （該当なし） | 旧期待値削除 diff が GitHub 上に露出する |
| **B** | 既存 E2E spec を残し、**新規 synthetic 専用 E2E spec を追加** する | **第一候補** | 旧 spec の旧期待値行を **触らない**。新しい安全な E2E を追加できる。diff には新規ファイル追加のみが出る | 旧 spec が残るため実データ依存は残存する。旧 spec の **無効化・撤去が別途必要** |
| **C** | 既存 E2E spec を **CI 対象から外し**、新規 synthetic E2E へ移行する | 候補・要注意 | CI から実データ依存を外せる | CI 設定や test discovery 変更で旧 spec ファイル名・パスが diff / config に出る可能性。旧 spec 自体は残る |
| **D** | 既存 E2E spec を **履歴対応 Runbook（003E）側で除去・再作成** する | 候補 | 旧期待値を通常 PR diff に出さず、履歴対応と一体で扱える可能性 | **Level 4 相当**。force push / clone 影響 / branch 影響が大きい |
| **E** | 既存 E2E spec を **バイナリ扱いまたはリネーム等で diff 非表示** にする | **原則不可 / 要調査** | （限定的） | GitHub の表示挙動に依存し確実性が低い。操作自体が不自然で監査性も悪い |
| **F** | 一時的に公開 repo を **private 化または公開停止** してから通常 PR で修正 | 緊急時候補 | 外部露出リスクを一時的に下げられる可能性 | 運用影響が大きい。GitHub 上の diff や履歴が完全に消える保証ではない（キャッシュ / 第三者 fork 等） |
| **G** | **orphan branch / clean tree 再構成** で、実データ JSON と旧 spec を含まない公開系へ切替 | 候補 | 公開系から実データ依存資産を排除できる可能性 | **Level 4 候補**。GitHub Pages 設定 / 履歴 / branch 保護 / 既存 PR との関係整理が必要 |

## 7. 推奨方式

### 短期推奨

- **既存 E2E spec を通常 PR で直接編集しない**（案 A は禁止）。
- **新規 synthetic 専用 E2E spec を追加する案（案 B）を第一候補** とする。
- ただし、旧 spec が CI で実行され続ける場合は、CI 対象から外す方法（案 C）も diff-safe に設計する必要がある。
- 既存 E2E spec の旧期待値削除・置換は、履歴対応（案 D）または clean tree 再構成（案 G）側で扱う。

### 中期推奨

- `shogi_v4.html` 側の固定検証ロジック / expected values を、synthetic fixture 向けに **分離** する（別 PR・別承認、Level 3）。
- synthetic fixture は **4〜5 件程度の最小構成に戻す**。
- 件数・クラス分布・日付は **実データから独立** させる。
- E2E 期待値は `Fixture User NNN` / `Dummy City NNN` 等の機械的・連番・英語ベースに統一する。

### 長期推奨

- 実データ JSON、実データ由来 E2E spec、旧期待値リテラルを含む **履歴対応要否を 003E で判断** する。
- GitHub Pages 公開系を実データ非含有 tree へ切り替える案も **003G / 008D** で検討する。

## 8. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003D-4D**：synthetic 専用 E2E 新設方針（案 B の具体化、docs-only）
- **SHOGI-TOUR-APPHQ-003D-4E**：CI 対象から旧 E2E を外す diff-safe 方式検討（案 C の具体化、docs-only）
- **SHOGI-TOUR-APPHQ-003D-4F**：validator / expected values 分離設計（`shogi_v4.html` 側、docs-only）
- **SHOGI-TOUR-APPHQ-003H**：実データ撤去実行 Runbook
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages 公開済み影響確認
- **SHOGI-TOUR-APPHQ-008D**：公開系分離方式検討（orphan branch / clean tree、案 G）

## 9. 推奨実施順

1. **003D-4D**：synthetic 専用 E2E 新設方針
2. **003D-4F**：validator / expected values 分離設計
3. **003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
4. **003H**：実データ撤去実行 Runbook
5. **003E**：Git 履歴対応要否判断
6. **003G**：GitHub Pages 公開済み影響確認

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。
003G を前倒しする場合でも、本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 10. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計文書作成（本PR） | docs-only だが実データ由来 E2E 期待値の解除方式に関わるため **Level 3 相当** |
| synthetic 専用 E2E 新設（003D-4D 実装） | Level 3 |
| validator / expected values 分離（003D-4F 実装） | Level 3 |
| CI 対象変更（003D-4E 実装） | Level 3〜4 |
| 実データ撤去実行（003H 実装） | Level 3〜4 |
| Git 履歴改変 / force push（003E 実装） | Level 4 |
| orphan branch / clean tree 再構成（008D 実装） | Level 4 候補 |
| GitHub Pages 公開済み影響確認（003G） | Level 4 候補 |

## 11. Approval Phrase / 承認境界

- 本方針文書作成は docs-only だが **Level 3 相当**。
- synthetic 専用 E2E 新設は **別 PR・別承認**。
- validator / expected values 分離は **別 PR・別承認**。
- CI 対象変更は **別 PR・別承認**。
- **旧 E2E spec の削除・置換・通常編集は、標準 Approval Phrase だけでは不十分**。diff 露出評価とその承認を必須とする。
- Git 履歴改変・force push・orphan branch・GitHub Pages 設定変更は **標準 Approval Phrase では解除不可**。
- 実データ撤去実行は通常の Ready化 / merge 承認だけでは不十分。

## 12. 今回やらないこと

- E2E spec (`test/e2e/shogi_phase2_import.spec.js`) の変更
- fixture (`test/fixtures/import/participants_synthetic_minimal.json`) の変更
- 対象 JSON (`data/import/20260412_participants.json`) の削除 / 置換 / 本文表示
- PR #174 の diff 表示
- 実データ由来に見える旧期待値の再掲
- `shogi_v4.html` の変更
- CI 設定変更
- E2E skip / 削除
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
