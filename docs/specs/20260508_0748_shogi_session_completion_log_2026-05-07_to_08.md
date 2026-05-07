# shogi 整備 Sprint セッション完了レポート

**期間**: 2026-05-07 〜 2026-05-08
**最終 main HEAD**: `f13ffdd`
**作成日時**: 2026-05-08 07:48 JST
**作成者**: Claude.ai
**目的**: ロードマップ v21 / Postmortem v2 に記録済の個別判断を補完し、本セッションで得られた **メタ的教訓**(過剰仕様化の罠 / Claude.ai の Assumption Safety 違反)を記録する

---

## 1. 本セッション概要

### 1.1 完了 commit 一覧

| # | 項目 | commit | PR |
|---|---|---|---|
| 1 | A-4.5 過去参加者パネル 3 セクション分離 + 行 2 段 + mobile-375 VRT | `cf7a970` | #23 |
| 2 | A-4.6 エントリー済ボタン色強調復活 | `d5f28ff` | #24 |
| 3 | Postmortem v2(A-4 系 5 障害分析 + 共通パターン 4 個 + 16 再発防止策) | `524fece` | (直接 main) |
| 4 | DevSecOps v2.0 Slim v1 配置 → v1.1 配置 → **凍結確定** | `7aab4b2` → `ebe6675` | (直接 main) |
| 5 | Layout Safety L-3 + L-4 mini Sprint(production code 変更ゼロ) | `43d5f7d` | #25 |
| 6 | ロードマップ v21 更新(基盤強化フェーズ新設 + 判断経緯ログ 7 件追加) | `6b72f2a` | (直接 main) |
| 7 | マスタ一覧 5 列構成変更(氏名 / 支部員区分 / 中学生以下区分 / 編集 / 削除) | `f13ffdd` | #26 |

### 1.2 品質状態

- **e2e**: 594 件緑(L-3/L-4 で 40 件追加、master_list spec で 15 件追加)
- **unit test**: PASS=50 / FAIL=0
- **production code 変更**: A-4.5 / A-4.6 / マスタ一覧 = あり、Layout Safety L-3/L-4 / ロードマップ更新 = ゼロ

---

## 2. 主要判断と経緯

### 2.1 DevSecOps v2.0 Slim v1.1 で凍結(2026-05-08)

**経緯**:
1. A-4 系 Postmortem v2 を根拠に DevSecOps v2.0「4 系統 Safety 宣言」Slim ドラフト v1 作成
2. ChatGPT Full Review v1: B 判定(Must Fix 5 件 + Should Fix 5 件)
3. 全反映で v1.1 作成 → ChatGPT Full Review v1.1: A- 判定(残存 Must Fix なし)
4. **同タイミングで ChatGPT が別途警告**:「Claude のクオリティ低下を感じる、AI 全体の認知負荷が限界、過剰レビュー / 過剰 Safety / 巨大仕様書化の兆候、基盤安定化 Sprint 推奨」
5. 髙橋さん相談 → **Slim v1.1 で凍結確定**

**凍結内容**:
- Codex Full Review 中止
- Full 版 / Appendix 作成中止
- 全 6 プロジェクト展開中止
- 残存 ChatGPT Should Fix 3 件は将来追記候補(P0/P1/P2 vs Phase 0-3 明文化、O-4 主担当固定、Layout Safety 構造崩れ拡張)

**理由**:
- 仕様書肥大化(Postmortem v2 8000 字 + Slim v1.1 15000 字 = 計 23000 字)
- Codex Full Review → Must Fix → v1.2 → 再 ChatGPT のレビューループに入る危険性大
- 髙橋さんの本来ミッション(shogi 運営 / note 執筆 / 書籍 / コーチング)からの乖離回避

### 2.2 A-5(iOS Safari 印刷警告)永続スキップ(2026-05-08)

印刷機能を運用上使わないため、A-5 は永続スキップと確定。バックログから除外。

### 2.3 マスタ一覧 5 列構成変更

**契機**: 整備 Sprint 終盤の実機確認で、マスタ一覧画面が 8 列構成のため iPhone 375px で氏名・区分・「未入力」警告ラベル等がすべて縦書き化していることが判明(過去参加者パネルとは別画面、A-4 系で未対策のまま残っていた)。

**設計判断**: 髙橋さん指定で「氏名 / 支部員区分(member) / 中学生以下区分(grade) / 編集 / 削除」の 5 列構成に変更。削除した列(ふりがな / 前回クラス / 最終参加 / 回数)は F7 編集モーダル内で引き続き確認・編集可能。

**Codex Gate Review**: A 判定(Must Fix なし)。

### 2.4 マスタ一覧 6 文字 2 行折返し許容(2026-05-08)

5 列構成変更後の実機確認で、全角 6 文字以上の氏名で 2 行折返しが発生。**縦書き化(A-4.4 の P0 障害)とは別物** で読める範囲のため、修正連鎖を避けて許容と判断。

---

## 3. 教訓

### 3.1 Claude.ai の Assumption Safety A-1 違反(2 件)

本セッションで Claude.ai が「動的状態を assume せず実値取得すべき」原則(DevSecOps v2.0 Slim v1.1 §2.4 A-1)を **2 回** 違反した:

