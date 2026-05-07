# shogi A-4 系 Postmortem(事後検証)v2

**作成日時**: 2026-05-07 23:59 JST(v1)/ 2026-05-08 00:30 JST(v2)
**対象期間**: 2026-05-07 のうち A-4.3 マージから A-4.6 マージまで
**目的**: A-4 系で発生した複数の障害の根本原因を分析し、横断的な共通パターンを抽出して、DevSecOps v2.0「レイアウト破綻ゼロバグ宣言」の制度的再発防止策の根拠資料とする
**作成者**: Claude.ai
**レビュー**: ChatGPT Quick Review v1 → A-(軽微修正後 Go)→ Must Fix 3 件を v2 で反映済

**v2 改訂点**:
- 各障害の末尾を「直接原因 / 構造的根因」の 2 段に分離(Must Fix 1)
- パターン D「『既存正常状態』への過信」を追加(Must Fix 2)
- 再発防止策を 4 系統(Layout / UX / Operational / Assumption Safety)に再整理(Must Fix 3)

---

## 1. 全体タイムライン

| 時刻(JST) | 事象 | commit / status |
|---|---|---|
| 19:34 | A-4.3 仕様書配置 | docs |
| 19:59 | A-4.3 Codex review request 配置 | docs |
| (続く) | A-4.3 Codex Gate Review A 判定取得 → main マージ | `ba76473` |
| (実機確認後) | 髙橋さん「前回 B(薄琥珀色) と現 B 登録済(濃琥珀色+✓)が紛らわしい」UX 違和感を指摘 | A-4.4 へ |
| 21:45 | A-4.4 仕様書(2 セクション分離 + 行内「現在:Xクラス」)配置 | docs |
| (続く) | A-4.4 Codex Gate Review A 判定取得 → main マージ | `0ad3099` |
| (実機確認) | **iPhone 375px 実機で行内要素増加により flex 破綻、氏名が縦書き化** | **P0 障害** |
| (即時) | A-4.4 revert | `a66f418` |
| 22:53 | A-4.5 仕様書(3 セクション分離)配置 | docs |
| 23:00 頃 | A-4.5 実装中、Claude Code が bounding box 実測で **A-4.3 main 時点から既に氏名 span が完全縦書き化(width=34px / height=105px)していた潜在問題を検出** | 既存 bug 発覚 |
| 23:00 頃 | 行 2 段レイアウト + mobile-375 VRT 新設で根本解決 | 実装拡張 |
| 23:10 | A-4.5 Codex review request 配置 | docs |
| 23:11 | Claude.ai が Codex prompt の `git log` 期待値を 7 件目に `ba76473` と書くミス(実際は `0ad3099` が 7 件目) | review 中止 → 訂正版で再開 |
| 23:30 頃 | A-4.5 Codex Gate Review A 判定取得 → main マージ | `cf7a970` |
| (実機確認後) | 髙橋さん「AB ボタンは選択したら色が変わるなどの工夫が欲しい」と指摘(色強調過剰撤廃が判明) | A-4.6 へ |
| 23:33 | A-4.6 仕様書(ボタン色強調復活)配置 | docs |
| 23:45 | A-4.6 Codex review request 配置 | docs |
| (続く) | A-4.6 Codex Gate Review A 判定取得 → main マージ | `d5f28ff` |
| (実機確認) | OK | A-4 系完了 |

---

## 2. 障害一覧と Root Cause Analysis(5 Whys + 直接原因 / 構造的根因)

### 障害 1: A-4.4 で iPhone 375px 行レイアウト破綻 → revert P0

**事象**: A-4.4 で「現在:Xクラス」テキスト span を行内追加 → main マージ後 iPhone 375px 実機で氏名が縦書き化、即時 revert。

