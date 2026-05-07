# DevSecOps v2.0「4 系統 Safety 宣言」Slim 仕様書 ドラフト v1

**作成日時**: 2026-05-08 00:15 JST
**版**: v2.0 ドラフト v1(Slim)
**前版**: DevSecOps v1.2 final(2026-05-04、ChatGPT review A- 評価、shogi-coach docs/specs/ 5 ファイル配置済)
**根拠資料**: `docs/specs/_postmortem_a4_series.md` v2(2026-05-08)
**作成者**: Claude.ai
**レビュー予定**: Heavy / Full Review(ChatGPT + Codex 両方、Devil's Advocate 8 観点)
**対象プロジェクト**: shogi / golf-compe / bp-matching / x-support / file-organizer / shogi-coach の全 6 プロジェクト

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
| **Operational Safety** | revert 後の状態検証漏れ、baseline 過信、運用ルール暗黙化 | 障害 2, 4 |
| **Assumption Safety** | Claude.ai 動的状態 assume ミス、Green CI 誤認、認知バイアス | 障害 5、パターン D |

### 0.3 v1.2 final からの差分

- v1.2 の 6 手段(業務モデル文書 / §0 US / Devil's Advocate / Mutation Testing / expectClickable / Contract Testing)は **すべて継承** し、v2.0 の Layout / UX / Operational / Assumption Safety の各系統に内包される
- v2.0 では新たに **16 項目の標準対策**(L-1〜L-7 / U-1〜U-3 / O-1〜O-3 / A-1〜A-3)を追加
- shogi A-4.5 で L-1, L-2 を実装済(✅)、残り 14 項目を v2.0 で正式化

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

### 1.2 v2.0 の問題意識

A-4 系 5 障害から抽出された **共通パターン 4 つ** に対応する、**領域別 Safety 系統** を定義する:

| パターン | 概要 | 対応 Safety 系統 |
|---|---|---|
| A | AI 全体が「実機の見た目」を見ていない | Layout Safety |
| B | ユーザー視点が仕様書に含まれない | UX Safety |
| C | Claude.ai の動的状態把握が不完全 | Assumption Safety |
| D | 「既存正常状態」への過信(revert / baseline / Green CI を無検証で正常扱い) | Operational + Assumption Safety |

詳細は `docs/specs/_postmortem_a4_series.md`(v2)を参照。

---

## §2 4 系統 Safety の詳細

### 2.1 Layout Safety(レイアウト破綻防止)

**目的**: 物理的なレイアウト崩れを **機械的に検出** する。「実機の見た目」を AI 全体(Claude.ai / Claude Code / Codex)が直接見られなくても、自動化された検証で破綻を捕捉する。

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

**核心原則**: AI 全体(Claude.ai / Codex)は「機能整合性」「設計整合性」「e2e の検証根拠」で完結しがちで、**「ユーザーが触ったときの感覚」を直接見ない**。これを仕様書テンプレートで強制的に意識させる。

**主な技法**:
- §0 ユーザーストーリー必須項目化:タップ時の即時視覚フィードバック / 初回利用時(localStorage 空 / プライベートブラウズ)挙動 / 狭画面行レイアウト破綻なし
- §6 Devil's Advocate 必須項目化:実機目視確認のテスト観点(色 / 配置 / 触感) / 初回ユーザー体験
- 仕様書テンプレート(`docs/specs/_spec_template.md`)新設 + チェックリスト化

### 2.3 Operational Safety(運用安全)

**目的**: 実機テスト・revert・baseline 等の **運用フローを明文化** する。「暗黙のルール」を制度化する。

**核心原則**: 暗黙の運用ルールはメモリへの個別記録止まりで、運用ドキュメントへの昇格フローが弱い。`docs/specs/_operational_rules.md` を新設して常駐参照ドキュメント化する。

**主な技法**:
- 実機テスト = 通常タブ運用ルール明文化(`_operational_rules.md`)
- revert 後の状態検証手順必須化(revert PR には「revert 先の動作確認(実機 + VRT 再走)」を必須項目)
- baseline snapshot 定期再生成ルール(月次 or 主要マージ後に baseline を疑う検証ステップ)

### 2.4 Assumption Safety(仮定駆動の防止)

**目的**: Claude.ai / Codex / 髙橋さんの **認知バイアスを制度的に抑える**。「だいたいこうだろう」を「実値で確認」に置き換える。

**核心原則**: Claude.ai は git にも localStorage にも直接アクセスできず、動的状態を assume するバイアスが常にある。Codex の厳格な検証が逆に運用ロスを生む構造を、prompt 書式の柔軟化で解決する。

**主な技法**:
- Claude.ai は Codex prompt 作成時、動的状態(git log / HEAD / file 一覧)を assume せず Claude Code で実値取得してから書く
- Codex 期待値書式の柔軟化(「上位 N 件は厳格、それ以下は順序のみ」「unsigned diff 期待値」)
- 「Green CI = 品質保証」誤認の明文化否定(test 緑 ≠ 実機 OK、baseline 緑 ≠ レイアウト正常)

---

## §3 16 項目の標準対策

### 3.1 Layout Safety(L-1〜L-7)

| # | 対策 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|
| L-1 | mobile/desktop 両 VRT 必須化(`visual_regression_mobile.spec.js`) | 障害 1, 2 / パターン A | ✅ shogi A-4.5 | playwright.config.js で project 分離 + testIgnore 制御 |
| L-2 | bounding box 実測 e2e ヘルパー化(縦書き化検出) | 障害 1, 2 / パターン A | ✅ shogi A-4.5 | `expectNotVerticalText(locator)` ヘルパー化 |
| L-3 | Overflow 検出ヘルパーを全画面 e2e の標準アサート化 | 障害 1 / パターン A | ⏳ | `expectNoOverflow(locator)` ヘルパー、scrollWidth > clientWidth で検出 |
| L-4 | Layout assertion 標準化(行高さ・要素並び制約を仕様書 §4 に明示要件化) | 障害 1 / パターン A | ⏳ | 仕様書テンプレート(U-3)に組み込み |
| L-5 | bounding box 閾値に height/width 比併用(Codex A-4.5 提案) | 障害 1, 2 / パターン A | ⏳ | L-2 ヘルパーに比率閾値を追加 |
| L-6 | Playwright WebKit + iPhone device project 追加(Codex A-4.5 提案) | 障害 1 / パターン A | ⏳ | playwright.config.js に webkit-iphone project 追加 |
| L-7 | visual `maxDiffPixelRatio` を 0.05 → 0.01 に厳格化(Codex A-4.6 提案) | 障害 1 / パターン A | ⏳ | visual_regression*.spec.js の OPT を更新 |

### 3.2 UX Safety(U-1〜U-3)

| # | 対策 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|
| U-1 | §0 ユーザーストーリー必須項目化:タップ即時視覚フィードバック / 初回利用時挙動 / 狭画面破綻なし | 障害 3, 4 / パターン B | ⏳ | 仕様書テンプレート(U-3)に組み込み、各仕様書 §0 でチェック必須 |
| U-2 | §6 Devil's Advocate 必須項目化:実機目視テスト観点(色 / 配置 / 触感) / 初回ユーザー体験 | 障害 3 / パターン B | ⏳ | 仕様書テンプレート(U-3)に組み込み、各仕様書 §6 でチェック必須 |
| U-3 | 仕様書テンプレート `docs/specs/_spec_template.md` 新設 | 障害 3, 4 / パターン B | ⏳ | DevSecOps v2.0 と並行で作成 |

### 3.3 Operational Safety(O-1〜O-3)

| # | 対策 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|
| O-1 | 実機テスト = 通常タブ運用ルール明文化 | 障害 4 / パターン B | ⏳ | `docs/specs/_operational_rules.md` 新設 |
| O-2 | revert 後の状態検証手順必須化 | 障害 2 / パターン D | ⏳ | revert PR テンプレートに「revert 先動作確認(実機 + VRT 再走)」項目 |
| O-3 | baseline snapshot 定期再生成ルール | 障害 2 / パターン D | ⏳ | `_operational_rules.md` に「月次 baseline 再生成」セクション |

### 3.4 Assumption Safety(A-1〜A-3)

| # | 対策 | 対応障害 / パターン | 状態 | 想定実装 |
|---|---|---|---|---|
| A-1 | Claude.ai は動的状態を assume せず実値取得 | 障害 5 / パターン C | ⏳ | `_operational_rules.md` に Claude.ai 自己ルール明記 |
| A-2 | Codex 期待値書式の柔軟化 | 障害 5 / パターン C | ⏳ | Codex review prompt テンプレート整備(`_codex_review_template.md`) |
| A-3 | 「Green CI = 品質保証」誤認の明文化否定 | 障害 2 / パターン D | ⏳ | `_operational_rules.md` の「品質保証の階層」セクション |

---

## §4 適用ロードマップ

### 4.1 マトリックス(プロジェクト × 系統)

| プロジェクト | Layout Safety | UX Safety | Operational Safety | Assumption Safety |
|---|---|---|---|---|
| shogi | L-1, L-2 ✅ / L-3〜L-7 を A-5 系前に Sprint で実装 | A-5 系から U-1〜U-3 適用 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |
| golf-compe | P1 着手前に L-1〜L-7 設計反映 | P1 着手前に U-1〜U-3 適用 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |
| bp-matching | UI なし(Excel/CLI 中心)→ Layout Safety 該当低 | 操作フローの初回利用時挙動を U-1 に追加 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |
| x-support | UI 軽い → 必要時 L-1〜L-2 のみ | U-1〜U-3 適用 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |
| file-organizer | UI なし → Layout Safety 該当低 | 操作フローの U-1 に追加 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |
| shogi-coach | Phase 2 着手前に L-1〜L-7 設計反映 | Phase 2 着手前に U-1〜U-3 適用 | DevSecOps v2.0 完成と同時 | DevSecOps v2.0 完成と同時 |

### 4.2 順序

UX / Operational / Assumption Safety は **コード変更なし** で全プロジェクトに先行適用可能。Layout Safety は実装フェーズに依存し、各プロジェクトの自然な作業タイミングで段階導入する。

### 4.3 shogi 適用詳細

| 段階 | 内容 | タイミング |
|---|---|---|
| 1 | DevSecOps v2.0 仕様書化(本書 + Full + Appendix) | 本セッション〜次セッション |
| 2 | `_operational_rules.md` 新設(O-1, O-3, A-1, A-3 を記述) | DevSecOps v2.0 と並行 |
| 3 | `_spec_template.md` 新設(U-1, U-2, L-4 を記述) | DevSecOps v2.0 と並行 |
| 4 | shogi e2e ヘルパー拡張(L-3, L-5)+ playwright.config.js 拡張(L-6, L-7) | A-5 系着手前の Sprint |
| 5 | revert PR テンプレート整備(O-2)+ Codex review prompt テンプレート整備(A-2) | DevSecOps v2.0 完成後 |

---

## §5 受け入れ条件(v2.0 完成判定)

| # | 条件 | 状態 |
|---|---|---|
| 1 | 4 系統 Safety の概念が仕様書に明記されている | ✅(本書 §2) |
| 2 | 16 項目の対策がすべて記述されている(対応する障害 / パターン明示) | ✅(本書 §3) |
| 3 | shogi の L-1, L-2 完了状態が反映されている | ✅(本書 §3.1) |
| 4 | 仕様書テンプレート(U-3)が新設されている | ⏳ DevSecOps v2.0 と並行 |
| 5 | 運用ルール文書(O-1)が新設されている | ⏳ DevSecOps v2.0 と並行 |
| 6 | Codex Full Review A 以上 + ChatGPT Full Review A 以上の二重レビュー通過 | ⏳ 本書 Slim → Full の流れで取得 |
| 7 | v1.2 final からの移行ステップ(継承内容と新規追加内容の境界)が明記されている | ✅(本書 §0.3) |

---

## §6 レビュー観点(必読)

### 6.1 レビュー深度

過去メモリ #22 に基づき、本書は **Heavy / Full Review** 必須。

- **ChatGPT Full Review**: 概念整理 / 4 系統の網羅性 / 仕様書テンプレートの妥当性 / v1.2 final との整合性
- **Codex Full Review**: 具体的実装手段(L-3〜L-7 の Playwright API 妥当性、e2e ヘルパー設計、playwright.config.js 拡張)
- **セルフ Devil's Advocate 8 観点**: 過去 v1.2 final 採用の手法

### 6.2 Devil's Advocate 質問(必須回答)

1. **網羅性**: 4 系統で本当に網羅的か?5 番目の系統(例:Performance Safety / Security Safety / Accessibility Safety)は不要か?該当障害は将来発生しないと判断できる根拠は?
2. **過剰性**: 16 項目で過剰でないか?優先度の低い項目を削るべきか?
3. **適用困難性**: shogi 以外のプロジェクトで適用困難な項目はないか?(bp-matching の UI なしプロジェクトでの Layout Safety、など)
4. **v1.2 final との重複・矛盾**: 既存の 6 手段との関係が整合しているか?
5. **ロードマップの現実性**: 髙橋さんの実工数で消化可能か?(全 16 項目を全 6 プロジェクトで完了するのに必要な期間の概算)
6. **shogi 偏重**: A-4 系障害を根拠にしているため shogi の特殊事情(GitHub Pages public、localStorage ベース)に引きずられていないか?
7. **粒度**: Slim としての粒度は妥当か?Full / Appendix で詳細化すべき項目はどれか?
8. **継続性**: v2.0 採用後、v1.2 final ファイル(shogi-coach 配置済 5 ファイル)はどう扱う?archive 化、移行、共存どれか?

---

## §7 想定外時の対応

- **ChatGPT / Codex review で Must Fix が大量に出た場合**: 本 Slim → Full への 2 段階展開で対処(まず Slim で大枠合意 → Full で詳細詰める)
- **shogi の L-3〜L-7 実装中に追加発見があった場合**: Postmortem v3 として追記、本書 §3 を更新
- **bp-matching のような UI なしプロジェクトでの適用問題**: 4.1 マトリックスを更新し「該当低」項目を明示

---

## §8 次のアクション

| 優先度 | アクション | 担当 | タイミング |
|---|---|---|---|
| 高 | 本 Slim ドラフト v1 を ChatGPT / Codex Full Review に投入 | 髙橋さん経由 | 本セッション完了後 |
| 高 | レビュー A 判定取得後、Full 版作成(各項目の詳細実装、コード例含む) | Claude.ai | 次セッション |
| 中 | `_operational_rules.md` ドラフト作成 | Claude.ai | DevSecOps v2.0 Full 完成と並行 |
| 中 | `_spec_template.md` ドラフト作成 | Claude.ai | DevSecOps v2.0 Full 完成と並行 |
| 中 | shogi に v2.0 Slim を docs/specs/ 配置 | Claude Code | レビュー A 判定取得後 |
| 低 | 他 5 プロジェクトに Slim 配置 | Claude Code | 全 6 プロジェクト同期化(v1.2 final と同様の運用) |