| # | 違反内容 | 影響 |
|---|---|---|
| 1 | A-4.5 Codex prompt の commit 数期待値ミス(7 commits → 実際は 8 commits) | Codex 環境同期確認で sync 不全 → 再投入で解決 |
| 2 | L-3/L-4 Codex prompt で `git diff main..HEAD` を期待値「空」と書いた(過去メモリ「Codex 環境は git fetch ブロック」を忘れた) | Codex 環境で `main` リビジョン解決失敗 → 2 回目 `origin/main` でも失敗 → 3 回目 SHA ベース指定で解決 |

**根因**: Claude.ai は git にも Codex sandbox にもアクセスできず、過去の経験 / メモリ記載のルールを assume で書く傾向がある。本セッションでは仕様書肥大化の中で基本原則を見失った。

**今後の対策**:
- Claude.ai は Codex prompt 作成時、動的状態(git log / HEAD / file 一覧 / Codex 環境制約)を assume せず、Claude Code で実値取得してから書く
- 髙橋さん側で気づいた assume には遠慮なく指摘してもらう(本セッションでも髙橋さんの指摘で発見)

### 3.2 「過剰仕様化・巨大文書化」の罠

本セッションで顕在化した AI 開発の構造的罠:

**典型パターン**:
1. 障害発生(A-4.4 P0)
2. Postmortem 作成(8000 字)
3. Postmortem を根拠に「DevSecOps v2.0」のような包括的仕様策定(Slim v1: 9000 字)
4. レビュー(ChatGPT)で Must Fix 多数 → v1.1 で全反映(15000 字)
5. さらに Codex Full Review → Must Fix → v1.2(20000+ 字)
6. ...と肥大化が止まらない

**本セッションで救った要因**:
- ChatGPT が **本来の機能改善とは別の文脈で** 警告を発した(髙橋さんが相談した結果)
- 髙橋さん本来のミッション(shogi 運営 / note / 書籍 / コーチング)を再確認する機会
- 「大会運営は回る」という到達点が確認できたタイミング

**得られた原則**:
- **「品質基盤強化」は手段であって目的ではない** → 髙橋さんの本来ミッションが目的
- **「進めるレベル」と「進める価値」は違う**(ChatGPT A- 判定でも、進む価値がない場合は止める)
- **Layout Safety だけが実用域、他 3 系統(UX/Operational/Assumption)は最小実装で運用しながら必要時追加** が現実的妥協ライン

### 3.3 セッション後半の認知負荷管理

本セッションは長丁場で compaction も挟んだ。終盤で髙橋さんから「進め方が分かりにくい、どこまでコピペすればいいか分からない」というフィードバック。Claude.ai が 3 ステップを 1 つの長大プロンプトにまとめてしまった結果。

**今後の対策**:
- Claude Code 用プロンプトは **1 ステップ 1 プロンプト** で、コードブロックで明示的に区切る
- 「次の 3 手反射禁止」(過去メモリ #22)を Claude.ai 側でより厳格に守る
- 髙橋さんの認知負荷を最優先(Claude.ai は context を持たないが、髙橋さんは AI 間の情報仲介で認知負荷が爆発しやすい)

---

## 4. 次のアクション(髙橋さんの判断待ち)

### 4.1 shogi 関連(残バックログ)

| 項目 | 状態 |
|---|---|
| マニュアル更新(A-4.5 過去参加者 3 セクション + A-4.6 ボタン色 + F7 last_class 2 択 + マスタ一覧 5 列 反映) | 次セッション候補 |
| ソースリファクタリング | 別 Sprint(CORE/TEMP/POC/LEGACY 分類前提、慎重に) |
| Layout Safety L-5/L-6/L-7 | 必要時 |
| a4_2 spec の `expectNoOverflow` 統合 | 必要時 |
| 氏名セル末尾 yomi feature flag(同姓同名対策、Codex 提案) | 必要時 |

### 4.2 他プロジェクト切替候補

- **bp-matching**: 運用テスト 2〜4 週、AI API セキュリティ確認、プロンプトテンプレート、人材プール ⑥〜⑨ のスキルシート、BP マスタ「強み」列、案件 1 単価不一致解消
- **golf-compe**: P1(参加者募集 / ペアリング支援 / 賞品管理)
- **x-support**: 継続運用(返信ファースト戦略)
- **shogi-coach**: Phase 2 / 3(個人モチベ次第)
- **file-organizer**: 継続
- **note 執筆 / 書籍 / コーチング実践**: 髙橋さんの本来ミッション

### 4.3 全 6 プロジェクト共通

- DevSecOps v2.0 凍結中のため、横断展開は **行わない**
- 各プロジェクトで個別に必要な対策を Layout Safety 軸で対応

---

## 5. 関連ドキュメント

- `docs/specs/_postmortem_a4_series.md`(A-4 系障害 5 件 + 共通パターン 4 個 + 16 再発防止策)
- `docs/specs/20260508_0025_devsecops_v2_4_safety_slim_draft_v1_1.md`(DevSecOps v2.0 Slim v1.1、凍結版)
- `docs/specs/20260505_1500_shogi_roadmap.md`(ロードマップ v21、判断経緯ログ含む)
- `docs/specs/20260508_0044_shogi_layout_safety_l3_l4_mini_spec_v1.md`(Layout Safety L-3/L-4 仕様書)
- `docs/specs/20260508_0700_shogi_master_list_columns_mini_spec_v1.md`(マスタ一覧 5 列構成仕様書)

---

## 6. 締め

**shogi 整備 Sprint 完了**。沼津支部月例大会の運営は f13ffdd で回る状態。

次セッションでマニュアル更新 or 他プロジェクト切替 を髙橋さんが判断。