**5 Whys**:
1. **なぜ破綻したか?** → 行内要素を増やしたことで flex 子要素が圧迫され、`overflow-wrap:anywhere` の氏名 span が極端に細い幅に押し込まれた。
2. **なぜ自動検出されなかったか?** → e2e の機能テスト(`toBeVisible` / `toHaveText`)は通ったが、レイアウト崩れは検出対象外だった。
3. **なぜレイアウト崩れを検出する仕組みがなかったか?** → `visual_regression.spec.js` は `chromium-desktop` project のみで撮影され、`mobile-375` project からは `testIgnore` されていた。同 spec 内で `setViewportSize({ width: 375 })` で 375px は撮っていたが、`devices['Desktop Chrome']` ベースの project では iOS Safari の rendering(タッチイベント、`hasTouch`、UA、`overflow-wrap` の挙動)が再現されない。
4. **なぜ Codex Devil's Advocate も「破綻可能性低い」と判定したか?** → Codex も `chromium-desktop` snapshot を見て判断しており、実機 iPhone の描画を見ていなかった。設計レビューは「コードと既存テスト snapshot」で完結する構造だった。
5. **なぜ Claude.ai も破綻を予測できなかったか?** → 頭の中でモック化したが、iPhone 375px 実画面の flex 圧迫を想像しきれなかった。仕様書 §0 ユーザーストーリーにも「狭い画面で行が破綻しない」というレイアウト要件が明記されていなかった。

**直接原因(検出設計欠陥)**:
- mobile-375 VRT 未導入(`devices['Desktop Chrome']` ベースでは iOS Safari rendering が再現されない)
- Layout assertion 不在(行高さ・要素並びを明示テスト化していなかった)
- bounding box 実測 e2e 不在(縦書き化の機械的検出手段がなかった)

**構造的根因**:
AI 全体(Claude.ai / Claude Code / Codex)が「実機 iPhone での見た目」を見ていない構造的欠陥。レイアウト系制約が仕様書 §0 / §4 に必須要件として書かれず、自動検証も穴があった。

---

### 障害 2: A-4.3 から潜在的に縦書き化していた既存問題

**事象**: A-4.5 実装中、Claude Code が bounding box 実測で「氏名 span が width=34px / height=105px = 完全縦書き化」を検出。これは A-4.4 だけでなく **A-4.3 main 時点から発生していた既存問題** だった。

**5 Whys**:
1. **なぜ縦書き化していたか?** → 行内 flex 構成で、A/B ボタン + 前回:Xクラス + 日付 を全部 1 段に並べたため、氏名 span に与えられる横幅が極端に小さく、`overflow-wrap:anywhere` で 1 文字ずつ縦に積まれた。
2. **なぜ A-4.3 マージ時に検出されなかったか?** → 実機目視確認が「全体動作」レベルで、レイアウト細部を見ていなかった。氏名は縦書きでも「見えてはいる」状態。
3. **なぜ自動検出されなかったか?** → 障害 1 と同じ。mobile-375 snapshot 不在 + bounding box 実測 e2e 不在。
4. **なぜ A-4.4 直後に気づかなかったか?** → revert で「A-4.3 状態に戻す」を当然視して、A-4.3 状態自体を疑わなかった。「直前の正常状態」と思い込んだ。
5. **なぜ A-4.5 実装中に気づけたか?** → A-4.4 失敗を契機に「行内が圧迫されると破綻する」という仮説を持ち、Claude Code が実測 e2e を書こうとして bounding box を取得 → 数値で異常を発見。仮説駆動の検証ステップが入って初めて見えた。

**直接原因(運用手順欠陥)**:
- revert 後の状態検証手順が未定義(「revert 先 = 正常」と無検証で復帰)
- baseline snapshot 再確認の運用ルール不在(「直前 main の VRT が緑 = 正常」と無条件信用)
- 障害 1 と同じ自動検証の穴

**構造的根因**:
「既存正常状態」への過信(後述パターン D)。revert 先 / baseline / Green CI / 既存 main を「安全な既知状態」と無検証で扱う認知バイアスが、Claude.ai / 髙橋さん双方にあった。

---

### 障害 3: A-4.5 で色強調過剰撤廃 → ユーザーフィードバック弱体化 → A-4.6 で部分復活

**事象**: A-4.5 で `pp-add-btn-active` / `pp-add-btn-highlight` を撤廃し、視覚言語をセクション位置のみに一本化。実機で「タップしたボタンがどれか分かりにくい」とユーザーから指摘 → A-4.6 で `pp-add-btn-active` のみ部分復活。

