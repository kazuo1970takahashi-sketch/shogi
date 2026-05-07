# DevSecOps v2.0「4 系統 Safety 宣言」Slim 仕様書 ドラフト v1.1

**作成日時**: 2026-05-08 00:15 JST(v1)/ 2026-05-08 00:25 JST(v1.1)
**版**: v2.0 ドラフト v1.1(Slim)
**前版**: DevSecOps v1.2 final(2026-05-04、ChatGPT review A- 評価、shogi-coach docs/specs/ 5 ファイル配置済)
**根拠資料**: `docs/specs/_postmortem_a4_series.md` v2(2026-05-08)
**作成者**: Claude.ai
**レビュー履歴**:
- v1: ChatGPT Full Review B 判定(2026-05-08)→ Must Fix 5 件 + Should Fix 5 件 + Nice to Have 3 件
- v1.1: Must Fix 5 + Should Fix 5 をすべて反映(本書)
**次のレビュー**: v1.1 を ChatGPT Full Review に再投入 → A 以上で Codex Full Review に進む
**対象プロジェクト**: shogi / golf-compe / bp-matching / x-support / file-organizer / shogi-coach の全 6 プロジェクト

**v1 → v1.1 主要変更点**:
- §0.3 直後に v1.2 final 6 手段 → v2.0 4 系統マッピング表追加(Must Fix 1)
- §4 を Phase 0/1/2/3 段階導入構成に変更(Must Fix 2)
- §2.5 として U-3 / O-1 責務境界明文化(What/Why vs How/Where/When、Must Fix 3)
- §4.5 として UI なしプロジェクト向け読み替え方針追加(Must Fix 4)
- §0.3 / §8 で v1.2 final 5 ファイルの「共存 → 移行 → archive」3 段階を明記(Must Fix 5)
- §0.2 と §2 冒頭で「MECE ではなく主責務分類」を明記(Should Fix 1)
- §3 全 16 項目に **P0 / P1 / P2 優先度** を付与(Should Fix 2)
- §7 として Full / Appendix 詳細化計画を新設(Should Fix 3)
- §5 受け入れ条件を 4 段階(Slim 完成 / Full 完成 / shogi 適用開始 / 全 6 プロジェクト展開)に分離(Should Fix 4)
- §1.2 にパターン → Safety トレーサビリティ表追加(Should Fix 5)
- O-4 として「実機確認結果の昇格フロー」を Operational Safety に追加(ChatGPT 観点 2 の抜け指摘)
- §8 で「将来拡張(Performance / Security / Accessibility は v2.1 で扱う)」を明記(Devil's Advocate 1 への回答)

---

## §0 概要

### 0.1 目的

DevSecOps v1.2 final を継承しつつ、shogi A-4 系 Postmortem(v2)で抽出された **共通パターン 4 つ** に対応する **4 系統 Safety**(Layout / UX / Operational / Assumption)を統合的な守備範囲として明文化する。

### 0.2 守備範囲

v1.2 final の「画面操作系バグ・レイアウト破綻バグのゼロ化」を、以下 4 系統に拡張:

| 系統 | 守備範囲 | A-4 系の対応障害 |
|---|---|---|
| **Layout Safety** | 物理的レイアウト破綻、狭画面崩れ、要素重なり / はみ出し | 障害 1, 2 |
| **UX Safety** | UX フィードバック弱体化、初回利用時動作漏れ、設計整合性と別軸の触感 | 障害 3, 4 |
| **Operational Safety** | revert 後の状態検証漏れ、baseline 過信、運用ルール暗黙化、実機確認結果の昇格 | 障害 2, 4 |
| **Assumption Safety** | Claude.ai 動的状態 assume ミス、Green CI 誤認、認知バイアス | 障害 5、パターン D |

**【重要】 4 系統 Safety は完全な相互排他(MECE)分類ではなく、事故の主責務を割り当てるための実務分類である**。複数 Safety にまたがる事故(障害 4 の localStorage 空問題は UX + Operational、パターン D は Operational + Assumption)については、**主担当 Safety と副担当 Safety を明示** する。

### 0.3 v1.2 final からの差分・継承関係

- v1.2 の 6 手段(業務モデル文書 / §0 ユーザーストーリー / Devil's Advocate / Mutation Testing / expectClickable / Contract Testing)は **すべて継承** し、v2.0 の 4 系統に内包される
- v2.0 では新たに **16 項目の標準対策**(L-1〜L-7 / U-1〜U-3 / O-1〜O-4 / A-1〜A-3)を追加
- shogi A-4.5 で L-1, L-2 を実装済(✅)、残り 14 項目を v2.0 で正式化
- v1.2 final の 5 ファイル(shogi-coach 配置済)は **共存 → 移行 → archive** の 3 段階で扱う(詳細 §8)

#### v1.2 final 6 手段 → v2.0 4 系統 Safety マッピング表

| v1.2 final の手段 | v2.0 での主な受け皿 | 補足 |
|---|---|---|
| 業務モデル文書 | UX Safety / Operational Safety | 業務イベント・利用者行動・前提条件を守る |
| §0 ユーザーストーリー | UX Safety | U-1 で継承・強化(タップ即時フィードバック / 初回利用時挙動 / 狭画面破綻なし) |
| Devil's Advocate | UX Safety / Operational Safety / Assumption Safety | U-2 および A-1〜A-3 の確認観点へ拡張 |
| Mutation Testing | Layout Safety / Assumption Safety | テストが本当に壊れ方を検出できるかを確認 |
| expectClickable | Layout Safety / UX Safety | 操作可能性・押下フィードバックを保護 |
| Contract Testing | Operational Safety / Assumption Safety | AI 間・仕様間の前提ズレを防止 |

---

## §1 背景

### 1.1 v1.2 final の到達点と限界

v1.2 final は ChatGPT review A- 評価、shogi-coach に 5 ファイル(Slim / Full / Appendix C / D / E)配置済で、機能整合性中心の枠組みとして十分機能している。

ただし v1.2 final は次の問題を捕捉できなかった:
- **物理的レイアウト破綻**(障害 1: A-4.4 iPhone 375px flex 破綻 → revert P0)
- **UX フィードバック弱体化**(障害 3: A-4.5 色強調過剰撤廃)
- **初回利用時 / 運用環境差異**(障害 4: localStorage 空問題)
- **Claude.ai 動的状態 assume バイアス**(障害 5: Codex prompt 期待値ミス)
- **「既存正常状態」への過信**(障害 2: A-4.3 から潜在していた縦書き化問題、パターン D)

### 1.2 v2.0 の問題意識(共通パターン → Safety トレーサビリティ)

A-4 系 5 障害から抽出された **共通パターン 4 つ** に対応する、**領域別 Safety 系統** を定義する。Safety と項目の対応は以下の通り:

| 共通パターン | 概要 | 主担当 Safety | 対応項目 |
|---|---|---|---|
| A | AI 全体が「実機の見た目」を見ていない | Layout Safety | L-1〜L-7 |
| B | ユーザー視点が仕様書に含まれない | UX Safety(主) / Operational Safety(副) | U-1〜U-3 / O-1, O-4 |
| C | Claude.ai の動的状態把握が不完全 | Assumption Safety | A-1〜A-2 |
| D | 「既存正常状態」への過信(revert / baseline / Green CI) | Operational Safety(主) / Assumption Safety(副) | O-2, O-3 / A-3 |

詳細は `docs/specs/_postmortem_a4_series.md`(v2)を参照。

---

## §2 4 系統 Safety の詳細

**【再掲】4 系統は主責務分類であり、複数にまたがる事故は主担当 + 副担当を明示して扱う。**

### 2.1 Layout Safety(レイアウト破綻防止)

**目的**: 物理的なレイアウト崩れを **機械的に検出** する。「実機の見た目」を AI 全体が直接見られなくても、自動化された検証で破綻を捕捉する。

**核心原則**: snapshot だけでなく **bounding box 実測 + assertion** で「縦書き化」「Overflow」「要素重なり」のような構造的破綻を検出する。Chromium-desktop だけでなく **WebKit + iPhone device** を含めて iOS Safari 特有の rendering 差異も保護する。

**主な技法**:
- mobile/desktop 両 VRT(viewport を上書きするのではなく project で分離)
- bounding box 実測 e2e ヘルパー(width / height / 比率)
- Overflow 検出ヘルパー(`scrollWidth > clientWidth`)
- Layout assertion(行高さ・要素並びを仕様書 §4 に明示要件化)
- Playwright WebKit + iPhone device project
- visual `maxDiffPixelRatio` 厳格化(0.05 → 0.01)

### 2.2 UX Safety(ユーザー体験保護)

**目的**: ユーザーが実際に触ったときの体験を **仕様書段階** で担保する。「設計の整合性」と別軸の「触感」を仕様書に必須項目化する。

**核心原則**: AI 全体は「機能整合性」「設計整合性」「e2e の検証根拠」で完結しがちで、**「ユーザーが触ったときの感覚」を直接見ない**。これを仕様書テンプレートで強制的に意識させる。

**主な技法**:
- §0 ユーザーストーリー必須項目化:タップ時の即時視覚フィードバック / 初回利用時(localStorage 空 / プライベートブラウズ)挙動 / 狭画面行レイアウト破綻なし
- §6 Devil's Advocate 必須項目化:実機目視確認のテスト観点(色 / 配置 / 触感) / 初回ユーザー体験
- 仕様書テンプレート(`docs/specs/_spec_template.md`)新設 + チェックリスト化

### 2.3 Operational Safety(運用安全)

**目的**: 実機テスト・revert・baseline・実機確認結果の昇格 等の **運用フローを明文化** する。「暗黙のルール」を制度化する。

**核心原則**: 暗黙の運用ルールはメモリへの個別記録止まりで、運用ドキュメントへの昇格フローが弱い。`docs/specs/_operational_rules.md` を新設して常駐参照ドキュメント化する。**特に、髙橋さんの実機確認で得た違和感を、仕様書テンプレート / 運用ルール / Postmortem に昇格させるフロー**を明示する。

**主な技法**:
- 実機テスト = 通常タブ運用ルール明文化(`_operational_rules.md`)
- revert 後の状態検証手順必須化(revert PR には「revert 先の動作確認(実機 + VRT 再走)」を必須項目)
- baseline snapshot 定期再生成ルール(月次 or 主要マージ後に baseline を疑う検証ステップ)
- **実機確認結果の昇格フロー**(O-4):違和感 → 当該プロジェクト Postmortem → 仕様書テンプレートへの反映 → DevSecOps 改訂

### 2.4 Assumption Safety(仮定駆動の防止)

**目的**: Claude.ai / Codex / 髙橋さんの **認知バイアスを制度的に抑える**。「だいたいこうだろう」を「実値で確認」に置き換える。

**核心原則**: Claude.ai は git にも localStorage にも直接アクセスできず、動的状態を assume するバイアスが常にある。Codex の厳格な検証が逆に運用ロスを生む構造を、prompt 書式の柔軟化で解決する。

**主な技法**:
- Claude.ai は Codex prompt 作成時、動的状態(git log / HEAD / file 一覧)を assume せず Claude Code で実値取得してから書く
- Codex 期待値書式の柔軟化(「上位 N 件は厳格、それ以下は順序のみ」「unsigned diff 期待値」)
- 「Green CI = 品質保証」誤認の明文化否定(test 緑 ≠ 実機 OK、baseline 緑 ≠ レイアウト正常)

### 2.5 U-3 仕様書テンプレートと O-1 運用ルール文書の責務境界【v1.1 新設】

ChatGPT Full Review Must Fix 3 への対応。U-3 と O-1 の責務分担を以下に固定する:

| 責務軸 | U-3(仕様書テンプレート) | O-1(運用ルール文書) |
|---|---|---|
| 観点 | **What / Why** | **How / Where / When** |
| 対象 | ユーザーへの「要求・期待体験」 | 検証時の「手順・環境・禁止事項」 |
| 例 1 | 初回利用時に何が見えるべきか | プライベートブラウズ時は localStorage 空として扱う |
| 例 2 | タップ時に何が変わるべきか | 通常タブで実機確認する |
| 例 3 | 狭画面でも何が維持されるべきか | 実機確認前にマスタデータ投入状態を確認する |
| 例 4 | (該当せず) | revert 後は VRT 再走する |
| 例 5 | (該当せず) | baseline snapshot をいつ疑うか |

この境界が固定されていないと、Full 版で仕様書テンプレートと運用ルール文書が **二重管理** になる。境界を明示することで、各文書の責務が明確化される。

---

## §3 16 項目の標準対策(P0 / P1 / P2 優先度付き)

**P0 = v2.0 完成と同時に着手 / P1 = Phase 2 で着手 / P2 = Full 版完成後の追加項目**

### 3.1 Layout Safety(L-1〜L-7)

| # | 対策 | 優先度 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|---|
| L-1 | mobile/desktop 両 VRT 必須化(`visual_regression_mobile.spec.js`) | P0 | 障害 1, 2 / パターン A | ✅ shogi A-4.5 | playwright.config.js で project 分離 + testIgnore 制御 |
| L-2 | bounding box 実測 e2e ヘルパー化(縦書き化検出) | P0 | 障害 1, 2 / パターン A | ✅ shogi A-4.5 | `expectNotVerticalText(locator)` ヘルパー化 |
| L-3 | Overflow 検出ヘルパーを全画面 e2e の標準アサート化 | P1 | 障害 1 / パターン A | ⏳ | `expectNoOverflow(locator)` ヘルパー、scrollWidth > clientWidth で検出 |
| L-4 | Layout assertion 標準化(行高さ・要素並び制約を仕様書 §4 に明示要件化) | P1 | 障害 1 / パターン A | ⏳ | 仕様書テンプレート(U-3)に組み込み |
| L-5 | bounding box 閾値に height/width 比併用(Codex A-4.5 提案) | P1 | 障害 1, 2 / パターン A | ⏳ | L-2 ヘルパーに比率閾値を追加 |
| L-6 | Playwright WebKit + iPhone device project 追加(Codex A-4.5 提案) | P2 | 障害 1 / パターン A | ⏳ | playwright.config.js に webkit-iphone project 追加 |
| L-7 | visual `maxDiffPixelRatio` を 0.05 → 0.01 に厳格化(Codex A-4.6 提案) | P2 | 障害 1 / パターン A | ⏳ | visual_regression*.spec.js の OPT を更新 |

### 3.2 UX Safety(U-1〜U-3)

| # | 対策 | 優先度 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|---|
| U-1 | §0 ユーザーストーリー必須項目化:タップ即時視覚フィードバック / 初回利用時挙動 / 狭画面破綻なし | P0 | 障害 3, 4 / パターン B | ⏳ | 仕様書テンプレート(U-3)に組み込み |
| U-2 | §6 Devil's Advocate 必須項目化:実機目視テスト観点(色 / 配置 / 触感) / 初回ユーザー体験 | P1 | 障害 3 / パターン B | ⏳ | 仕様書テンプレート(U-3)に組み込み |
| U-3 | 仕様書テンプレート `docs/specs/_spec_template.md` 新設 | P0 | 障害 3, 4 / パターン B | ⏳ | DevSecOps v2.0 と並行で作成 |

### 3.3 Operational Safety(O-1〜O-4)

| # | 対策 | 優先度 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|---|
| O-1 | 実機テスト = 通常タブ運用ルール明文化 | P1 | 障害 4 / パターン B | ⏳ | `docs/specs/_operational_rules.md` 新設 |
| O-2 | revert 後の状態検証手順必須化 | P0 | 障害 2 / パターン D | ⏳ | revert PR テンプレートに「revert 先動作確認(実機 + VRT 再走)」項目 |
| O-3 | baseline snapshot 定期再生成ルール | P2 | 障害 2 / パターン D | ⏳ | `_operational_rules.md` に「月次 baseline 再生成」セクション |
| O-4【新】 | 実機確認結果の昇格フロー明文化(違和感 → Postmortem → 仕様書テンプレート → DevSecOps 改訂) | P1 | 障害 3, 4 / パターン B, D | ⏳ | `_operational_rules.md` に「実機違和感の昇格手順」セクション |

### 3.4 Assumption Safety(A-1〜A-3)

| # | 対策 | 優先度 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|---|
| A-1 | Claude.ai は動的状態を assume せず実値取得 | P0 | 障害 5 / パターン C | ⏳ | `_operational_rules.md` に Claude.ai 自己ルール明記 |
| A-2 | Codex 期待値書式の柔軟化 | P1 | 障害 5 / パターン C | ⏳ | Codex review prompt テンプレート整備(`_codex_review_template.md`) |
| A-3 | 「Green CI = 品質保証」誤認の明文化否定 | P0 | 障害 2 / パターン D | ⏳ | `_operational_rules.md` の「品質保証の階層」セクション |

### 3.5 P0 項目サマリ(Phase 0 / Phase 1 で完了すべき項目)

| 系統 | P0 項目 |
|---|---|
| Layout | L-1, L-2(✅ 完了済) |
| UX | U-1, U-3 |
| Operational | O-2 |
| Assumption | A-1, A-3 |

合計 **新規 P0 5 項目**(U-1 / U-3 / O-2 / A-1 / A-3)。これが Phase 1 までに整備される最小セット。

---

## §4 適用ロードマップ(段階導入、Phase 0 / 1 / 2 / 3)

ChatGPT Full Review Must Fix 2 への対応。「同時展開」を排し、**段階導入** とする。

### 4.1 Phase 0: shogi のみで v2.0 Slim を検証

| 期間 | 対象 | 内容 |
|---|---|---|
| Slim v1.1 配置〜Codex Full Review A 取得 | shogi のみ | DevSecOps v2.0 Slim の方針が運用可能か検証 |

shogi 上で Slim v1.1 が運用可能と確認されてから Phase 1 に進む。

### 4.2 Phase 1: 全 6 プロジェクトに **最小 P0 セット** のみ適用

| 期間 | 対象 | 内容 |
|---|---|---|
| Phase 0 完了後〜2 週間 | 全 6 プロジェクト | A-1 / A-3 / O-2 + 必要に応じて O-1 を `_operational_rules.md` 経由で適用 |

コード変更を伴わない最小セット(運用ルール明文化のみ)から開始。

### 4.3 Phase 2: UI ありプロジェクトに **Layout / UX Safety** を自然な実装タイミングで導入

| 期間 | 対象 | 内容 |
|---|---|---|
| Phase 1 完了後〜随時 | shogi(A-5 系前) / golf-compe(P1 前) / shogi-coach(Phase 2 前) | L-3〜L-5 + U-1〜U-3 を Sprint で順次実装 |
| 後続 | x-support | UI 軽量、必要時 L-1〜L-2 のみ |

### 4.4 Phase 3: v2.0 Full / Appendix 確定後に全 6 プロジェクトへ同期展開

| 期間 | 対象 | 内容 |
|---|---|---|
| v2.0 Full 完成後 | 全 6 プロジェクト | L-6, L-7, O-3, A-2 を含む全 16 項目を統一適用、v1.2 final からの archive 移行も実施 |

### 4.5 UI なしプロジェクト向け読み替え方針【v1.1 新設、Must Fix 4】

bp-matching / file-organizer のような UI なしプロジェクトでは、**Layout Safety を以下に読み替える**。これらは 5 番目の Safety 系統として増やさず、Appendix で詳細化する。

| プロジェクト | 読み替え後の Safety 観点 | 具体例 |
|---|---|---|
| bp-matching(Excel/CLI 中心) | **Spreadsheet Layout Safety** | 列構造破損 / 数式破損 / シート参照破損 / 結合セル起因の挿入破綻 / テーブル範囲破損 |
| file-organizer(CLI 中心) | **Output Layout / File Placement Safety** | 出力ファイル配置破綻 / 分類結果の誤配置 / unknown 増加 / 上書き・削除事故 / ログ追跡不能 |

---

## §5 受け入れ条件(4 段階に分割、Should Fix 4)

### 5.1 Slim v1.1 完成条件

| # | 条件 | 状態 |
|---|---|---|
| 1 | 4 系統 Safety の概念と主責務分類が明記されている | ✅(本書 §0.2 / §2 冒頭) |
| 2 | 16 項目の対策がすべて記述、優先度 P0/P1/P2 付与 | ✅(本書 §3) |
| 3 | shogi の L-1, L-2 完了状態が反映 | ✅(本書 §3.1) |
| 4 | v1.2 final 6 手段マッピング表が記載 | ✅(本書 §0.3) |
| 5 | U-3 / O-1 責務境界が明文化 | ✅(本書 §2.5) |
| 6 | 段階導入(Phase 0〜3)が記載 | ✅(本書 §4) |
| 7 | UI なしプロジェクト読み替えが記載 | ✅(本書 §4.5) |
| 8 | v1.2 final 5 ファイル扱いが「共存→移行→archive」と明記 | ✅(本書 §0.3 / §8) |
| 9 | ChatGPT Full Review A 以上 | ⏳ v1.1 で再投入 |

### 5.2 v2.0 Full 完成条件

| # | 条件 |
|---|---|
| 1 | Slim v1.1 が ChatGPT + Codex 両方で A 以上判定 |
| 2 | L-3〜L-7 の Playwright API 実装方針が具体化されている |
| 3 | U-3 仕様書テンプレートが新設されている |
| 4 | O-1 運用ルール文書が新設されている |
| 5 | Codex review prompt テンプレート(A-2)が整備されている |
| 6 | Appendix が完成している(下記 5.3 参照) |

### 5.3 shogi 適用開始条件

| # | 条件 |
|---|---|
| 1 | Phase 0 で Slim v1.1 が shogi で運用可能と確認 |
| 2 | Phase 1 の P0 5 項目(U-1 / U-3 / O-2 / A-1 / A-3)が `_operational_rules.md` + `_spec_template.md` 経由で配置 |
| 3 | A-5 系着手時に Phase 2(L-3〜L-5 + U-1〜U-3)を実装 |

### 5.4 全 6 プロジェクト展開条件

| # | 条件 |
|---|---|
| 1 | shogi が Phase 2 まで完了 |
| 2 | v2.0 Full + Appendix 完成 |
| 3 | v1.2 final 5 ファイルとの差分表が完成 |
| 4 | v1.2 final が完全包含されたと確認 |
| 5 | 各プロジェクト別導入チェックリスト(Appendix)が完成 |

---

## §6 レビュー観点(必読)

### 6.1 レビュー深度

過去メモリ #22 に基づき、本書は **Heavy / Full Review** 必須。

- **ChatGPT Full Review**: 概念整理 / 4 系統の網羅性 / 仕様書テンプレートの妥当性 / v1.2 final との整合性
- **Codex Full Review**: 具体的実装手段(L-3〜L-7 の Playwright API 妥当性、e2e ヘルパー設計、playwright.config.js 拡張)
- **セルフ Devil's Advocate 8 観点**: 過去 v1.2 final 採用の手法

### 6.2 Devil's Advocate 8 質問への回答(v1.1 で ChatGPT Full Review 経由で取得済)

ChatGPT Full Review v1 で 8 質問への回答が得られている。要旨:

1. **網羅性**: 4 系統で現時点 A-4 系障害は概ね網羅、5 番目の系統(Performance / Security / Accessibility)は将来の v2.1 で扱う
2. **過剰性**: 16 項目は維持、ただし優先度 P0/P1/P2 付与で対応(本書 §3 で実装)
3. **適用困難性**: UI なしプロジェクトは Spreadsheet/Output Layout Safety に読み替え(本書 §4.5)
4. **v1.2 final との重複・矛盾**: 矛盾なし、共存が妥当
5. **ロードマップ現実性**: 段階導入(Phase 0/1/2/3)で対応(本書 §4)
6. **shogi 偏重**: 抽象化された 4 系統は他プロジェクトにも有効、UI なし読み替えで補完
7. **粒度**: Slim 妥当、Full / Appendix 詳細化計画は本書 §7
8. **継続性**: v1.2 final は共存 → 移行 → archive(本書 §8)

---

## §7 Full / Appendix 詳細化計画【v1.1 新設、Should Fix 3】

### 7.1 v2.0 Full 版で詳細化する項目

| 項目 | 内容 |
|---|---|
| L-3〜L-7 の Playwright 実装 | helper 設計、playwright.config.js 拡張、コード例 |
| U-3 仕様書テンプレート | `_spec_template.md` の本体、§0 / §6 必須項目チェックリスト |
| O-1 運用ルール文書 | `_operational_rules.md` の本体、O-1〜O-4 詳細 |
| A-2 Codex prompt テンプレート | `_codex_review_template.md` の本体、期待値書式の柔軟化例 |

### 7.2 v2.0 Appendix で詳細化する項目

| 項目 | 内容 |
|---|---|
| Appendix A | shogi A-4 系障害 ↔ 16 項目対応表 |
| Appendix B | UI なしプロジェクト向け読み替え表(bp-matching / file-organizer 詳細) |
| Appendix C | v1.2 final 6 手段との詳細差分表 |
| Appendix D | 6 プロジェクト別導入チェックリスト |

---

## §8 想定外時の対応 + v1.2 final 扱い + 将来拡張

### 8.1 想定外時の対応

- **ChatGPT / Codex review で Must Fix が大量に出た場合**: 本 Slim → Full への 2 段階展開で対処
- **shogi の Phase 2 実装中に追加発見があった場合**: Postmortem v3 として追記、本書 §3 を更新
- **bp-matching のような UI なしプロジェクトでの適用問題**: §4.5 の読み替え表を更新

### 8.2 v1.2 final ファイル(shogi-coach 配置済 5 ファイル)の扱い【v1.1 確定】

**3 段階方針**:

| 段階 | 内容 | タイミング |
|---|---|---|
| 1. 共存 | v1.2 final は「現行安定版」として維持、v2.0 Slim は shogi 先行の追加 Safety レイヤーとして扱う | 現在〜Phase 2 完了 |
| 2. 移行 | v2.0 Full + Appendix 完成、v1.2 final との差分表(Appendix C)作成、v2.0 が v1.2 final の 6 手段を完全包含することを確認 | Phase 3 |
| 3. archive | v1.2 final 5 ファイルに「v2.0 へ移行済み」リンクを追加し archive 化、shogi-coach 配置済の 5 ファイルは ` _archive/` サブディレクトリに移動 | Phase 3 完了後 |

**いきなり archive は禁止**。v2.0 Slim はまだ shogi A-4 系障害起点であり、v1.2 final の全守備範囲を置換できるとは限らない。

### 8.3 将来拡張(v2.1 以降)【v1.1 新設、Devil's Advocate 1 への回答】

現時点の v2.0 は A-4 系障害を根拠にした 4 系統に限定するが、以下は将来事故または要件が顕在化した場合に **v2.1 または別 Appendix** で扱う:

- **Performance Safety**: レンダリング速度、e2e 実行時間、build 時間などの劣化検出
- **Security Safety**: AI 自動コード生成における脆弱性、依存ライブラリ脆弱性、機密情報漏洩
- **Accessibility Safety**: WCAG 準拠、スクリーンリーダー対応、キーボードナビゲーション

これらは v2.0 では対象外 とする。

---

## §9 次のアクション

| 優先度 | アクション | 担当 | タイミング |
|---|---|---|---|
| 高 | Slim v1.1 を ChatGPT Full Review に再投入 | 髙橋さん経由 | 本セッション |
| 高 | A 以上判定取得後、Codex Full Review に投入 | 髙橋さん経由 | ChatGPT A 取得後 |
| 高 | Codex A 以上判定取得後、Full 版作成(各項目の詳細実装、コード例含む) | Claude.ai | 次セッション |
| 中 | `_operational_rules.md` ドラフト作成(Phase 1 で必要) | Claude.ai | DevSecOps v2.0 Full 完成と並行 |
| 中 | `_spec_template.md` ドラフト作成(Phase 1 で必要) | Claude.ai | DevSecOps v2.0 Full 完成と並行 |
| 中 | shogi に v2.0 Slim を docs/specs/ 配置(v1 上書き or 別ファイル) | Claude Code | Codex A 取得後 |
| 低 | 他 5 プロジェクトに Slim 配置 | Claude Code | Phase 1 開始時 |