**5 Whys**:
1. **なぜ色強調を撤廃したか?** → A-4.4 失敗の轍を踏まないため、視覚言語をセクション位置に集約することで「行内要素を増やさない設計」を貫徹したかった。
2. **なぜユーザーフィードバックが弱くなったか?** → セクション間移動の動きはスクロール位置や件数によっては見えづらく、押下フィードバックとして即時性が弱い。
3. **なぜ事前に気づかなかったか?** → 仕様書 §0 のユーザーストーリーで「タップ時の即時視覚フィードバック」が要件として挙がっていなかった。設計時に「セクション分離だけで意図伝わる」と Claude.ai が判断した。
4. **なぜ Codex Devil's Advocate も妥当と判定したか?** → Codex は「設計の整合性」「e2e の検証根拠」を見るが、UX フィードバックの強弱は判定対象外。実機 UX 観点が Devil's Advocate の質問項目に含まれていなかった。
5. **なぜ実機テストでも見落とされかけたか?** → 髙橋さんが実機確認時に直接「色変えてほしい」と指摘してくれたため救われた。発見が遅れていれば本番運用で混乱を招いた可能性。

**直接原因(仕様書テンプレート欠陥)**:
- 仕様書 §0 ユーザーストーリーに「タップ時の即時視覚フィードバック」が必須項目化されていない
- 仕様書 §6 Devil's Advocate に UX 観点(色 / 配置 / 触感)が含まれない
- 「設計の整合性」と「ユーザー体験」が別軸であることが仕様書テンプレートに反映されていない

**構造的根因**:
ユーザー視点が AI 全体の判定基準から構造的に欠落している(Claude.ai は機能整合性、Codex は設計整合性、Claude Code は機能テストでそれぞれ完結し、誰も「ユーザーが触ったときの感覚」を直接見ない)。

---

### 障害 4: localStorage 空問題で「ボタン見えない」騒動

**事象**: 髙橋さんが iPhone でプライベートブラウズ(シークレット タブ)で開いたため、localStorage が空でマスタデータ不在 → 過去参加者ボタンが表示されない → 「機能が動かない」と誤報告。

**5 Whys**:
1. **なぜボタンが見えなかったか?** → プライベートブラウズで localStorage が空、マスタデータが読み込まれず過去参加者リストが空。
2. **なぜ気づくまで時間がかかったか?** → 「アプリの bug か、ブラウザ環境か」の切り分けが事前に明示されていなかった。
3. **なぜ Claude.ai が事前に明示しなかったか?** → 「実機テスト = 通常ブラウザで」が暗黙の前提だった。プライベートブラウズで開く可能性を考えていなかった。
4. **なぜ暗黙のままだったか?** → 過去に問題が出ていなかった。運用ルール文書に記述がなかった。
5. **なぜ運用ルール文書に記述がなかったか?** → 過去の問題発生時に「次に出ないように」明文化する仕組みが弱かった。発見の都度、メモリへの個別記録止まりだった。

**直接原因(運用ドキュメント欠陥)**:
- 実機テスト環境(通常タブ vs プライベートブラウズ / localStorage 空状態 / 初回利用時)の運用ルールが文書化されていない
- 仕様書 §0 ユーザーストーリーに「初回利用時(localStorage 空)挙動」が必須項目化されていない

**構造的根因**:
暗黙の運用ルールを明文化する仕組みが弱い。問題発生 → メモリ記録、で完結し、運用ドキュメント(`docs/specs/_operational_rules.md` 等)への昇格フローが定式化されていない。

---

### 障害 5: Claude.ai の Codex prompt 期待値ミス(commit 数 7 → 8)

**事象**: A-4.5 Codex review request で `git log --oneline -7` の 7 件目期待値を `ba76473`(A-4.3 commit)と記載。実際は 7 件目が `0ad3099`(A-4.4 revert された commit)、`ba76473` は 8 件目。Codex は厳格に「sync 不全」と判定して中止。

**5 Whys**:
1. **なぜ期待値が間違っていたか?** → A-4.4 commit `0ad3099` が後に revert されたが、git log には残っているのを忘れていた。
2. **なぜ忘れたか?** → revert 後の linear 履歴を頭の中で計算し、「revert 元 commit は履歴から消える」と誤った前提で数えた。
3. **なぜ計算ミスをしたか?** → Claude.ai が動的な状態(git log 出力)を assume で書いた。実値を Claude Code に取得させてから書く一手間を省いた。
4. **なぜ事前確認しなかったか?** → 「速度優先」で prompt を素早く出した。期待値の正確性より prompt 配置の速度を優先した。
5. **なぜ Codex が誤判定する形になったか?** → 私が prompt で「期待値と一致しない場合は中止」と厳格に書いたため、Codex は厳格に従った。期待値を緩めに書く(例:「N 件目以降の順序は問わない」)選択肢があった。

**直接原因(prompt 作成手順欠陥)**:
- Claude.ai が動的状態を assume で書く速度優先バイアス
- Codex 期待値書式が二値判定(完全一致 / 中止)で、N 件目以降の柔軟性がない

**構造的根因**:
Claude.ai は git にも localStorage にも直接アクセスできないため、動的状態を「だいたいこうだろう」で書く誘惑が常にある。実値取得の一手間を惜しむと、Codex の厳格な検証が逆に運用ロスを生む。

---

## 3. 共通パターン抽出(v2: パターン D 追加)

5 つの障害を束ねると、**4 つ** の構造的欠陥が見える。

### パターン A: AI 全体が「実機の見た目」を見ていない

**該当障害**: 1(A-4.4 破綻)、2(A-4.3 潜在問題)

- Claude.ai は頭の中のモックで判断
- Claude Code は機能 e2e を通すことで満足
- Codex は設計と既存 snapshot で判定
- **誰も実機 iPhone 375px の描画を直接見ていない**(髙橋さんの実機確認だけが唯一の窓)

これは設計上の構造的欠陥。実機相当の自動検証(mobile VRT / WebKit project / layout assertion)を入れない限り、髙橋さんの目だけが防衛線になる。

### パターン B: ユーザー視点が仕様書に含まれない

**該当障害**: 3(色強調過剰撤廃)、4(localStorage 騒動)

- 仕様書 §0 ユーザーストーリーは「機能を実現する」観点で書かれており、「ユーザーがどう感じるか」「初回利用時の挙動」「タップ時の即時フィードバック」のような UX 観点が抜けやすい
- §6 Devil's Advocate も「設計と実装の整合性」中心で、UX や運用環境の観点が弱い
- AI 全体(Claude.ai / Codex)が同じ盲点を共有しており、レビューで救えない

### パターン C: Claude.ai の動的状態把握が不完全

**該当障害**: 5(commit 期待値ミス)

- Claude.ai は git にも localStorage にも直接アクセスできない
- 動的な状態は Claude Code 経由で取得するか、髙橋さんに聞くしかない
- 速度優先で assume で書くと、Codex の厳格な検証が逆に運用ロスを生む

### パターン D【v2 追加】: 「既存正常状態」への過信

**該当障害**: 2(A-4.3 潜在問題、主)、副次的に他の障害でも発現

- **revert 先**を未検証で正常扱い(障害 2)
- **baseline snapshot** を無条件信用(VRT が緑 = レイアウト正常、と仮定)
- **Green CI** を品質保証と誤認(test 緑 ≠ 実機 OK)
- 「**前回通っていた**」を安全根拠にする
- **既存 main** を「動作確認済み」と仮定

これは単なる「実機見てない問題」(パターン A)ではなく、**「安全な既知状態」と無意識にみなす認知バイアス**。Claude.ai / Codex / 髙橋さん全員が共有しうる。DevSecOps v2.0 では「既存状態も疑う」前提を制度化する必要がある。

---

## 4. 制度的再発防止策(v2: 4 系統に再整理)

v1 の Phase 1〜5 を、対象領域別に **4 系統(Layout / UX / Operational / Assumption Safety)** に再整理した。各対策に「対応する障害 / パターン」を明記する。

### 4.1 Layout Safety(レイアウト破綻防止)

物理的なレイアウト崩れを機械的に検出する系統。

| # | 対策 | 対応障害 / パターン | 状態 |
|---|---|---|---|
| L-1 | mobile/desktop 両 VRT 必須化(`visual_regression_mobile.spec.js`) | 障害 1, 2 / パターン A | ✅ A-4.5 で実装済 |
| L-2 | bounding box 実測 e2e ヘルパー化(縦書き化検出) | 障害 1, 2 / パターン A | ✅ A-4.5 で実装済 |
| L-3 | Overflow 検出ヘルパー(`scrollWidth > clientWidth`)を全画面 e2e の標準アサート化 | 障害 1 / パターン A | ⏳ DevSecOps v2.0 |
| L-4 | Layout assertion 標準化(行高さ・要素並び制約を仕様書 §4 に明示要件化) | 障害 1 / パターン A | ⏳ DevSecOps v2.0 |
| L-5 | bounding box 閾値に **height/width 比併用**(Codex A-4.5 提案) | 障害 1, 2 / パターン A | ⏳ DevSecOps v2.0 |
| L-6 | Playwright **WebKit + iPhone device project** 追加(Codex A-4.5 提案) | 障害 1 / パターン A | ⏳ DevSecOps v2.0 |
| L-7 | visual `maxDiffPixelRatio` を 0.05 → 0.01 に厳格化(Codex A-4.6 提案) | 障害 1 / パターン A | ⏳ DevSecOps v2.0 |

### 4.2 UX Safety(ユーザー体験保護)

ユーザーが実際に触ったときの体験を仕様書段階で担保する系統。

| # | 対策 | 対応障害 / パターン | 状態 |
|---|---|---|---|
| U-1 | 仕様書 §0 ユーザーストーリーに **必須項目化**:「タップ時の即時視覚フィードバック」「初回利用時(localStorage 空 / プライベートブラウズ)挙動」「狭画面行レイアウト破綻なし」 | 障害 3, 4 / パターン B | ⏳ DevSecOps v2.0 |
| U-2 | 仕様書 §6 Devil's Advocate に **必須項目化**:「実機目視確認のテスト観点(色 / 配置 / 触感)」「初回ユーザー体験」 | 障害 3 / パターン B | ⏳ DevSecOps v2.0 |
| U-3 | 仕様書テンプレート(`docs/specs/_spec_template.md`)を新設し、§0 / §6 必須項目をチェックリスト化 | 障害 3, 4 / パターン B | ⏳ DevSecOps v2.0 と並行 |

### 4.3 Operational Safety(運用安全)

実機テスト・revert・baseline 等の運用フローを明文化する系統。

| # | 対策 | 対応障害 / パターン | 状態 |
|---|---|---|---|
| O-1 | 実機テスト = **通常タブ運用ルール** を `docs/specs/_operational_rules.md` に明文化 | 障害 4 / パターン B | ⏳ DevSecOps v2.0 と並行 |
| O-2 | **revert 後の状態検証手順** を必須化(revert PR には「revert 先の動作確認(実機 + VRT 再走)」を必須項目に) | 障害 2 / パターン D | ⏳ DevSecOps v2.0 |
| O-3 | **baseline snapshot 定期再生成ルール**(月次 or 主要マージ後に baseline を疑う検証ステップ) | 障害 2 / パターン D | ⏳ DevSecOps v2.0 |

### 4.4 Assumption Safety(仮定駆動の防止)

Claude.ai / Codex / 髙橋さんの認知バイアスを制度的に抑える系統。

| # | 対策 | 対応障害 / パターン | 状態 |
|---|---|---|---|
| A-1 | Claude.ai は Codex prompt 作成時、**動的状態(git log / HEAD / file 一覧)を assume せず Claude Code で実値取得してから書く** | 障害 5 / パターン C | ⏳ DevSecOps v2.0 と並行 |
| A-2 | Codex 期待値の書式を **柔軟化**:「上位 N 件は厳格、それ以下は順序のみ」「unsigned diff 期待値」など、誤検出を減らす書式テンプレート | 障害 5 / パターン C | ⏳ DevSecOps v2.0 |
| A-3 | **「Green CI = 品質保証」誤認の明文化否定**:test 緑 ≠ 実機 OK、baseline 緑 ≠ レイアウト正常、を運用ルールに明記 | 障害 2 / パターン D | ⏳ DevSecOps v2.0 |

---

## 5. まとめ:DevSecOps v2.0 仕様書への引き継ぎ事項

本 Postmortem から、DevSecOps v2.0 仕様書(改題候補:**「DevSecOps v2.0 4 系統 Safety 宣言」**)に以下を盛り込む。

### 5.1 守備範囲の宣言

「画面操作系バグ・レイアウト破綻バグ」だけでなく、4 系統の Safety を守備範囲に:

- **Layout Safety**:レイアウト破綻バグ(障害 1, 2)
- **UX Safety**:UX フィードバック弱体化バグ、初回利用時動作漏れ(障害 3, 4)
- **Operational Safety**:revert 後の状態検証漏れ、baseline 過信、運用ルール暗黙化(障害 2, 4)
- **Assumption Safety**:Claude.ai の動的状態 assume ミス、Green CI 誤認(障害 5, パターン D)

### 5.2 16 項目の標準対策

§4 の 4 系統(L-1〜L-7 / U-1〜U-3 / O-1〜O-3 / A-1〜A-3、計 16 項目)を仕様書本体に統合。各項目に「根拠となる過去障害 / パターン」を明記。実装フェーズも 4 系統に対応させる。

### 5.3 対象プロジェクト

shogi / golf-compe / bp-matching / x-support / file-organizer / shogi-coach の全 6 プロジェクト。

### 5.4 適用ロードマップ

| プロジェクト | Layout Safety | UX Safety | Operational Safety | Assumption Safety |
|---|---|---|---|---|
| shogi | L-1, L-2 完了、L-3〜L-7 を A-5 系前に着手 | A-5 系から仕様書テンプレート適用 | DevSecOps v2.0 並行 | DevSecOps v2.0 並行 |
| 他 5 プロジェクト | 各実装フェーズに合わせて段階導入 | 仕様書テンプレート先行適用 | DevSecOps v2.0 並行 | DevSecOps v2.0 並行 |

UX / Operational / Assumption Safety は **コード変更なしで全プロジェクトに先行適用可能**。Layout Safety は実装フェーズに依存。

---

## 6. 本 Postmortem の限界

- **Claude.ai 側の判断ログ自体が残っていない**:過去の prompt / response をすべて再現できないため、「なぜそう判断したか」の一部は推測を含む。今後は重要な設計判断を `docs/specs/<phase>_decision_log.md` に明示記録することを推奨。
- **Codex / ChatGPT の判断ロジックも不透明**:Devil's Advocate が「なぜ UX 観点を見ない設計になっているか」の根本は、外部 AI の限界として受け入れる必要がある。
- **本 Postmortem 自体に見落としがある可能性**:v1 → v2 で ChatGPT Quick Review を経て改善したが、追加の見落としがあれば DevSecOps v2.0 仕様書化の中で検出することを期待。

---

## 7. アクションアイテム(優先度順)

| 優先度 | アクション | 担当 | 期限目安 |
|---|---|---|---|
| 高 | DevSecOps v2.0 仕様書(`docs/specs/_devsecops_v2_4_safety.md` または類似)を本 Postmortem v2 に基づき作成 | Claude.ai 設計 → Codex Full Review | A-4.6 後の次セッション |
| 高 | shogi の Layout Safety L-3〜L-7 を順次実装 | Claude Code | DevSecOps v2.0 仕様書化後 |
| 中 | 仕様書テンプレート(`docs/specs/_spec_template.md`)を新設し UX Safety §0 / §6 必須項目化を反映 | Claude.ai | DevSecOps v2.0 と並行 |
| 中 | 運用ルール文書(`docs/specs/_operational_rules.md`)を新設し Operational + Assumption Safety を記述 | Claude.ai | DevSecOps v2.0 と並行 |
| 低 | 他 5 プロジェクトに UX / Operational / Assumption Safety を先行展開 | Claude.ai 各プロジェクト | DevSecOps v2.0 完成後 |

---

## 付録 A: ChatGPT Quick Review v1 → v2 修正対応表

| Must Fix | v1 の問題 | v2 の対応 |
|---|---|---|
| 1 | 「根因」と「直接原因」が一部混在(障害 1, 2) | 全 5 障害の末尾を「直接原因 / 構造的根因」2 段に統一 |
| 2 | 共通パターンに「baseline 過信」が抜け | パターン D「『既存正常状態』への過信」を追加(障害 2 主) |
| 3 | 対策 ⑧〜⑫ がレイアウト系に偏りすぎ | 4 系統(Layout / UX / Operational / Assumption Safety)に再整理、計 16 項目に番号体系再設計(L-N / U-N / O-N / A-N) |
